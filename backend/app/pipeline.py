"""
Assessment AI -- verification of any answer, not just the scripted ones.

    question, answer text, citations supplied with it
      -> claims          model extraction, or a rule-based sentence split
                         when no model is available (labelled as such)
      -> offsets         found by code in the original answer; a quote that
                         cannot be found is dropped, never trusted
      -> retrieval       the verifier's own lexical search over the policy
                         versions in force on the question's date, plus the
                         older versions they replaced
      -> screening       retrieved text that reads like an instruction is
                         flagged and removed before any model sees it
      -> figures         amounts, %, bps, times, durations compared with the
                         current approved passage on the same point (code)
      -> support         model judge, which must quote the passage it rests
                         on; a quote not found in the passage is rejected
      -> rule checks     citations, freshness, cross-referencing (code)
      -> answer review   intent and self-consistency (model)
      -> index, band     computed from the results above

When the model is unavailable, the steps that need it say so: the claims it
would have judged are "Not checked", the checks it runs are "Not run", the
result is marked partial, and the reliability index is capped below High.
Nothing is filled in from scripted data.
"""
import re
import time
from datetime import date

from . import fixtures
from .assess import band_for, js_round
from .library import passage_meta
from .models import ModelUnavailable, Provider
from .retrieval import THRESHOLD, Index, terms

CHECK_IDS = ["citation", "freshness", "crossref", "groundedness", "consistency", "intent"]

# Partial assessments can never reach the High band (80).
PARTIAL_CAP = 70
# Credit for claim verdicts the scripted model does not produce.
EXTRA_CLAIM_CREDIT = {"insufficient": 0.0, "unassessed": 0.5}

# ── text utilities ────────────────────────────────────────────────────────

# A sentence ends at . ! ? followed by whitespace or the end, so "§2.2" and "SGD 2.5m" stay whole.
_SENT = re.compile(r".+?(?:[.!?]+(?=\s|$)|$)", re.S)
_DOC_REF = re.compile(r"\bDOC-[A-Z]+-\d+\b")
_SECTION = re.compile(r"(§\s?\d+(?:\.\d+)*|Row \d+)")

