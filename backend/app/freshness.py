"""Deterministic freshness. Port of frontend/src/lib/freshness.js."""
from datetime import date


def months_between(from_iso: str, to_iso: str) -> int:
    a, b = date.fromisoformat(from_iso), date.fromisoformat(to_iso)
    months = (b.year - a.year) * 12 + (b.month - a.month)
    if b.day < a.day:
        months -= 1
    return max(0, months)


def age_label(months: int) -> str:
    if months < 1:
        return "this month"
    if months == 1:
        return "1 month ago"
    return f"{months} months ago"


def freshness_of(doc_id: str, docs: dict, today: str) -> dict:
    """state: current | superseded | overdue"""
    doc = docs[doc_id]
    months = months_between(doc["updated"], today)
    updated = f"Last updated {age_label(months)}"
    if doc.get("supersededBy"):
        by = docs[doc["supersededBy"]]
        return {"state": "superseded", "stale": True, "months": months, "note": f"{updated} · superseded", "supersededBy": by}
    if months > doc["reviewCycleMonths"]:
        return {"state": "overdue", "stale": True, "months": months, "note": f"{updated} · review overdue"}
    return {"state": "current", "stale": False, "months": months, "note": updated}
