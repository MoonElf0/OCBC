"""
Assessment AI HTTP API.

    uvicorn app.main:app --reload --port 8000     (from backend/)

The frontend talks to this only in backend mode (VITE_MODE=backend); demo
mode stays fully offline. Response shapes follow contract/ and the
frontend's seams (src/lib/agent.js, src/lib/pipeline.js).

Two kinds of answer are verified here:
  asked      a question to the Policy Assistant. Its answers and judge
             verdicts are scripted (fixtures); retrieval, rule checks,
             index and routing are computed.
  submitted  any question + answer + citations pasted in by a user, and
  correction any answer a reviewer writes. Both run the general pipeline
             (app/pipeline.py): nothing in them is scripted.
"""
import asyncio
import json
import threading
from copy import deepcopy
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import agent, db, evaluation, fixtures, library, pipeline
from .release_check import compare_versions
from .freshness import freshness_of
from .metrics import Metrics
from .models import get_provider
from .retrieval import Index
from .routing import HIGH_RISK_TOPICS, RULES, auto_route_reasons, escalation_reasons, review_reasons
from .verifier import PROVENANCE, verify

ASKED_BY = "You · Relationship Manager, Business Banking (simulated)"
EMPLOYEE = {"id": "emp-rm", "name": "You", "role": "Relationship Manager · Business Banking"}

# Prototype only: there is no sign-in. These identities are picked in the
# interface and recorded as simulated on every event.
SIMULATED_REVIEWERS = [
    {"id": "rev-credit", "name": "Reviewer A", "role": "Business Banking Credit Risk"},
    {"id": "rev-treasury", "name": "Reviewer B", "role": "Global Markets Treasury"},
    {"id": "rev-compliance", "name": "Reviewer C", "role": "Financial Crime Compliance"},
]

STATES = {
    "verifying": "Under verification",
    "review-required": "Review required",
    "cleared": "No review required",
    "approved": "Approved",
    "corrected": "Corrected",
    "rejected": "Rejected",
    "reverify-required": "Evidence changed — re-verification required",
}

app = FastAPI(title="Assessment AI", version="0.3.0")

_conn = None
_lock = threading.RLock()
_index: tuple[str, Index] | None = None
_provider = None
_seeding = False


def conn():
    global _conn
    if _conn is None:
        _conn = db.connect()
    _ensure_seed_answers(_conn)
    return _conn


def provider():
    global _provider
    if _provider is None:
        _provider = get_provider()
    return _provider


def library_docs() -> tuple[dict, Index]:
    """Documents in force today and a retrieval index over them (scripted path)."""
    global _index
    c = conn()
    rev = db.library_rev(c)
    if not _index or _index[0] != rev:
        _index = (rev, Index(db.documents(c)))
    return _index[1].docs, _index[1]


def entries(as_of: str) -> dict:
    return library.entries_as_of(db.version_records(conn()), as_of)


def draft_only_docs() -> set[str]:
    recs = db.version_records(conn())
    approved = {r["docId"] for r in recs if r["status"] != "draft"}
    return {r["docId"] for r in recs if r["status"] == "draft" and r["docId"] not in approved}


# ── assessment ───────────────────────────────────────────────────────────

def annotate(result: dict, ents: dict) -> dict:
    """
    Scripted path: attach the exact version each passage came from, and the
    library text of that version, so evidence panels show what the backend
    used rather than the frontend's fixtures.
    """
    result = deepcopy(result)  # the scripted verdicts share objects with the cached fixtures
    applicable = {e["id"]: e for e in ents.values() if e["applicable"]}

    def fix(p):
        if isinstance(p, dict) and "docId" in p and p["docId"] in applicable:
            e = applicable[p["docId"]]
            sec = next((s for s in e["sections"] if s["id"] == p["section"]), None)
            if sec:
                p["passage"] = sec["text"]
            p.update(library.passage_meta(e))
        return p

    for c in result["claims"]:
        for k in ("source", "counter"):
            if c.get(k):
                fix(c[k])
    for chk in result["checks"]:
        for ev in chk["evidence"]:
            fix(ev)
    return result


