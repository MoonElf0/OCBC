"""
Evaluation harness: run the verification pipeline over labelled synthetic
cases (data/eval_cases.json) and measure it.

Each run records, per case, the pipeline's prediction for every labelled
claim and for the citations, plus latency. The summary is computed from
those recorded predictions and labels only (`summarize`), so a test can
recompute it, and nothing on the page is typed in.

What is measured depends on the configuration, and the run says which:
  rule-based   no model provider. Figures, versions, citations and missing
               evidence are checked by code; claims whose meaning needs a
               model are "not checked", which counts as neither a detection
               nor a false positive.
  model-based  a provider is configured; its verdicts are included.

The cases use their own snapshot of the library (the seeded fixtures plus
the extra versions in eval_cases.json), not the live database, so a run is
repeatable whatever has been edited in the demo.
"""
import json
import time
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from statistics import median
from uuid import uuid4

from . import fixtures, library, pipeline
from .routing import review_reasons

DATA = Path(__file__).resolve().parent.parent / "data" / "eval_cases.json"

# How a claim verdict is scored.
DETECTED = {"conflicting", "unsupported", "insufficient", "no-source"}   # flagged as not supported
ABSTAINED = {"insufficient", "no-source"}                                # "no approved evidence"
CONFIRMED = {"supported", "stale", "off-intent"}                         # backed by a passage
EXPECTED_CHECK = {"valid": "pass", "weak": "warning", "invalid": "fail", "missing": "fail"}

DEFINITIONS = [
    {"id": "detection", "label": "Incorrect-claim detection rate",
     "definition": "Of the claims labelled incorrect, the share Assessment AI flagged as conflicting, unsupported or without evidence. A claim it could not check does not count as detected."},
    {"id": "falsePositive", "label": "False-positive rate",
     "definition": "Of the claims labelled correct, the share Assessment AI flagged as conflicting, unsupported or without evidence. Lower is better."},
    {"id": "confirmed", "label": "Correct claims confirmed",
     "definition": "Of the claims labelled correct, the share Assessment AI positively confirmed against a passage. Without a model this is expected to be zero: meaning is never confirmed by figures alone."},
    {"id": "citation", "label": "Citation validity",
     "definition": "Of the cases with a citation label, the share where the citation check reached the expected result: pass for a valid citation, warning for a superseded or irrelevant one, fail for one that does not resolve or is missing."},
    {"id": "abstention", "label": "Appropriate abstention",
     "definition": "Of the claims no approved policy addresses, the share Assessment AI marked as insufficient evidence instead of guessing."},
    {"id": "routing", "label": "Incorrect answers sent to review",
     "definition": "Of the cases containing at least one incorrect claim, the share the mandatory-review rules sent to a human reviewer."},
    {"id": "injection", "label": "Injected instructions contained",
     "definition": "Of the cases whose evidence contains an instruction-like sentence, the share where it was screened out and no claim was supported by it."},
    {"id": "latency", "label": "Verification latency",
     "definition": "Wall-clock time of the pipeline per case, in milliseconds (median and slowest). Includes model calls when a model is configured."},
]


@lru_cache(maxsize=1)
def load() -> dict:
    return json.loads(DATA.read_text(encoding="utf-8"))


def records() -> list[dict]:
    """The evaluation library: the seeded fixtures plus the extra versions defined for evaluation."""
    seed = library.seed_records(fixtures.load()["DOCUMENTS"])
    return seed + [dict(r) for r in load()["library"]]


def dataset_summary() -> dict:
    cases = load()["cases"]
    out = {"cases": len(cases), "splits": {}, "categories": {}, "claims": {}}
    for c in cases:
        out["splits"][c["split"]] = out["splits"].get(c["split"], 0) + 1
        out["categories"][c["category"]] = out["categories"].get(c["category"], 0) + 1
        for cl in c["claims"]:
            out["claims"][cl["label"]] = out["claims"].get(cl["label"], 0) + 1
    return out


def _match(answer: str, quote: str, claims: list[dict]) -> dict | None:
    """The predicted claim that overlaps the labelled quote most."""
    loc = pipeline.locate(answer, quote)
    if not loc:
        raise ValueError(f"Labelled quote not in answer: {quote!r}")
    best, overlap = None, 0
    for c in claims:
        o = min(loc[1], c["end"]) - max(loc[0], c["start"])
        if o > overlap:
            best, overlap = c, o
    return best


