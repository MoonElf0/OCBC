"""Who gets a human reviewer, and why. Same rules as the frontend store."""


def auto_route_reasons(result: dict, high_stakes: bool) -> list[str]:
    """A Low score, any conflicting claim, or a high-stakes topic scored below High."""
    conflicting = any(c["status"] == "conflicting" for c in result["claims"])
    low = result["band"]["id"] == "low"
    stakes = high_stakes and result["score"] is not None and result["band"]["id"] != "high"
    if not (low or conflicting or stakes):
        return []
    reasons = []
    if low:
        reasons.append("low-confidence")
    if conflicting:
        reasons.append("conflicting")
    if result.get("noSource"):
        reasons.append("no-source")
    if high_stakes:
        reasons.append("high-stakes")
    if result.get("matchedQuestion"):
        reasons.append("paraphrased")
    return reasons


def escalation_reasons(result: dict | None, stale_doc) -> list[str]:
    """Employee pressed "Send for human review". stale_doc(docId) -> bool."""
    reasons = ["employee"]
    claims = (result or {}).get("claims", [])
    if any(c["status"] == "unsupported" for c in claims):
        reasons.append("unsupported")
    if any(c["status"] == "stale" or (c.get("source") and stale_doc(c["source"]["docId"])) for c in claims):
        reasons.append("stale")
    if any(c["status"] == "conflicting" for c in claims):
        reasons.append("conflicting")
    if (result or {}).get("noSource"):
        reasons.append("no-source")
    if (result or {}).get("matchedQuestion"):
        reasons.append("paraphrased")
    return reasons