def versions_used(result: dict) -> list[dict]:
    used = {}
    refs = [r for c in result["claims"] for r in (c.get("source"), c.get("counter")) if r]
    refs += [ev for chk in result["checks"] for ev in chk["evidence"] if "docId" in ev]
    for r in refs:
        if r.get("version"):
            used.setdefault((r["docId"], r["version"]), {"docId": r["docId"], "version": r["version"], "title": r.get("title"), "state": r.get("state")})
    return sorted(used.values(), key=lambda v: (v["docId"], v["version"]))


def assess_answer(a: dict) -> tuple[dict, str | None]:
    """(result, topic). Scripted for an asked question on its first verification, the pipeline otherwise."""
    as_of = a["asOf"]
    ents = entries(as_of)
    if a["kind"] == "asked" and a["scenarioId"] and not a.get("latestAssessment"):
        sc = fixtures.scenario_by_id(a["scenarioId"])
        docs, index = library_docs()
        result = verify(sc, docs, db.today(conn()), question=a["question"] if a["scenarioId"] != "fallback" else None, index=index)
        result = annotate(result, ents)
        return result, sc.get("topic")
    result = pipeline.run(a["question"], a["text"], a["citations"], ents, as_of, provider(), drafts=draft_only_docs())
    return result, result["assessment"]["topic"] or a.get("topic")


def record_assessment(a: dict, trigger: str) -> tuple[dict, dict | None, str]:
    """Assess, store a new assessment (earlier ones are kept), apply the review rules."""
    result, topic = assess_answer(a)
    if a["kind"] == "asked" and a["scenarioId"] and trigger == "initial":
        sc = fixtures.scenario_by_id(a["scenarioId"])
        reasons = auto_route_reasons(result, sc.get("highStakes", False))
    else:
        reasons = review_reasons(result, topic)
    if trigger == "reverify" and reasons:
        reasons = [*reasons, "evidence-changed"]
    if a["kind"] == "correction":
        state = "approved"  # the reviewer wrote it; their decision is the review
    else:
        state = "review-required" if reasons else "cleared"
    routing = {"reasons": reasons, "mandatory": bool(reasons) and a["kind"] != "correction"}
    aid = db.add_assessment(conn(), a["id"], trigger, result, versions_used(result), routing, state, topic)
    db.log(conn(), "assessed", answer_id=a["id"], assessment=aid, trigger=trigger, index=result["score"], band=result["band"]["id"],
           partial=bool((result.get("assessment") or {}).get("partial")), reasons=reasons, state=state)
    routed = None
    if reasons and a["kind"] != "correction":
        routed = db.route(conn(), {**a, "id": a["id"]}, "auto", reasons, "", ASKED_BY)
        db.log(conn(), "routed for review", answer_id=a["id"], review_id=routed["queueId"], reasons=reasons)
    return result, routed, aid


def _ensure_seed_answers(c) -> None:
    """Seeded queue items get an answer record, so every review has the same shape."""
    global _seeding
    if _seeding:
        return
    rows = db.unlinked_reviews(c)
    if not rows:
        return
    _seeding = True
    try:
        _seed_answers(c, rows)
    finally:
        _seeding = False


def _seed_answers(c, rows) -> None:
    with _lock:
        for r in rows:
            sc = fixtures.scenario_by_id(r["scenarioId"])
            aid = db.add_answer(c, kind="asked", question=sc["question"], text=sc["answer"]["text"], citations=sc["answer"]["citations"],
                                as_of=db.today(c), scenario_id=sc["id"], topic=sc["topic"])
            a = db.get_answer(c, aid)
            result, topic = assess_answer(a)
            reasons = r["reasons"]
            db.add_assessment(c, aid, "initial", result, versions_used(result), {"reasons": reasons, "mandatory": True}, "review-required", topic)
            db.link_review(c, r["id"], aid)
            db.log(c, "routed for review", answer_id=aid, review_id=r["id"], reasons=reasons, seeded=True)


