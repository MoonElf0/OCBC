"""
Assessment AI, live mode -- phase 3 (retrieval + rule checks are real).

    answer (scripted agent)
      -> claims          scripted spans          (phase 4: LLM extractor)
      -> retrieval       REAL: lexical search over the approved library
      -> judge verdicts  scripted                (phase 4: LLM judge)
      -> guard           REAL: a verdict must rest on a passage retrieval
                         actually returned, or it is not accepted
      -> counter         REAL: current approved passage on the same point
                         whose figures disagree with the claim
      -> rule checks     REAL: citation, freshness, cross-referencing
      -> score, band     REAL

Everything the judge does not decide is recomputed here from the document
library, so a change to a policy document changes the verdict.
"""
import re
from copy import deepcopy

from . import fixtures
from .assess import assess
from .freshness import freshness_of
from .retrieval import SAME_POINT, THRESHOLD, Index, terms
from .rules import figures

PROVENANCE = {"claims": "scripted", "retrieval": "lexical", "ruleChecks": "computed", "judgeChecks": "scripted"}

_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")


def _sentence_around(text: str, start: int) -> str:
    pos = 0
    for sent in _SENT_SPLIT.split(text):
        begin = text.index(sent, pos)
        if begin <= start < begin + len(sent):
            return sent
        pos = begin + len(sent)
    return text


def _ref(hit: dict) -> dict:
    return {"docId": hit["docId"], "section": hit["section"], "passage": hit["passage"]}


def _key(r: dict | None):
    return (r["docId"], r["section"]) if r else None


def verify_claim(claim: dict, answer_text: str, index: Index, today: str) -> dict:
    """Re-derive a claim's evidence from retrieval. Returns a new claim dict."""
    span = answer_text[claim["start"]:claim["end"]]
    own = index.search(span)
    # Claims are decontextualised fragments ("as long as ..."), so the pool
    # also includes what the whole answer sentence retrieves.
    context = index.search(_sentence_around(answer_text, claim["start"]))
    pool = {_key(h): h for h in [*context, *own]}
    top = own[0]["score"] if own else 0.0

    out = deepcopy(claim)
    out["retrieval"] = {
        "topScore": top,
        "candidates": [{"docId": h["docId"], "section": h["section"], "score": h["score"]} for h in own],
    }

    # Guard: the judge's verdict must cite a passage retrieval returned.
    src = claim.get("source")
    if src is not None and _key(src) not in pool:
        nearest = own[0] if own else None
        out.update(
            status="unsupported",
            source=_ref(nearest) if nearest else None,
            nearest=bool(nearest),
            reason="The verdict cited a passage the verifier's retrieval did not return, so it was not accepted. The nearest retrieved passage is shown.",
        )
        out.pop("counter", None)
        if not nearest:
            out["status"] = "no-source"
            out["reason"] = "No source found. Retrieval returned no passage for this claim."
        return out
    if src is not None and claim["status"] == "supported" and pool[_key(src)]["score"] < THRESHOLD:
        out.update(status="unsupported", nearest=True, reason="The cited passage is below the relevance threshold for this claim, so it does not count as support.")

    # Counter-passage: current approved text on the same point whose figure differs.
    out.pop("counter", None)
    claimed = figures(span)
    if claimed:
        for h in own:
            if h["score"] < SAME_POINT:
                break
            if freshness_of(h["docId"], index.docs, today)["state"] == "superseded":
                continue
            stated = figures(h["sentence"])
            if stated and claimed[0] not in stated:
                out["counter"] = _ref(h)
                break
    return out


def verify(scenario: dict, docs: dict, today: str, *, question: str | None = None, index: Index | None = None) -> dict:
    index = index or Index(docs)
    v = scenario["verification"]
    text = scenario["answer"]["text"]
    claims = [verify_claim(c, text, index, today) for c in v["claims"]]

    # Sources the verifier found that the agent did not cite.
    cited = set(scenario["answer"]["citations"])
    retrieved: list[str] = []
    for c in claims:
        for r in (c.get("source"), c.get("counter")):
            if r and r["docId"] not in cited and r["docId"] not in retrieved:
                retrieved.append(r["docId"])

    live = {k: val for k, val in v.items() if k not in ("claims", "retrieved", "noSource", "search")}
    live["claims"] = claims
    live["retrieved"] = retrieved
    if claims and all(c["retrieval"]["topScore"] < THRESHOLD for c in claims):
        live["noSource"] = True
        q = set().union(*(terms(text[c["start"]:c["end"]]) for c in claims))
        live["search"] = {
            "documentsSearched": len(docs),
            "query": " ".join(sorted(q, key=lambda t: -index.idf(t))[:6]),
            "topMatch": max(c["retrieval"]["topScore"] for c in claims),
            "threshold": THRESHOLD,
        }
    result = assess(scenario, docs, today, question=question, verification=live)
    result["provenance"] = PROVENANCE
    return result


def default_index() -> Index:
    return Index(fixtures.load()["DOCUMENTS"])
