"""
Who gets a human reviewer, and why. Mirrored in frontend/src/state/store.jsx
for demo mode.

Mandatory review: an answer that meets any rule below is "Review required"
and stays that way until a reviewer records a decision. Nothing else clears
it: not a high reliability index, not the employee's feedback, not an
answer to the Challenger's clarifying question.
"""
from . import fixtures

# Topics designated high-risk: review is mandatory whatever the index says.
HIGH_RISK_TOPICS = sorted({s["topic"] for s in fixtures.scenarios() if s.get("highStakes")})

RULES = [
    {"id": "low-confidence", "label": "Low reliability index", "rule": "The reliability index is in the Low band (below 50)."},
    {"id": "conflicting", "label": "Conflicting evidence", "rule": "A claim conflicts with the approved policy in force."},
    {"id": "unsupported", "label": "Unsupported claim", "rule": "A claim is not supported by the approved passage that addresses it."},
    {"id": "no-source", "label": "Insufficient evidence", "rule": "A claim has no approved passage that addresses it."},
    {"id": "partial", "label": "Partial assessment", "rule": "Part of the assessment could not run (for example, no model available), so it is not fully verified."},
    {"id": "high-stakes", "label": "High-risk topic", "rule": "The answer is about a designated high-risk topic. Applies at any reliability index."},
]


def review_reasons(result: dict, topic: str | None) -> list[str]:
    """The mandatory-review rules this result meets, in RULES order. [] means no review is required."""
    claims = result.get("claims", [])
    reasons = []
    if result["band"]["id"] == "low":
        reasons.append("low-confidence")
    if any(c["status"] == "conflicting" for c in claims):
        reasons.append("conflicting")
    if any(c["status"] == "unsupported" for c in claims):
        reasons.append("unsupported")
    if any(c["status"] in ("no-source", "insufficient") for c in claims) or result.get("noSource"):
        reasons.append("no-source")
    if (result.get("assessment") or {}).get("partial"):
        reasons.append("partial")
    if topic in HIGH_RISK_TOPICS and claims:
        reasons.append("high-stakes")
    if reasons and result.get("matchedQuestion"):
        reasons.append("paraphrased")
    return reasons


def auto_route_reasons(result: dict, high_stakes: bool) -> list[str]:
    """Scripted scenarios: same rules, with the scenario's own high-stakes flag."""
    reasons = [r for r in review_reasons(result, None) if r != "paraphrased"]
    if high_stakes and result["claims"]:
        reasons.append("high-stakes")
    if reasons and result.get("matchedQuestion"):
        reasons.append("paraphrased")
    return reasons


def escalation_reasons(result: dict | None, stale_doc) -> list[str]:
    """Employee pressed "Send for human review". stale_doc(docId) -> bool."""
    reasons = ["employee"]
    claims = (result or {}).get("claims", [])
    if any(c["status"] == "unsupported" for c in claims):
        reasons.append("unsupported")
    if any(c["status"] == "stale" or (c.get("source") and (c["source"].get("state", "current") != "current" or stale_doc(c["source"]["docId"]))) for c in claims):
        reasons.append("stale")
    if any(c["status"] == "conflicting" for c in claims):
        reasons.append("conflicting")
    if (result or {}).get("noSource") or any(c["status"] in ("no-source", "insufficient") for c in claims):
        reasons.append("no-source")
    if ((result or {}).get("assessment") or {}).get("partial"):
        reasons.append("partial")
    if (result or {}).get("matchedQuestion"):
        reasons.append("paraphrased")
    return reasons
