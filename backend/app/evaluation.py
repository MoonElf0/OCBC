"""
Agent release check. Port of frontend/src/lib/evaluation.js;
tests/test_evaluation.py keeps them identical.

The same verifier scores agent v1 and agent v2 on one fixed test set. The
API runs the live verifier (real retrieval + rule checks) over every answer
and feeds the results through this comparison, so editing a policy document
changes the release check too.
"""
from typing import Callable

SEVERITY = {"supported": 0, "stale": 1, "off-intent": 1, "unsupported": 2, "no-source": 2, "conflicting": 3}


def summarise(result: dict) -> dict:
    flags = [c for c in result["claims"] if c["status"] != "supported"]
    return {
        "score": result["score"],
        "band": result["band"]["id"],
        "claims": len(result["claims"]),
        "flags": [{"id": c["id"], "status": c["status"], "short": c.get("short"), "docId": (c.get("source") or {}).get("docId")} for c in flags],
        "declined": len(result["claims"]) == 0,
        "worst": max([SEVERITY[c["status"]] for c in flags], default=0),
    }


def tally(answers: list[dict]) -> dict:
    def n(status: str) -> int:
        return sum(1 for a in answers for f in a["flags"] if f["status"] == status)

    claims = sum(a["claims"] for a in answers)
    c = {
        "answers": len(answers),
        "claims": claims,
        "flagged": sum(len(a["flags"]) for a in answers),
        "unsupported": n("unsupported"),
        "conflicting": n("conflicting"),
        "stale": n("stale"),
        "offIntent": n("off-intent"),
        "noSource": n("no-source"),
        "declined": sum(1 for a in answers if a["declined"]),
        "high": sum(1 for a in answers if a["band"] == "high"),
        "withoutSource": sum(1 for a in answers if any(f["status"] == "no-source" for f in a["flags"])),
    }

    def rate(x: int) -> float | None:
        return x / claims if claims else None

    return {
        **c,
        "flagRate": rate(c["flagged"]),
        "failureRate": rate(c["unsupported"] + c["conflicting"] + c["noSource"]),
        "staleRate": rate(c["stale"]),
    }


def change_of(base: dict, cand: dict) -> str:
    if len(cand["flags"]) > len(base["flags"]) or cand["worst"] > base["worst"]:
        return "regressed"
    if base["flags"] and not cand["flags"]:
        return "fixed"
    if len(cand["flags"]) < len(base["flags"]) or cand["worst"] < base["worst"]:
        return "improved"
    return "unchanged"


def _topic_verdict(changes: list[str]) -> str:
    if "regressed" in changes:
        return "regressed"
    if any(c in ("fixed", "improved") for c in changes):
        return "improved"
    return "unchanged"


def _plural(n: int, one: str) -> str:
    return f"{n} {one if n == 1 else one + 's'}"


def compare_versions(data: dict, docs: dict, result_of: Callable[[str], dict], freshness: Callable[[str], dict]) -> dict:
    base, cand = data["AGENT_VERSIONS"]
    topic_names = {t["id"]: t["name"] for t in data["TOPICS"].values()}
    questions = []
    for q in data["EVAL_SET"]:
        b = summarise(result_of(q["answers"][base["id"]]))
        c = summarise(result_of(q["answers"][cand["id"]]))
        questions.append({
            "id": q["id"], "topic": q["topic"], "question": q["question"],
            "baseId": q["answers"][base["id"]], "candidateId": q["answers"][cand["id"]],
            "base": b, "candidate": c, "change": change_of(b, c),
        })

    topics = []
    for t in data["TOPICS"].values():
        qs = [q for q in questions if q["topic"] == t["id"]]
        topics.append({
            "id": t["id"], "name": t["name"], "questions": len(qs),
            "base": tally([q["base"] for q in qs]), "candidate": tally([q["candidate"] for q in qs]),
            "verdict": _topic_verdict([q["change"] for q in qs]),
        })

    counts = {k: sum(1 for q in questions if q["change"] == k) for k in ("fixed", "improved", "unchanged", "regressed")}
    better = counts["fixed"] + counts["improved"]
    regressed = [q for q in questions if q["change"] == "regressed"]
    if regressed:
        detail = []
        for q in regressed:
            worst = next(f for f in q["candidate"]["flags"] if SEVERITY[f["status"]] == q["candidate"]["worst"])
            note = "" if q["base"]["flags"] else f" ({base['label']} answered this correctly)"
            detail.append(f"{topic_names[q['topic']]}: {worst['short']}{note}")
        release = {
            "id": "hold",
            "title": f"Hold {cand['label']}: it improves {better} of {len(questions)} questions but regresses {len(regressed)}",
            "detail": detail,
        }
    else:
        release = {"id": "ready", "title": f"{cand['label']} improves {better} of {len(questions)} questions with no regressions", "detail": []}

    notes = []
    stale_docs: list[str] = []
    for q in questions:
        for f in q["candidate"]["flags"]:
            if f["status"] == "stale" and f["docId"] not in stale_docs:
                stale_docs.append(f["docId"])
    for doc_id in stale_docs:
        n = sum(1 for q in questions for f in q["candidate"]["flags"] if f["status"] == "stale" and f["docId"] == doc_id)
        fr = freshness(doc_id)
        state = "has been superseded" if fr["state"] == "superseded" else f"is {fr['months']} months old and past its review cycle"
        notes.append({
            "kind": "stale-document",
            "docId": doc_id,
            "text": f"{_plural(n, 'claim')} in {cand['label']} still rest on {doc_id}, which {state}. No agent release fixes this: {docs[doc_id]['owner']} needs to review the document.",
        })
    declined = [q for q in questions if q["candidate"]["declined"] and any(f["status"] == "no-source" for f in q["base"]["flags"])]
    if declined:
        notes.append({
            "kind": "declined",
            "text": f"{cand['label']} declines {_plural(len(declined), 'question')} that {base['label']} answered with no source. "
                    f"Counted as fixed: no approved policy covers {'it' if len(declined) == 1 else 'them'}, so saying so is the correct answer.",
        })

    return {
        "versions": data["AGENT_VERSIONS"],
        "questions": questions,
        "topics": topics,
        "overall": {"base": tally([q["base"] for q in questions]), "candidate": tally([q["candidate"] for q in questions])},
        "counts": counts,
        "release": release,
        "notes": notes,
    }