def answer_view(a: dict) -> dict:
    return {**a, "stateLabel": STATES.get(a["state"], a["state"])}


def review_view(r: dict) -> dict:
    """A queue item plus what the reviewer needs to see."""
    a = db.get_answer(conn(), r["answerId"]) if r["answerId"] else None
    return {**r, "question": a["question"], "answerText": a["text"], "citations": a["citations"], "topic": a["topic"],
            "kind": a["kind"], "result": a["result"], "assessment": a["assessment"], "answerState": a["state"],
            "stateLabel": STATES.get(a["state"])}


def queue() -> list[dict]:
    return [review_view(r) for r in db.reviews(conn())]


# ── schemas ──────────────────────────────────────────────────────────────

DATE = r"^\d{4}-\d{2}-\d{2}$"


class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class SubmitIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    answer: str = Field(min_length=1, max_length=8000)
    citations: list[str] = Field(default_factory=list, max_length=20)
    asOf: str | None = Field(default=None, pattern=DATE)


class FeedbackIn(BaseModel):
    value: Literal["helpful", "wrong"] | None


class EscalateIn(BaseModel):
    note: str = Field(default="", max_length=2000)


class DecisionIn(BaseModel):
    decision: Literal["approved", "corrected", "rejected"]
    note: str = Field(default="", max_length=2000)
    correctedText: str | None = Field(default=None, max_length=8000)
    reviewerId: str = SIMULATED_REVIEWERS[0]["id"]
    overrideFlags: bool = False


class SectionIn(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    heading: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=1, max_length=5000)


class DraftIn(BaseModel):
    version: str | None = Field(default=None, pattern=r"^v\d+(\.\d+)*$")
    sections: list[SectionIn] = Field(min_length=1)
    effectiveFrom: str | None = Field(default=None, pattern=DATE)
    reviewDate: str | None = Field(default=None, pattern=DATE)
    changeNote: str = Field(min_length=3, max_length=1000)
    owner: str | None = Field(default=None, max_length=200)


class LegacySectionIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    updated: str | None = Field(default=None, pattern=DATE)


class EvalIn(BaseModel):
    split: Literal["heldout", "tuning", "all"] = "heldout"


def _get(answer_id: str) -> dict:
    a = db.get_answer(conn(), answer_id)
    if not a:
        raise HTTPException(404, "No such answer")
    return a


def _sse(result: dict, done: dict, pace: float):
    def event(name: str, data: dict) -> str:
        return f"event: {name}\ndata: {json.dumps(data)}\n\n"

    async def stream():
        await asyncio.sleep(0.1 * pace)
        for i, meta in enumerate(fixtures.checks_meta()):
            yield event("check_start", {"i": i})
            await asyncio.sleep(meta["ms"] / 1000 * pace)
            payload = {"i": i, "check": result["checks"][i]}
            if meta["id"] == "groundedness":
                payload["claims"] = result["claims"]  # claim flags appear once groundedness resolves
            yield event("check_done", payload)
        await asyncio.sleep(0.12 * pace)
        yield event("complete", {"result": result, **done})

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


# ── routes: answers ──────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"ok": True, "provenance": PROVENANCE, "model": provider().status(), "highRiskTopics": HIGH_RISK_TOPICS,
            "reviewRules": RULES, "reviewers": [{**r, "simulated": True} for r in SIMULATED_REVIEWERS], "states": STATES,
            "today": db.today(conn())}


@app.post("/api/ask")
def ask(body: AskIn):
    """The answering agent. Returns the answer only; verification is a separate call."""
    reply = agent.ask(body.question)
    sc = fixtures.scenario_by_id(reply["scenarioId"])
    with _lock:
        answer_id = db.add_answer(conn(), kind="asked", question=body.question, text=reply["text"], citations=reply["citations"],
                                  as_of=db.today(conn()), scenario_id=reply["scenarioId"], topic=sc.get("topic"))
        db.log(conn(), "asked", actor=EMPLOYEE["name"], role="employee", simulated=True, answer_id=answer_id)
    return {"answerId": answer_id, **reply}


