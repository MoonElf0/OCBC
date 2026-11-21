"""
Rule-based checks. Plain code over the retrieved passages, no model.
Port of frontend/src/lib/rules.js; tests/test_parity.py keeps them identical.

  citation   cited documents exist, and each claim's figures appear in the
             passage it cites (passage-match on amounts, %, times)
  freshness  every source is current: not superseded, not past review
  crossref   figures in each claim agree with the current approved passage
             retrieved for the same point
"""
import re

from .freshness import age_label, format_date, freshness_of

_FIG = re.compile(r"\d+(?:[.,:]\d+)*")
_DISPLAY = re.compile(r"(?:SGD\s)?\d+(?:[.,:]\d+)*(?:%|\s(?:basis points|bps|pm|am))?")


def figures(text: str) -> list[str]:
    """'SGD 250,000' -> '250000', '2:30 pm' -> '2:30', '25%' -> '25'"""
    return [f.replace(",", "") for f in _FIG.findall(text)]


def display(text: str) -> str:
    m = _DISPLAY.search(text)
    return m.group(0) if m else ""


def _ref(r: dict) -> dict:
    return {"docId": r["docId"], "section": r["section"], "passage": r["passage"]}


def _span(answer: dict, c: dict) -> str:
    return answer["text"][c["start"]:c["end"]]


def citation_check(answer: dict, claims: list[dict], docs: dict) -> dict:
    cited = answer["citations"]
    if not cited:
        if claims:
            return {"id": "citation", "status": "fail", "short": "Cites no documents", "summary": "The answer cites no documents.", "evidence": [{"kind": "search"}]}
        return {"id": "citation", "status": "na", "short": "Nothing cited, nothing claimed", "summary": "No documents cited and no claims made.", "evidence": [{"kind": "search"}]}
    missing = [i for i in cited if i not in docs]
    if missing:
        return {"id": "citation", "status": "fail", "short": "A cited document doesn’t exist", "summary": f"Cited {', '.join(missing)} does not exist in the approved library.", "evidence": []}

    checked = [c for c in claims if c.get("source") and c["source"]["docId"] in cited]
    mismatched = []
    for c in checked:
        in_passage = set(figures(c["source"]["passage"]))
        if any(f not in in_passage for f in figures(_span(answer, c))):
            mismatched.append(c)
    if mismatched:
        c = mismatched[0]
        said = display(_span(answer, c))
        return {
            "id": "citation",
            "status": "fail",
            "short": f"Cited source says {display(c['source']['passage'])}, not {said}",
            "summary": f"{c['source']['docId']} exists, but the answer cites it for {said} and the passage says {display(c['source']['passage'])}.",
            "evidence": [_ref(m["source"]) for m in mismatched],
        }
    n = len(cited)
    lead = "The cited document exists" if n == 1 else "Both cited documents exist" if n == 2 else f"All {n} cited documents exist"
    k = len(checked)
    return {
        "id": "citation",
        "status": "pass",
        "short": "Cited documents exist and match",
        "summary": f"{lead} in the approved library, and every figure in the {k} cited claim{'' if k == 1 else 's'} appears in its passage.",
        "evidence": [_ref(c["source"]) for c in checked],
    }


def freshness_check(answer: dict, claims: list[dict], docs: dict, today: str) -> dict:
    ids: list[str] = []
    for i in [*answer["citations"], *[c["source"]["docId"] for c in claims if c.get("source")]]:
        if i in docs and i not in ids:
            ids.append(i)
    if not ids:
        return {"id": "freshness", "status": "na", "short": "No source to check", "summary": "No source to check.", "evidence": [{"kind": "search"}]}
    results = [{"id": i, **freshness_of(i, docs, today)} for i in ids]
    superseded = [r for r in results if r["state"] == "superseded"]
    overdue = [r for r in results if r["state"] == "overdue"]
    if superseded:
        r = superseded[0]
        by = r["supersededBy"]
        pointer = next((s for s in by["sections"] if r["id"] in s["text"]), by["sections"][0])
        return {
            "id": "freshness",
            "status": "fail",
            "short": f"Cited source was replaced on {format_date(by['updated'])}",
            "summary": f"{r['id']} was last updated {age_label(r['months'])} and has been superseded by {by['id']}.",
            "evidence": [{"docId": by["id"], "section": pointer["id"], "passage": pointer["text"]}],
        }
    if overdue:
        r = overdue[0]
        doc = docs[r["id"]]
        used = next((c["source"] for c in claims if c.get("source") and c["source"]["docId"] == r["id"]), None)
        return {
            "id": "freshness",
            "status": "warning",
            "short": f"Source is {r['months']} months old and overdue for review",
            "summary": f"{r['id']} was last updated {age_label(r['months'])}, past its {doc['reviewCycleMonths']}-month review cycle. It has not been superseded.",
            "evidence": [_ref(used)] if used else [],
        }
    oldest = results[0]
    for r in results[1:]:
        if r["months"] > oldest["months"]:
            oldest = r
    lead = f"{oldest['id']} was updated within its" if len(results) == 1 else f"All {len(results)} sources were updated within their"
    return {
        "id": "freshness",
        "status": "pass",
        "short": "All sources up to date",
        "summary": f"{lead} 12-month review cycle (oldest: {oldest['id']}, {age_label(oldest['months'])}).",
        "evidence": [_ref(c["source"]) for c in claims if c.get("source") and c["source"]["docId"] == oldest["id"]][:1],
    }


def crossref_check(answer: dict, claims: list[dict]) -> dict:
    sourced = [c for c in claims if c.get("source")]
    if not sourced:
        return {"id": "crossref", "status": "na", "short": "Nothing to compare against", "summary": "No approved source to compare against.", "evidence": [{"kind": "search"}]}
    diffs = []
    for c in claims:
        if not c.get("counter"):
            continue
        claimed = (figures(_span(answer, c)) or [None])[0]
        current = (figures(c["counter"]["passage"]) or [None])[0]
        if claimed is not None and current is not None and claimed != current:
            diffs.append(c)
    if not diffs:
        return {
            "id": "crossref",
            "status": "pass",
            "short": "Figures match current policy",
            "summary": "Every figure agrees with the approved sources retrieved for the same point.",
            "evidence": [_ref(c["source"]) for c in sourced[:1]],
        }
    d = diffs[0]
    conflict = any(c["status"] == "conflicting" for c in diffs)
    return {
        "id": "crossref",
        "status": "fail" if conflict else "warning",
        "short": f"Current policy says {display(d['counter']['passage'])}",
        "summary": f"The answer states {display(_span(answer, d))}; the current approved source ({d['counter']['docId']} {d['counter']['section']}) states {display(d['counter']['passage'])}.",
        "evidence": [_ref(c["counter"]) for c in diffs],
    }