_WORDNUM = {w: str(i) for i, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve".split())}
_QTY = [
    ("SGD", re.compile(r"(?:SGD|S\$|\$)\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|million|thousand)?\b", re.I)),
    ("%", re.compile(r"(\d+(?:\.\d+)?)\s?(?:%|per ?cent)", re.I)),
    ("bps", re.compile(r"(\d+(?:\.\d+)?)\s?(?:basis points?|bps|bp)\b", re.I)),
    ("time", re.compile(r"\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b", re.I)),
    ("duration", re.compile(r"\b(\d+|" + "|".join(_WORDNUM) + r")\s(business days?|days?|weeks?|months?|years?)\b", re.I)),
]


def quantities(text: str) -> list[tuple[str, str]]:
    """'SGD 250,000' -> ('250000', 'SGD'); '2:30 pm' -> ('14:30', 'time'); 'three months' -> ('3', 'months')."""
    out = []
    for unit, rx in _QTY:
        for m in rx.finditer(text):
            if unit == "SGD":
                v = float(m.group(1).replace(",", ""))
                mult = {"k": 1e3, "thousand": 1e3, "m": 1e6, "million": 1e6}.get((m.group(2) or "").lower(), 1)
                out.append((f"{v * mult:g}", "SGD"))
            elif unit == "time":
                h = int(m.group(1)) % 12 + (12 if m.group(3).lower() == "pm" else 0)
                out.append((f"{h:02d}:{m.group(2) or '00'}", "time"))
            elif unit == "duration":
                n = _WORDNUM.get(m.group(1).lower(), m.group(1))
                u = m.group(2).lower().rstrip("s").replace("business day", "business-day")
                out.append((n, u))
            else:
                out.append((f"{float(m.group(1)):g}", unit))
    return out


def figure_relation(claim: str, sentence: str) -> str | None:
    """'agree', 'conflict', or None when the sentence states no figure of the same kind."""
    q, p = quantities(claim), quantities(sentence)
    if not q:
        return None
    units = {u for _, u in q} & {u for _, u in p}
    if not units:
        return None
    for v, u in q:
        if u in units and v not in {pv for pv, pu in p if pu == u}:
            return "conflict"
    return "agree"


def figure_sentence(claim: str, passage: str, index) -> str | None:
    """The passage sentence most relevant to the claim among those stating a figure of the claim's kind."""
    units = {u for _, u in quantities(claim)}
    q = terms(claim)
    best, best_score = None, -1.0
    for s, e in sentence_spans(passage):
        sent = passage[s:e]
        if not units & {u for _, u in quantities(sent)}:
            continue
        score = index.coverage(q, frozenset(terms(sent)))
        if score > best_score:
            best, best_score = sent, score
    return best


_CLAUSE = re.compile(r",\s+(?=(?:as long as|so long as|provided|unless|but|except|whereas)\b)|;\s+", re.I)


def clause_spans(text: str, start: int, end: int) -> list[tuple[int, int]]:
    """Split one sentence at condition/exception boundaries, so each condition is checked on its own."""
    cuts, pos = [], start
    for m in _CLAUSE.finditer(text, start, end):
        cuts.append((pos, m.start()))
        pos = m.end()
    cuts.append((pos, end))
    out = []
    for s, e in cuts:
        while e > s and text[e - 1] in ".!? ":
            e -= 1
        if out and len(terms(text[s:e])) < 3:
            out[-1] = (out[-1][0], e)  # too short to stand alone: keep it with the clause before
        elif e > s:
            out.append((s, e))
    return out


def sentence_spans(text: str) -> list[tuple[int, int]]:
    spans = []
    for m in _SENT.finditer(text):
        s, e = m.start(), m.end()
        while s < e and text[s].isspace():
            s += 1
        while e > s and text[e - 1].isspace():
            e -= 1
        if e > s:
            spans.append((s, e))
    return spans


def _norm_map(text: str) -> tuple[str, list[int]]:
    """Lowercase, unify quotes, collapse whitespace; keep a map back to original offsets."""
    out, idx = [], []
    prev_space = False
    for i, ch in enumerate(text):
        ch = {"’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-"}.get(ch, ch).lower()
        if ch.isspace():
            if prev_space:
                continue
            ch, prev_space = " ", True
        else:
            prev_space = False
        out.append(ch)
        idx.append(i)
    return "".join(out), idx


def locate(text: str, quote: str, taken: list[tuple[int, int]] | None = None) -> tuple[int, int] | None:
    """Offsets of quote in text, found by code. Exact first, then whitespace/case-insensitive."""
    quote = quote.strip().rstrip(".")
    if not quote:
        return None
    taken = taken or []
    free = lambda s, e: all(e <= a or s >= b for a, b in taken)  # noqa: E731
    start = text.find(quote)
    while start >= 0:
        if free(start, start + len(quote)):
            return start, start + len(quote)
        start = text.find(quote, start + 1)
    nt, idx = _norm_map(text)
    nq, _ = _norm_map(quote)
    nq = nq.strip()
    start = nt.find(nq)
    while start >= 0:
        s, e = idx[start], idx[start + len(nq) - 1] + 1
        if free(s, e):
            return s, e
        start = nt.find(nq, start + 1)
    return None


def _contains(passage: str, quote: str) -> bool:
    return bool(quote.strip()) and _norm_map(quote)[0].strip().rstrip(".") in _norm_map(passage)[0]


# ── prompt-injection screening ────────────────────────────────────────────

_INJECTION = [
    re.compile(r"ignore (?:all |any )?(?:previous|prior|above|earlier) (?:instructions|rules)", re.I),
    re.compile(r"\b(?:assessment ai|verifier|verification (?:system|tool)|ai (?:system|model|assistant)s?|language model|assistant)\b[^.]{0,80}\b(?:must|should|shall|will)\b[^.]{0,60}\b(?:mark|rate|score|treat|label|report|classify|approve)", re.I),
    re.compile(r"\bmark (?:this|these|every|all)\b[^.]{0,60}\b(?:as )?(?:supported|verified|correct|approved)", re.I),
    re.compile(r"\b(?:system prompt|developer message|disregard (?:the|your) (?:rules|instructions))\b", re.I),
]


def screen(text: str) -> tuple[str, list[str]]:
    """(text with instruction-like sentences removed, the sentences removed)."""
    flagged, kept = [], []
    for s, e in sentence_spans(text):
        sent = text[s:e]
        if any(rx.search(sent) for rx in _INJECTION):
            flagged.append(sent)
        else:
            kept.append(sent)
    return " ".join(kept), flagged


# ── citations ─────────────────────────────────────────────────────────────

def parse_citations(supplied: list[str], answer: str) -> list[dict]:
    """[{docId, section|None, raw}] from the citation list and any inline references in the answer."""
    refs, seen = [], set()

    def add(doc, sec, raw):
        k = (doc, sec)
        if k not in seen:
            seen.add(k)
            refs.append({"docId": doc, "section": sec, "raw": raw})

    for raw in supplied:
        raw = (raw or "").strip()
        if not raw:
            continue
        docs = _DOC_REF.findall(raw.upper())
        secs = _SECTION.findall(raw)
        if not docs:
            add(raw, None, raw)  # an unrecognisable reference is still a citation, and it does not resolve
        for d in docs:
            add(d, secs[0].replace("§ ", "§") if secs else None, raw)
    for m in _DOC_REF.finditer(answer):
        tail = answer[m.end(): m.end() + 14]
        sec = _SECTION.match(tail.strip())
        add(m.group(0), sec.group(0).replace("§ ", "§") if sec else None, m.group(0))
    return refs


# ── pipeline ──────────────────────────────────────────────────────────────

def _passage(entry: dict, section_id: str, text: str | None = None) -> dict:
    sec = next(s for s in entry["sections"] if s["id"] == section_id)
    return {"docId": entry["id"], "section": section_id, "passage": text or sec["text"], **passage_meta(entry)}


def _ref_of(hit: dict, entries: dict) -> dict:
    """The passage as evidence. A screened passage is shown without its instruction-like text, and says so."""
    if hit.get("screened"):
        return {**_passage(entries[hit["key"]], hit["section"], hit["passage"]), "screened": True}
    return _passage(entries[hit["key"]], hit["section"])


def _today() -> str:
    return date.today().isoformat()


class _Unavailable:
    def __init__(self):
        self.steps: list[dict] = []

    def add(self, step: str, reason: str):
        if not any(s["step"] == step for s in self.steps):
            self.steps.append({"step": step, "reason": reason})


def extract(question: str, answer: str, provider: Provider, unavailable: _Unavailable) -> tuple[list[tuple[int, int]], str, int]:
    """(claim spans, method, quotes dropped because they were not in the answer)."""
    try:
        quotes = provider.extract_claims(question, answer)
        spans, dropped = [], 0
        for q in quotes:
            loc = locate(answer, q, spans)
            if loc:
                spans.append(loc)
            else:
                dropped += 1
        return sorted(spans), "model", dropped
    except ModelUnavailable as e:
        unavailable.add("claims", str(e))  # claims fall back to a rule-based sentence split (provenance says so)
    spans = []
    for s, e in sentence_spans(answer):
        sent = answer[s:e]
        if sent.rstrip().endswith("?") or len(terms(sent)) < 3:
            continue  # "Yes.", "No.", questions back to the user: nothing to check
        spans.extend(c for c in clause_spans(answer, s, e) if len(terms(answer[c[0]:c[1]])) >= 3)
    return spans, "rule-based", 0


def verify_claim(i: int, span: tuple[int, int], ctx: dict) -> dict:
    answer, entries, index = ctx["answer"], ctx["entries"], ctx["index"]
    text = answer[span[0]:span[1]]
    hits = index.search(text, k=8)
    for h in hits:
        h["state"] = entries[h["key"]]["state"]
        # Every retrieved passage is screened before any step uses it, whichever path decides the claim.
        clean, flagged = screen(h["passage"])
        if flagged:
            ctx["injections"].setdefault(h["key"] + " " + h["section"], {"docId": h["docId"], "version": entries[h["key"]]["version"], "section": h["section"], "sentences": flagged})
            h["passage"], h["screened"] = clean, True
    current = [h for h in hits if h["state"] != "superseded" and h["score"] >= THRESHOLD]
    old = [h for h in hits if h["state"] == "superseded" and h["score"] >= THRESHOLD]
    claim = {
        "id": f"c{i + 1}", "start": span[0], "end": span[1],
        "retrieval": {"topScore": hits[0]["score"] if hits else 0.0,
                      "candidates": [{"docId": h["docId"], "section": h["section"], "score": h["score"], "version": entries[h["key"]]["version"]} for h in hits[:5]]},
    }

    def current_counterpart(h):
        """The version in force that replaced an old hit, on the same section if it still exists."""
        rep, seen = entries[h["key"]]["supersededBy"], {h["key"]}
        while rep and rep not in seen and entries[rep]["state"] == "superseded":
            seen.add(rep)
            rep = entries[rep]["supersededBy"]
        if not rep:
            return None
        e = entries[rep]
        sec = next((s for s in e["sections"] if s["id"] == h["section"]), None)
        if sec:
            return _passage(e, sec["id"])
        best = next((c for c in current if c["key"] == rep), None)
        return _ref_of(best, entries) if best else None

    # 1 · Nothing in force covers this point.
    if not current:
        if old:
            h = old[0]
            claim.update(status="unsupported", check="freshness", source=_ref_of(h, entries),
                         short="Only a replaced version says this",
                         reason=f"The only matching passage is in {h['docId']} {entries[h['key']]['version']}, which has been superseded. No version in force on {ctx['asOf']} states this.")
            counter = current_counterpart(h)
            if counter:
                claim["counter"] = counter
            return claim
        best = hits[0]["score"] if hits else 0.0
        claim.update(status="insufficient", check="groundedness", source=None, short="No approved policy found",
                     reason=f"Insufficient evidence. No approved passage in force on {ctx['asOf']} addresses this (best match {best:.2f}, below the {THRESHOLD:.2f} relevance threshold).")
        return claim

    # 2 · Figures, compared by code with the current passage on the same point.
    agree = None
    for h in current:
        h["sentence"] = figure_sentence(text, h["passage"], index) or h["sentence"]
        rel = figure_relation(text, h["sentence"])
        if rel == "conflict":
            stale_match = next((o for o in old if figure_relation(text, figure_sentence(text, o["passage"], index) or o["sentence"]) == "agree"), None)
            said = ", ".join(f"{v} {u}" for v, u in quantities(text))
            policy = ", ".join(f"{v} {u}" for v, u in quantities(h["sentence"]))
            if stale_match:
                claim.update(status="unsupported", check="freshness", source=_ref_of(stale_match, entries), counter=_ref_of(h, entries),
                             short="Figure is from a replaced version",
                             reason=f"The figure ({said}) matches {stale_match['docId']} {entries[stale_match['key']]['version']}, which has been superseded. The version in force ({h['docId']} {entries[h['key']]['version']} {h['section']}) states {policy}.")
            else:
                claim.update(status="conflicting", check="crossref", source=_ref_of(h, entries), counter=_ref_of(h, entries),
                             short="Figure differs from current policy",
                             reason=f"The answer states {said}; the approved passage on the same point ({h['docId']} {entries[h['key']]['version']} {h['section']}) states {policy}.")
            return claim
        if rel == "agree" and agree is None:
            agree = h

    # 3 · Meaning: the model judge, which must quote its evidence.
    pool = ([agree] if agree else []) + [h for h in current if h is not agree][:2]
    passages = []
    for h in pool:
        passages.append({"hit": h, "docId": h["docId"], "version": entries[h["key"]]["version"], "section": h["section"], "text": h["passage"], "flagged": h.get("screened", False)})
    usable = [p for p in passages if p["text"].strip()]
    figures_note = f" Its figures match {agree['docId']} {agree['section']}." if agree else ""

    def not_checked(why):
        h = (agree or current[0])
        claim.update(status="unassessed", check="groundedness", source=_ref_of(h, entries), nearest=True,
                     short="Not checked by the model",
                     reason=f"Closest approved passage shown.{figures_note} Whether it supports the claim was not checked: {why}")
        return claim

    if not usable:
        return not_checked("the matching passage contains only instruction-like text, which is never used as evidence.")
    try:
        v = ctx["provider"].judge_claim(ctx["question"], text, [{k: p[k] for k in ("docId", "version", "section", "text")} for p in usable])
    except ModelUnavailable as e:
        ctx["unavailable"].add("judge", str(e))
        return not_checked(str(e))
    idx = v.get("passage", -1)
    verdict = v.get("verdict")
    if verdict == "insufficient":
        claim.update(status="insufficient", check="groundedness", source=None, short="Passages don’t cover this",
                     reason=f"Insufficient evidence. The model found that no retrieved passage addresses this point: {v.get('reason', '')}".strip())
        return claim
    if not (isinstance(idx, int) and 0 <= idx < len(usable)) or not _contains(usable[idx]["text"], v.get("quote", "")):
        ctx["rejected"] += 1
        return not_checked("the model's verdict was not accepted because the words it quoted do not appear in the passage it cited.")
    p = usable[idx]
    ref = _ref_of(p["hit"], entries)
    if verdict == "supported":
        overdue = entries[p["hit"]["key"]]["state"] == "overdue"
        claim.update(status="stale" if overdue else "supported", check="freshness" if overdue else "groundedness", source=ref,
                     reason=(f"Supported by {p['docId']} {p['section']}, but that document is past its review date. " if overdue else "")
                     + f"Judge: {v.get('reason', '')}".strip(),
                     evidenceQuote=v["quote"])
        if overdue:
            claim["short"] = "Source overdue for review"
    else:
        claim.update(status="unsupported", check="groundedness", source=ref, nearest=True, short="Policy doesn’t say this",
                     reason=f"Not supported by the closest approved passage. Judge: {v.get('reason', '')}".strip(), evidenceQuote=v["quote"])
    return claim


def _check(cid, status, short, summary, evidence):
    return {"id": cid, "status": status, "short": short, "summary": summary, "evidence": evidence}


def citation_check(refs: list[dict], claims: list[dict], ctx: dict) -> dict:
    entries = ctx["entries"]
    applicable = {e["id"]: e for e in entries.values() if e["applicable"]}
    drafts = ctx["drafts"]
    if not refs:
        if claims:
            return _check("citation", "fail", "No citations supplied", "No citations were supplied with this answer, so nothing it relies on can be traced. Assessment AI searched the library itself.", [{"kind": "search"}])
        return _check("citation", "na", "Nothing cited, nothing claimed", "No documents cited and no claims made.", [{"kind": "search"}])
    problems, warnings, evidence = [], [], []
    for r in refs:
        e = applicable.get(r["docId"])
        if not e:
            what = "is only a draft, not approved" if r["docId"] in drafts else "does not exist in the approved library"
            problems.append(f"{r['raw']} {what}")
            continue
        if r["section"] and not any(s["id"] == r["section"] for s in e["sections"]):
            problems.append(f"{r['docId']} {e['version']} has no section {r['section']}")
            continue
        if e["state"] == "superseded":
            warnings.append(f"{r['docId']} {e['version']} has been superseded")
        used = [c for c in claims if c.get("source") and c["source"]["docId"] == r["docId"]]
        relevant = used or any(cand["docId"] == r["docId"] and cand["score"] >= THRESHOLD for c in claims for cand in c["retrieval"]["candidates"])
        if not relevant:
            warnings.append(f"{r['docId']} is cited but does not address any claim in the answer")
        sec = r["section"] or (used[0]["source"]["section"] if used else e["sections"][0]["id"])
        evidence.append(_passage(e, sec))
    if problems:
        return _check("citation", "fail", "Citation doesn’t resolve", "; ".join(problems) + ".", evidence)
    if warnings:
        return _check("citation", "warning", "Citation exists but is weak", "; ".join(warnings) + ".", evidence)
    n = len(refs)
    return _check("citation", "pass", "Cited documents exist and apply", f"{'The cited document exists' if n == 1 else f'All {n} cited documents exist'} in the approved library and address the claims.", evidence)


def freshness_check(refs: list[dict], claims: list[dict], ctx: dict) -> dict:
    entries = ctx["entries"]
    applicable = {e["id"]: e for e in entries.values() if e["applicable"]}
    used = {}
    for c in claims:
        for r in (c.get("source"),):
            if r:
                used.setdefault((r["docId"], r["version"]), r)
    for r in refs:
        e = applicable.get(r["docId"])
        if e:
            sec = r["section"] if any(x["id"] == r["section"] for x in e["sections"]) else e["sections"][0]["id"]
            used.setdefault((e["id"], e["version"]), _passage(e, sec))
    if not used:
        return _check("freshness", "na", "No source to check", "No source to check.", [{"kind": "search"}])
    sup = [r for r in used.values() if r["state"] == "superseded"]
    over = [r for r in used.values() if r["state"] == "overdue"]
    if sup:
        r = sup[0]
        by = entries[r["supersededBy"]] if r["supersededBy"] else None
        ev = [r] + ([_passage(by, by["sections"][0]["id"])] if by else [])
        replaced = f" by {by['id']} {by['version']}" if by else ""
        return _check("freshness", "fail", "Relies on a replaced version", f"{r['docId']} {r['version']} has been superseded{replaced}.", ev)
    if over:
        r = over[0]
        return _check("freshness", "warning", "Source overdue for review", f"{r['docId']} {r['version']} passed its review date ({r['reviewDate']}). It has not been superseded, but it may be out of date.", [r])
    return _check("freshness", "pass", "All sources in force", f"All {len(used)} source version{'s' if len(used) != 1 else ''} used are approved, in force on {ctx['asOf']} and within their review date.", list(used.values())[:2])


def crossref_check(claims: list[dict]) -> dict:
    conf = [c for c in claims if c["status"] == "conflicting"]
    old = [c for c in claims if c["status"] == "unsupported" and c.get("counter")]
    sourced = [c for c in claims if c.get("source")]
    if conf:
        return _check("crossref", "fail", "Figure differs from current policy", conf[0]["reason"], [c["counter"] for c in conf])
    if old:
        return _check("crossref", "warning", "Figure is from a replaced version", old[0]["reason"], [c["counter"] for c in old])
    if not sourced:
        return _check("crossref", "na", "Nothing to compare against", "No approved passage to compare figures against.", [{"kind": "search"}])
    return _check("crossref", "pass", "No figure conflicts", "No figure in the answer disagrees with the approved passage on the same point.", [sourced[0]["source"]])


def groundedness_check(claims: list[dict], ctx: dict) -> dict:
    n = len(claims)
    if not n:
        return _check("groundedness", "na", "No claims to check", "No factual claims to check.", [{"kind": "search"}])
    ok = sum(c["status"] in ("supported", "stale", "off-intent") for c in claims)
    bad = sum(c["status"] in ("unsupported", "conflicting", "insufficient") for c in claims)
    unchecked = sum(c["status"] == "unassessed" for c in claims)
    ev = [c["source"] for c in claims if c.get("source")][:4] or [{"kind": "search"}]
    tail = f" {unchecked} could not be checked: {ctx['unavailable'].steps[-1]['reason'] if ctx['unavailable'].steps else 'model unavailable'}" if unchecked else ""
    summary = f"{ok} of {n} claims supported by an approved passage; {bad} not supported or without evidence.{tail}"
    if bad == 0 and unchecked:
        return _check("groundedness", "unavailable", f"{unchecked} of {n} claims not checked", summary, ev)
    status = "pass" if ok == n else "fail" if ok * 2 <= n else "warning"
    return _check("groundedness", status, f"{ok} of {n} claims backed", summary, ev)


def answer_review(claims: list[dict], ctx: dict) -> tuple[dict, dict]:
    try:
        r = ctx["provider"].review_answer(ctx["question"], ctx["answer"], [ctx["answer"][c["start"]:c["end"]] for c in claims])
    except ModelUnavailable as e:
        ctx["unavailable"].add("review", str(e))
        why = f"Not run: {e}"
        return (_check("consistency", "unavailable", "Not run · model unavailable", why, [{"kind": "question"}]),
                _check("intent", "unavailable", "Not run · model unavailable", why, [{"kind": "question"}]))
    off = 0
    for q in r.get("offTopicQuotes") or []:
        loc = locate(ctx["answer"], q)
        if not loc:
            continue
        for c in claims:
            if c["start"] < loc[1] and loc[0] < c["end"] and c["status"] == "supported":
                c.update(status="off-intent", check="intent", short="Not what was asked", reason=f"Accurate, but it answers a different question. {r.get('intentReason', '')}".strip())
                off += 1
    intent = r.get("intent")
    ist = "pass" if intent == "answers" and not off else "fail" if intent == "off_topic" else "warning"
    consistency = _check("consistency", "fail" if r.get("contradiction") else "pass",
                         "Contradicts itself" if r.get("contradiction") else "No contradictions",
                         r.get("contradictionReason") or ("The answer contradicts itself." if r.get("contradiction") else "The answer does not contradict itself."),
                         [{"kind": "question"}])
    return consistency, _check("intent", ist, {"pass": "Answers the question asked", "warning": "Partly off the question", "fail": "Answers a different question"}[ist],
                                r.get("intentReason") or "Intent checked by the model.", [{"kind": "question"}])


def reliability(claims: list[dict], checks: list[dict], partial: bool) -> dict:
    """The reliability index: an evidence-based 0-100 index, not a probability of being correct."""
    if not claims:
        return {"score": None, "parts": None}
    m = fixtures.load()["SCORE_MODEL"]
    credit = {**m["claimCredit"], **EXTRA_CLAIM_CREDIT}
    claim_share = sum(credit[c["status"]] for c in claims) / len(claims)
    counted = [c for c in checks if c["status"] in m["checkCredit"]]
    check_share = sum(m["checkCredit"][c["status"]] for c in counted) / len(counted) if counted else 0
    claim_pts, check_pts = claim_share * m["claimWeight"], check_share * m["checkWeight"]
    if all(c["status"] == "insufficient" for c in claims):
        cap, why = m["noSourceCap"], "No approved passage was found for any claim."
    elif partial:
        cap, why = PARTIAL_CAP, "Part of the assessment could not run, so the index cannot reach High."
    else:
        cap, why = m["cap"], "Nothing is ever certain."
    return {
        "score": min(cap, js_round(claim_pts + check_pts)),
        "parts": {"claimPts": js_round(claim_pts), "checkPts": js_round(check_pts), "capped": claim_pts + check_pts > cap,
                  "cap": cap, "counted": len(counted), "capReason": why},
    }


def _explain(claims, checks, partial, unavailable) -> tuple[str, str]:
    st = [c["status"] for c in claims]
    n = len(st)
    if not n:
        return "Nothing to verify", "The answer makes no checkable policy claims, so no reliability index is given."
    parts = []
    sup = sum(s in ("supported", "stale") for s in st)
    parts.append(f"{sup} of {n} claim{'s' if n != 1 else ''} supported by an approved passage.")
    for s, label in [("conflicting", "conflict with current policy"), ("unsupported", "are not supported or rest on a replaced version"),
                     ("insufficient", "have no approved evidence"), ("off-intent", "answer a different question"), ("unassessed", "could not be checked")]:
        k = st.count(s)
        if k:
            parts.append(f"{k} {label.replace('are ', 'is ').replace('have ', 'has ') if k == 1 else label}.")
    if partial:
        steps = {"claims": "claim extraction", "judge": "the support check", "review": "intent and consistency"}
        names = [steps.get(u["step"], u["step"]) for u in unavailable.steps]
        why = " ".join(dict.fromkeys(u["reason"] for u in unavailable.steps))
        parts.append(f"This is a partial assessment: the model did not run {', '.join(names) or 'every step'}. {why}".strip())
    if "conflicting" in st:
        head = "Don’t act on this answer"
    elif "unsupported" in st or "insufficient" in st:
        head = "Confirm before acting"
    elif partial:
        head = "Partly checked — needs a reviewer"
    elif "stale" in st or "off-intent" in st:
        head = "Usable with care"
    else:
        head = "Matches current policy"
    return head, " ".join(parts)


def run(question: str, answer: str, citations: list[str], entries: dict, as_of: str, provider: Provider,
        *, drafts: set[str] | None = None) -> dict:
    t0 = time.perf_counter()
    unavailable = _Unavailable()
    index = Index(entries)
    ctx = {"question": question, "answer": answer, "entries": entries, "index": index, "asOf": as_of, "provider": provider,
           "unavailable": unavailable, "injections": {}, "rejected": 0, "drafts": drafts or set()}
    spans, method, dropped = extract(question, answer, provider, unavailable)
    claims = [verify_claim(i, s, ctx) for i, s in enumerate(spans)]
    consistency, intent = answer_review(claims, ctx) if claims else (
        _check("consistency", "na", "No claims to compare", "No claims to compare.", [{"kind": "search"}]),
        _check("intent", "na", "No claims to check", "No claims to check.", [{"kind": "question"}]))
    refs = parse_citations(citations, answer)
    checks = [citation_check(refs, claims, ctx), freshness_check(refs, claims, ctx), crossref_check(claims),
              groundedness_check(claims, ctx), consistency, intent]
    partial = bool(unavailable.steps) or any(c["status"] == "unassessed" for c in claims)
    scored = reliability(claims, checks, partial)
    headline, explanation = _explain(claims, checks, partial, unavailable)

    cited = {r["docId"] for r in refs}
    retrieved = []
    for c in claims:
        for r in (c.get("source"), c.get("counter")):
            if r and r["docId"] not in cited and r["docId"] not in retrieved:
                retrieved.append(r["docId"])
    used = {}
    for c in claims:
        for r in (c.get("source"), c.get("counter")):
            if r:
                used[(r["docId"], r["version"])] = {"docId": r["docId"], "version": r["version"], "title": r["title"], "state": r["state"]}
    for chk in checks:
        for r in chk["evidence"]:
            if "docId" in r:
                used.setdefault((r["docId"], r["version"]), {"docId": r["docId"], "version": r["version"], "title": r["title"], "state": r["state"]})
    topics = {}
    for c in claims:
        if c.get("source"):
            t = next((e["topic"] for e in entries.values() if e["id"] == c["source"]["docId"]), None)
            topics[t] = topics.get(t, 0) + 1
    topic = max(topics, key=topics.get) if topics else None

    result = {
        "explanation": explanation,
        "headline": headline,
        "retrieved": retrieved,
        "claims": claims,
        "checks": checks,
        "score": scored["score"],
        "parts": scored["parts"],
        "band": band_for(scored["score"]),
        "matchedQuestion": None,
        "provenance": {"claims": "extracted" if method == "model" else "rule-based", "retrieval": "lexical", "ruleChecks": "computed",
                       "judgeChecks": "unavailable" if unavailable.steps and "judge" in [s["step"] for s in unavailable.steps] or not provider.status()["available"] else "llm"},
        "assessment": {
            "partial": partial,
            "unavailable": unavailable.steps,
            "asOf": as_of,
            "topic": topic,
            "claimMethod": method,
            "quotesDropped": dropped,
            "verdictsRejected": ctx["rejected"],
            "model": provider.status(),
            "policyVersions": sorted(used.values(), key=lambda v: (v["docId"], v["version"])),
            "injections": list(ctx["injections"].values()),
            "latencyMs": round((time.perf_counter() - t0) * 1000, 1),
        },
    }
    if claims and all(c["status"] == "insufficient" for c in claims):
        q = set().union(*(terms(answer[c["start"]:c["end"]]) for c in claims))
        result["noSource"] = True
        result["search"] = {"documentsSearched": len({e["id"] for e in entries.values()}), "query": " ".join(sorted(q, key=lambda t: -index.idf(t))[:6]),
                            "topMatch": max(c["retrieval"]["topScore"] for c in claims), "threshold": THRESHOLD}
    return result