@app.post("/api/answers")
def submit(body: SubmitIn):
    """Submit any question and AI-generated answer for verification. Not the Policy Assistant: nothing is scripted."""
    as_of = body.asOf or db.today(conn())
    with _lock:
        answer_id = db.add_answer(conn(), kind="submitted", question=body.question.strip(), text=body.answer.strip(),
                                  citations=[c.strip() for c in body.citations if c.strip()], as_of=as_of)
        db.log(conn(), "submitted for verification", actor=EMPLOYEE["name"], role="employee", simulated=True, answer_id=answer_id)
    a = db.get_answer(conn(), answer_id)
    return {"answerId": answer_id, "scenarioId": None, "text": a["text"], "citations": a["citations"], "asOf": as_of}


@app.post("/api/verify/preview")
def preview(body: SubmitIn):
    """Run the pipeline without storing anything (a reviewer checking a correction before sending it)."""
    as_of = body.asOf or db.today(conn())
    return pipeline.run(body.question, body.answer, body.citations, entries(as_of), as_of, provider(), drafts=draft_only_docs())


@app.get("/api/answers/{answer_id}")
def get_answer(answer_id: str):
    return answer_view(_get(answer_id))


@app.get("/api/answers/{answer_id}/verify")
async def verify_stream(answer_id: str, pace: float = 1.0):
    """
    Server-sent events, in the order the frontend's pipeline.js emits them:
      check_start {i}  ·  check_done {i, check[, claims]}  ·  complete {result, routed, state, assessmentId}
    The result is computed up front; `pace` (0 in tests) spaces the events so
    each check shows its working state, as in demo mode.
    """
    a = _get(answer_id)
    with _lock:
        if a["latestAssessment"]:
            result, routed, aid = a["result"], None, a["latestAssessment"]  # already assessed: replay, don't re-run
        else:
            result, routed, aid = record_assessment(a, "initial")
        state = db.get_answer(conn(), answer_id)["state"]
    return _sse(result, {"routed": routed, "state": state, "stateLabel": STATES[state], "assessmentId": aid}, pace)


@app.post("/api/answers/{answer_id}/reverify")
def reverify(answer_id: str):
    """A new assessment against the library as it is now. The earlier one is kept for comparison."""
    a = _get(answer_id)
    with _lock:
        previous = a["latestAssessment"]
        result, routed, aid = record_assessment(a, "reverify")
        if a["kind"] == "correction":
            db.set_state(conn(), answer_id, "approved")
    return {"answer": answer_view(_get(answer_id)), "assessmentId": aid, "previousAssessmentId": previous, "result": result, "routed": routed,
            "queue": queue()}


@app.get("/api/answers/{answer_id}/history")
def history(answer_id: str):
    a = _get(answer_id)
    related = [answer_id] + db.child_answer_ids(conn(), answer_id)
    corrections = [answer_view(db.get_answer(conn(), i)) for i in related[1:]]
    return {"answer": answer_view(a), "assessments": db.assessments_of(conn(), answer_id), "corrections": corrections,
            "correctionAssessments": {c["id"]: db.assessments_of(conn(), c["id"]) for c in corrections},
            "events": db.events(conn(), answer_ids=related)}


@app.post("/api/answers/{answer_id}/feedback")
def feedback(answer_id: str, body: FeedbackIn):
    _get(answer_id)
    db.set_feedback(conn(), answer_id, body.value)
    db.log(conn(), "feedback", actor=EMPLOYEE["name"], role="employee", simulated=True, answer_id=answer_id, value=body.value)
    return {"ok": True}


