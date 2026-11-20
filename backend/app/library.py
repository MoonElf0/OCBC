"""
The policy library as versions, not documents.

Every policy document has one or more version records. Approved text is
never edited in place: a change is a new version, which starts as a draft
and replaces the previous approved version only when it is approved.

    record = {
      docId, version, status,            # status: draft | approved | superseded
      title, topic, owner,
      effectiveFrom, reviewDate,         # ISO dates
      replaces,                          # version this one replaced, or None
      supersededBy,                      # {docId, version} that replaced it, or None
      sections: [{id, heading, text}],
      changeNote, createdAt, approvedAt,
    }

Retrieval never reads records directly. It reads the *entries* that apply
on a given date (`entries_as_of`): the approved version in force for each
document, plus the older versions, kept so the verifier can tell when an
answer rests on text that has since been replaced.
"""
from datetime import date

from .freshness import age_label, months_between


def add_months(iso: str, months: int) -> str:
    d = date.fromisoformat(iso)
    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    for day in (d.day, 30, 29, 28):
        try:
            return date(year, month, day).isoformat()
        except ValueError:
            continue
    raise ValueError(iso)


def key_of(doc_id: str, version: str) -> str:
    return f"{doc_id}@{version}"


def seed_records(documents: dict) -> list[dict]:
    """One approved version per fixture document. A document another one replaced is 'superseded'."""
    out = []
    for d in documents.values():
        by = d.get("supersededBy")
        out.append({
            "docId": d["id"], "version": d["version"],
            "status": "superseded" if by else "approved",
            "title": d["title"], "topic": d["topic"], "owner": d["owner"],
            "effectiveFrom": d["updated"], "reviewDate": add_months(d["updated"], d["reviewCycleMonths"]),
            "replaces": None,
            "supersededBy": {"docId": by, "version": documents[by]["version"]} if by else None,
            "sections": [dict(s) for s in d["sections"]],
            "changeNote": "Seeded from the synthetic policy library.",
            "createdAt": d["updated"], "approvedAt": d["updated"],
        })
    return out


def _order(r: dict):
    return (r["effectiveFrom"], r.get("approvedAt") or "", r["version"])


def entries_as_of(records: list[dict], as_of: str) -> dict:
    """
    {key: entry} for every non-draft version in force on or before `as_of`.

    entry.state is one of
      current     the version that applies on as_of, and still in force
      overdue     as current, but past its review date
      superseded  replaced, either by a newer version of the same document
                  or by another document, before as_of
    """
    live = [r for r in records if r["status"] != "draft" and r["effectiveFrom"] <= as_of]
    by_doc: dict[str, list[dict]] = {}
    for r in sorted(live, key=_order):
        by_doc.setdefault(r["docId"], []).append(r)
    applicable = {doc: rs[-1] for doc, rs in by_doc.items()}

    out = {}
    for doc, rs in by_doc.items():
        for i, r in enumerate(rs):
            nxt = rs[i + 1] if i + 1 < len(rs) else None
            replaced_by = None
            if nxt:
                replaced_by = key_of(nxt["docId"], nxt["version"])
            elif r.get("supersededBy") and r["supersededBy"]["docId"] != doc and r["supersededBy"]["docId"] in applicable:
                # Replaced by another document (a newer version of this one is handled by date above).
                other = applicable[r["supersededBy"]["docId"]]
                replaced_by = key_of(other["docId"], other["version"])
            months = months_between(r["effectiveFrom"], as_of)
            if replaced_by:
                state = "superseded"
            elif as_of > r["reviewDate"]:
                state = "overdue"
            else:
                state = "current"
            updated = f"Effective {age_label(months)}"
            note = {
                "current": f"{updated}",
                "overdue": f"{updated} · review overdue",
                "superseded": f"{updated} · superseded",
            }[state]
            out[key_of(r["docId"], r["version"])] = {
                "key": key_of(r["docId"], r["version"]),
                "id": r["docId"], "version": r["version"], "status": r["status"],
                "title": r["title"], "topic": r["topic"], "owner": r["owner"],
                "effectiveFrom": r["effectiveFrom"], "reviewDate": r["reviewDate"],
                "replaces": r.get("replaces"),
                "state": state, "stale": state != "current", "months": months, "note": note,
                "supersededBy": replaced_by,
                "applicable": r is applicable[doc],
                "sections": r["sections"],
            }
    return out


def current_docs(records: list[dict], as_of: str) -> dict:
    """
    The library in the original fixture shape ({docId: doc}), using the
    version in force on as_of. The scripted scenarios, rule checks and the
    dashboard read this; for the seeded library it equals the fixtures.
    """
    entries = entries_as_of(records, as_of)
    docs = {}
    for e in entries.values():
        if not e["applicable"]:
            continue
        by = entries[e["supersededBy"]]["id"] if e["supersededBy"] else None
        docs[e["id"]] = {
            "id": e["id"], "title": e["title"], "version": e["version"], "topic": e["topic"], "owner": e["owner"],
            "updated": e["effectiveFrom"], "reviewCycleMonths": months_between(e["effectiveFrom"], e["reviewDate"]),
            "supersededBy": by if by != e["id"] else None,
            "sections": e["sections"],
        }
    order = [r["docId"] for r in records]
    return dict(sorted(docs.items(), key=lambda kv: order.index(kv[0])))


def passage_meta(entry: dict) -> dict:
    """What an evidence panel shows about the version a passage came from."""
    return {
        "version": entry["version"], "title": entry["title"], "owner": entry["owner"],
        "effectiveFrom": entry["effectiveFrom"], "reviewDate": entry["reviewDate"],
        "state": entry["state"], "note": entry["note"], "supersededBy": entry["supersededBy"],
    }