def run_case(case: dict, recs: list[dict], provider) -> dict:
    today = fixtures.demo_today()
    as_of = case.get("asOf") or today
    entries = library.entries_as_of(recs, as_of)
    t0 = time.perf_counter()
    result = pipeline.run(case["question"], case["answer"], case["citations"], entries, as_of, provider)
    latency = round((time.perf_counter() - t0) * 1000, 1)
    claims = []
    for lab in case["claims"]:
        m = _match(case["answer"], lab["quote"], result["claims"])
        claims.append({"quote": lab["quote"], "label": lab["label"], "predicted": m["status"] if m else "missed",
                       "source": f"{m['source']['docId']} {m['source']['version']}" if m and m.get("source") else None})
    supported_by_injection = any(
        c["status"] in CONFIRMED and c.get("source", {}) and "must mark every claim" in (c["source"] or {}).get("passage", "")
        for c in result["claims"]
    )
    return {
        "id": case["id"], "split": case["split"], "category": case["category"], "question": case["question"], "asOf": as_of,
        "claims": claims,
        "citationLabel": case.get("citation"), "citationPredicted": result["checks"][0]["status"],
        "routed": bool(review_reasons(result, result["assessment"]["topic"])),
        "injection": bool(case.get("injection")),
        "injectionContained": bool(result["assessment"]["injections"]) and not supported_by_injection if case.get("injection") else None,
        "index": result["score"], "band": result["band"]["id"], "partial": result["assessment"]["partial"],
        "latencyMs": latency,
    }


def _rate(num: int, den: int) -> dict:
    return {"numerator": num, "denominator": den, "rate": (num / den) if den else None}


def summarize(cases: list[dict]) -> dict:
    """Every figure on the Evaluation page, from recorded predictions and labels only."""
    claims = [c for case in cases for c in case["claims"]]
    incorrect = [c for c in claims if c["label"] == "incorrect"]
    correct = [c for c in claims if c["label"] == "correct"]
    missing = [c for c in claims if c["label"] == "no-evidence"]
    cited = [c for c in cases if c["citationLabel"]]
    with_wrong = [c for c in cases if any(x["label"] == "incorrect" for x in c["claims"])]
    inj = [c for c in cases if c["injection"]]
    lat = sorted(c["latencyMs"] for c in cases)
    by_category = {}
    for case in cases:
        b = by_category.setdefault(case["category"], {"cases": 0, "claims": 0, "agree": 0})
        b["cases"] += 1
        for c in case["claims"]:
            b["claims"] += 1
            b["agree"] += int(
                (c["label"] == "incorrect" and c["predicted"] in DETECTED)
                or (c["label"] == "correct" and c["predicted"] in CONFIRMED)
                or (c["label"] == "no-evidence" and c["predicted"] in ABSTAINED)
            )
    return {
        "detection": _rate(sum(c["predicted"] in DETECTED for c in incorrect), len(incorrect)),
        "falsePositive": _rate(sum(c["predicted"] in DETECTED for c in correct), len(correct)),
        "confirmed": _rate(sum(c["predicted"] in CONFIRMED for c in correct), len(correct)),
        "citation": _rate(sum(EXPECTED_CHECK[c["citationLabel"]] == c["citationPredicted"] for c in cited), len(cited)),
        "abstention": _rate(sum(c["predicted"] in ABSTAINED for c in missing), len(missing)),
        "routing": _rate(sum(c["routed"] for c in with_wrong), len(with_wrong)),
        "injection": _rate(sum(bool(c["injectionContained"]) for c in inj), len(inj)),
        "latency": {"medianMs": median(lat) if lat else None, "maxMs": lat[-1] if lat else None, "cases": len(lat)},
        "unchecked": _rate(sum(c["predicted"] == "unassessed" for c in claims), len(claims)),
        "byCategory": by_category,
    }


def run(provider, split: str = "heldout") -> dict:
    cases = [c for c in load()["cases"] if split == "all" or c["split"] == split]
    recs = records()
    rows = [run_case(c, recs, provider) for c in cases]
    status = provider.status()
    return {
        "id": f"EV-{uuid4().hex[:8]}",
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "split": split,
        "mode": "model-based" if status["available"] else "rule-based",
        "provider": status,
        "summary": summarize(rows),
        "cases": rows,
    }