@app.post("/api/answers/{answer_id}/escalate")
def escalate(answer_id: str, body: EscalateIn):
    a = _get(answer_id)
    docs, _ = library_docs()
    today = db.today(conn())
    reasons = escalation_reasons(a["result"], lambda d: d in docs and freshness_of(d, docs, today)["stale"])
    with _lock:
        routed = db.route(conn(), a, "employee", reasons, body.note.strip(), ASKED_BY)
        if a["state"] in ("cleared", "verifying"):
            db.set_state(conn(), answer_id, "review-required")
        db.log(conn(), "escalated by employee", actor=EMPLOYEE["name"], role="employee", simulated=True, answer_id=answer_id,
               review_id=routed["queueId"], note=body.note.strip(), reasons=reasons)
    return {"routed": routed, "queue": queue(), "state": db.get_answer(conn(), answer_id)["state"]}


# ── routes: review ───────────────────────────────────────────────────────

@app.get("/api/reviews")
def list_reviews():
    return queue()


@app.get("/api/reviewers")
def reviewers():
    return [{**r, "simulated": True} for r in SIMULATED_REVIEWERS]


def _category(result: dict | None, scenario_id: str | None) -> tuple[str, str | None]:
    hint = fixtures.load()["REVIEW_HINTS"].get(scenario_id or "", None)
    if hint:
        return hint.get("category", "other"), hint.get("docId")
    claims = (result or {}).get("claims", [])
    for status, cat in (("conflicting", "conflicting-figure"), ("unsupported", "stale-source"), ("insufficient", "no-source"), ("no-source", "no-source"), ("off-intent", "off-intent")):
        c = next((c for c in claims if c["status"] == status), None)
        if c:
            src = c.get("source") or {}
            return cat, src.get("docId")
    return "other", None


@app.post("/api/reviews/{review_id}/decision")
def decide(review_id: str, body: DecisionIn):
    item = db.get_review(conn(), review_id)
    if not item:
        raise HTTPException(404, "No such review")
    if item["status"] != "pending":
        raise HTTPException(409, "Already decided")
    reviewer = next((r for r in SIMULATED_REVIEWERS if r["id"] == body.reviewerId), None)
    if not reviewer:
        raise HTTPException(422, "Unknown reviewer identity")
    note = body.note.strip()
    if len(note) < 5:
        raise HTTPException(422, "A decision needs a note explaining it (at least 5 characters).")
    a = db.get_answer(conn(), item["answerId"])
    result = a["result"] or {}
    flags = [c for c in result.get("claims", []) if c["status"] != "supported"]
    partial = bool((result.get("assessment") or {}).get("partial"))
    if body.decision == "approved" and (flags or partial) and not body.overrideFlags:
        raise HTTPException(422, "This answer has flagged or unchecked claims. Approving it needs an explicit override.")
    corrected = (body.correctedText or "").strip() or None
    if body.decision == "corrected" and (not corrected or corrected == a["text"].strip()):
        raise HTTPException(422, "A correction must change the answer.")

    actor = {"actor": f"{reviewer['name']} (simulated)", "role": f"reviewer · {reviewer['role']}", "simulated": True}
    with _lock:
        recheck = None
        if body.decision == "corrected":
            # Any correction, in the reviewer's own words, is verified by the same pipeline as any other answer.
            cid = db.add_answer(conn(), kind="correction", question=a["question"], text=corrected, citations=[], as_of=a["asOf"],
                                parent_id=a["id"], topic=a["topic"])
            db.log(conn(), "correction written", answer_id=cid, review_id=review_id, **actor, parent=a["id"])
            cres, _, caid = record_assessment(db.get_answer(conn(), cid), "correction")
            cflags = [c for c in cres["claims"] if c["status"] not in ("supported",)]
            if any(c["status"] in ("conflicting", "insufficient", "unsupported") for c in cflags) and not body.overrideFlags:
                # Keep the record of the attempt, but don't send a correction that fails its own check without an override.
                db.set_state(conn(), cid, "rejected")
                db.log(conn(), "correction held back", answer_id=cid, review_id=review_id, **actor, reason="correction has flagged claims")
                raise HTTPException(422, json.dumps({"message": "The correction has flagged claims of its own. Fix them, or confirm the override.", "result": cres}))
            recheck = {"answerId": cid, "assessmentId": caid, "result": cres}
        outcome = {
            "decision": body.decision,
            "note": note,
            "correctedText": corrected if body.decision == "corrected" else None,
            "recheck": recheck,
            "reviewer": f"{reviewer['name']} (simulated) · {reviewer['role']}",
            "reviewerId": reviewer["id"],
            "simulatedIdentity": True,
            "override": bool(body.overrideFlags and (flags or partial)),
            "at": db.now(),
            "reviewedAssessmentId": a["latestAssessment"],
            "policyVersions": (a["assessment"] or {}).get("policyVersions", []),
        }
        category, doc_id = _category(result, a["scenarioId"])
        row = {"topic": a["topic"] or "sme", "docId": doc_id, "decision": body.decision, "category": "none" if body.decision == "approved" else category}
        db.resolve_review(conn(), review_id, outcome, row)
        askers = [x for x in [item["answerId"], *item["watchers"]] if x]
        for x in askers:
            db.set_state(conn(), x, body.decision)
        db.log(conn(), f"review decision: {body.decision}", answer_id=a["id"], review_id=review_id, **actor, note=note,
               override=outcome["override"], correction=(recheck or {}).get("answerId"), reviewedAssessment=a["latestAssessment"])
    return {"outcome": outcome, "askers": askers, "queue": queue()}


# ── routes: library ──────────────────────────────────────────────────────

def library_view() -> dict:
    today = db.today(conn())
    recs = db.version_records(conn())
    ents = library.entries_as_of(recs, today)
    docs = {}
    for r in recs:
        d = docs.setdefault(r["docId"], {"docId": r["docId"], "title": r["title"], "topic": r["topic"], "owner": r["owner"], "versions": []})
        e = ents.get(library.key_of(r["docId"], r["version"]))
        d["versions"].append({**r, "inForce": bool(e and e["applicable"] and e["state"] != "superseded"), "state": e["state"] if e else ("draft" if r["status"] == "draft" else "not yet effective"),
                              "note": e["note"] if e else None, "supersededByKey": e["supersededBy"] if e else None})
        if r["status"] != "draft":
            d["title"], d["owner"] = r["title"], r["owner"]
    for d in docs.values():
        d["versions"].sort(key=lambda v: (v["effectiveFrom"], v["createdAt"]), reverse=True)
        d["current"] = next((v for v in d["versions"] if v["inForce"]), None)
    return {"asOf": today, "documents": list(docs.values())}


@app.get("/api/library")
def get_library():
    return library_view()


@app.post("/api/library/{doc_id}/versions")
def propose_version(doc_id: str, body: DraftIn):
    c = conn()
    today = db.today(c)
    effective = body.effectiveFrom or today
    with _lock:
        try:
            rec = db.add_draft(c, doc_id, body.version or db.next_version(c, doc_id), [s.model_dump() for s in body.sections], effective,
                               body.reviewDate or library.add_months(effective, 12), body.changeNote.strip(), owner=body.owner)
        except KeyError:
            raise HTTPException(404, "No such document")
        except ValueError as e:
            raise HTTPException(409, str(e))
        db.log(c, "policy version drafted", actor="Policy owner (simulated)", role="policy owner", simulated=True, doc=doc_id, version=rec["version"])
    return rec


def _impact(doc_id: str, version: str) -> list[dict]:
    """Mark every current assessment that relied on another version of doc_id. Original results are kept."""
    out = []
    for asm in db.assessments_relying_on(conn(), doc_id, version):
        used = [v for v in asm["policyVersions"] if v["docId"] == doc_id]
        note = {"docId": doc_id, "newVersion": version, "usedVersions": [v["version"] for v in used], "at": db.now()}
        db.mark_evidence_changed(conn(), asm["id"], note)
        a = db.get_answer(conn(), asm["answerId"])
        if a["state"] != "verifying":
            db.set_state(conn(), a["id"], "reverify-required")
        db.log(conn(), "evidence changed", answer_id=a["id"], assessment=asm["id"], doc=doc_id, newVersion=version, previousState=a["state"])
        out.append({"answerId": a["id"], "assessmentId": asm["id"], "question": a["question"], "kind": a["kind"], "previousState": a["state"],
                    "usedVersions": note["usedVersions"]})
    return out


@app.post("/api/library/{doc_id}/versions/{version}/approve")
def approve(doc_id: str, version: str):
    with _lock:
        try:
            rec = db.approve_version(conn(), doc_id, version)
        except KeyError:
            raise HTTPException(404, "No such version")
        except ValueError as e:
            raise HTTPException(409, str(e))
        db.log(conn(), "policy version approved", actor="Policy owner (simulated)", role="policy owner", simulated=True, doc=doc_id, version=version, replaces=rec["replaces"])
        impacted = _impact(doc_id, version) if rec["effectiveFrom"] <= db.today(conn()) else []
    return {"version": rec, "impacted": impacted, "library": library_view()}


@app.get("/api/documents")
def documents():
    docs, _ = library_docs()
    today = db.today(conn())
    return [{**d, "freshness": {k: v for k, v in freshness_of(d["id"], docs, today).items() if k != "supersededBy"}} for d in docs.values()]


@app.put("/api/documents/{doc_id}/sections/{section_id}")
def edit_section(doc_id: str, section_id: str, body: LegacySectionIn):
    """
    Kept for older clients. It no longer edits approved text: it drafts a new
    version with the changed section and approves it, effective today.
    """
    current = db.documents(conn()).get(doc_id)
    if not current or not any(s["id"] == section_id for s in current["sections"]):
        raise HTTPException(404, "No such section")
    sections = [{**s, "text": body.text} if s["id"] == section_id else s for s in current["sections"]]
    draft = propose_version(doc_id, DraftIn(sections=[SectionIn(**s) for s in sections], effectiveFrom=body.updated or db.today(conn()), changeNote=f"Edited {section_id}."))
    approve(doc_id, draft["version"])
    return {"ok": True, "version": draft["version"]}


# ── routes: dashboard, evaluation, admin ─────────────────────────────────

@app.get("/api/metrics")
def metrics():
    data, live = db.metrics_data(conn())
    return {**Metrics(data, db.today(conn()), live).dashboard(), "liveDecisions": live}


@app.get("/api/release-check")
def release_check():
    """
    Agent release check: the verifier scores agent v1 and agent v2 on the fixed
    test set, then the versions are compared. Answers are scripted; retrieval,
    rule checks, scores and the comparison are computed here.
    """
    f = fixtures.load()
    docs, index = library_docs()
    today = db.today(conn())
    ids = [sid for q in f["EVAL_SET"] for sid in q["answers"].values()]
    results = {sid: verify(fixtures.scenario_by_id(sid), docs, today, index=index) for sid in ids}
    report = compare_versions(f, docs, results.__getitem__, lambda d: freshness_of(d, docs, today))
    answers = {sid: {"text": fixtures.scenario_by_id(sid)["answer"]["text"], "result": results[sid]} for sid in ids}
    return {**report, "answers": answers, "provenance": PROVENANCE}


@app.get("/api/eval")
def eval_info():
    return {"dataset": evaluation.dataset_summary(), "runs": db.eval_runs(conn()), "definitions": evaluation.DEFINITIONS, "model": provider().status()}


@app.post("/api/eval/run")
def eval_run(body: EvalIn):
    run = evaluation.run(provider(), split=body.split)
    db.add_eval_run(conn(), run)
    return run


@app.get("/api/events")
def all_events():
    return db.events(conn())


@app.post("/api/admin/reset")
def admin_reset():
    """Restore the seeded demo state (library, queue, history)."""
    global _index
    with _lock:
        db.reset(conn())
        _index = None
    return {"ok": True}


# Serve the built frontend when it exists, so one process can host both.
_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="frontend")

