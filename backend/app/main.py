"""
Assessment AI HTTP API.

    uvicorn app.main:app --reload --port 8000     (from backend/)

The frontend talks to this only in live mode (VITE_MODE=live); demo mode
stays fully offline. Response shapes follow contract/ and the frontend's
seams (src/lib/agent.js, src/lib/pipeline.js).
"""
import asyncio
import json
import threading
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import agent, db, fixtures
from .evaluation import compare_versions
from .freshness import freshness_of
from .metrics import Metrics
from .retrieval import Index
from .routing import auto_route_reasons, escalation_reasons
from .verifier import PROVENANCE, verify

ASKED_BY = "You · Relationship Manager, Business Banking"
REVIEWER = "Policy Reviewer · Business Banking Credit Risk"

app = FastAPI(title="Assessment AI", version="0.2.0")

_conn = None
_lock = threading.Lock()
_index: tuple[str, Index] | None = None


def conn():
    global _conn
    if _conn is None:
        _conn = db.connect()
    return _conn


def library() -> tuple[dict, Index]:
    """Current documents and a retrieval index over them, rebuilt when they change."""
    global _index
    c = conn()
    rev = db.library_rev(c)
    if not _index or _index[0] != rev:
        _index = (rev, Index(db.documents(c)))
    return _index[1].docs, _index[1]


def run_verify(scenario: dict, question: str | None) -> dict:
    docs, index = library()
    return verify(scenario, docs, db.today(conn()), question=question, index=index)


def review_view(r: dict) -> dict:
    """A queue item plus what the reviewer needs to see."""
    sc = fixtures.scenario_by_id(r["scenarioId"])
    ans = db.get_answer(conn(), r["answerId"]) if r["answerId"] else None
    result = (ans or {}).get("result") or run_verify(sc, (ans or {}).get("question"))
    return {**r, "question": (ans or {}).get("question") or sc.get("question"), "answerText": sc["answer"]["text"], "result": result}


def queue() -> list[dict]:
    return [review_view(r) for r in db.reviews(conn())]


# ── schemas ──────────────────────────────────────────────────────────────

class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class FeedbackIn(BaseModel):
    value: Literal["helpful", "wrong"] | None


class EscalateIn(BaseModel):
    note: str = Field(default="", max_length=2000)


class DecisionIn(BaseModel):
    decision: Literal["approved", "corrected", "rejected"]
    note: str = Field(default="", max_length=2000)
    correctedText: str | None = Field(default=None, max_length=5000)


class SectionIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    updated: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


# ── routes ───────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"ok": True, "provenance": PROVENANCE}


@app.post("/api/ask")
def ask(body: AskIn):
    """The answering agent. Returns the answer only; verification is a separate call."""
    reply = agent.ask(body.question)
    with _lock:
        answer_id = db.add_answer(conn(), body.question, reply)
    return {"answerId": answer_id, **reply}


@app.get("/api/answers/{answer_id}")
def get_answer(answer_id: str):
    a = db.get_answer(conn(), answer_id)
    if not a:
        raise HTTPException(404, "No such answer")
    return a


@app.get("/api/answers/{answer_id}/verify")
async def verify_stream(answer_id: str, pace: float = 1.0):
    """
    Server-sent events, in the order the frontend's pipeline.js emits them:
      check_start {i}  ·  check_done {i, check[, claims]}  ·  complete {result, routed}
    The result is computed up front; `pace` (0 in tests) spaces the events so
    each check shows its working state, as in demo mode.
    """
    a = db.get_answer(conn(), answer_id)
    if not a:
        raise HTTPException(404, "No such answer")
    sc = fixtures.scenario_by_id(a["scenarioId"])
    with _lock:
        result = run_verify(sc, a["question"])
        db.save_result(conn(), answer_id, result)
        reasons = auto_route_reasons(result, sc.get("highStakes", False))
        routed = db.route(conn(), a, "auto", reasons, "", ASKED_BY) if reasons else None

    def event(name: str, data: dict) -> str:
        return f"event: {name}\ndata: {json.dumps(data)}\n\n"

    async def stream():
        await asyncio.sleep(0.1 * pace)
        for i, meta in enumerate(fixtures.checks_meta()):
            yield event("check_start", {"i": i})
            await asyncio.sleep(meta["ms"] / 1000 * pace)
            done = {"i": i, "check": result["checks"][i]}
            if meta["id"] == "groundedness":
                done["claims"] = result["claims"]  # claim flags appear once groundedness resolves
            yield event("check_done", done)
        await asyncio.sleep(0.12 * pace)
        yield event("complete", {"result": result, "routed": routed})

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.post("/api/answers/{answer_id}/feedback")
def feedback(answer_id: str, body: FeedbackIn):
    if not db.get_answer(conn(), answer_id):
        raise HTTPException(404, "No such answer")
    db.set_feedback(conn(), answer_id, body.value)
    return {"ok": True}


@app.post("/api/answers/{answer_id}/escalate")
def escalate(answer_id: str, body: EscalateIn):
    a = db.get_answer(conn(), answer_id)
    if not a:
        raise HTTPException(404, "No such answer")
    docs, _ = library()
    today = db.today(conn())
    reasons = escalation_reasons(a["result"], lambda d: d in docs and freshness_of(d, docs, today)["stale"])
    with _lock:
        routed = db.route(conn(), a, "employee", reasons, body.note.strip(), ASKED_BY)
    return {"routed": routed, "queue": queue()}


@app.get("/api/reviews")
def list_reviews():
    return queue()


@app.post("/api/reviews/{review_id}/decision")
def decide(review_id: str, body: DecisionIn):
    item = db.get_review(conn(), review_id)
    if not item:
        raise HTTPException(404, "No such review")
    if item["status"] != "pending":
        raise HTTPException(409, "Already decided")
    f = fixtures.load()
    hint = f["REVIEW_HINTS"].get(item["scenarioId"], {})
    # A correction sent as drafted is re-verified like any other answer.
    draft = f["CORRECTIONS"].get(item["scenarioId"])
    corrected = (body.correctedText or "").strip() or None
    recheck = None
    if body.decision == "corrected" and draft and corrected == draft["answer"]["text"]:
        recheck = {"scenarioId": draft["id"], "result": run_verify(draft, None)}
    outcome = {
        "decision": body.decision,
        "note": body.note.strip(),
        "correctedText": corrected if body.decision == "corrected" else None,
        "recheck": recheck,
        "reviewer": REVIEWER,
        "at": "Today",
    }
    row = {
        "topic": fixtures.scenario_by_id(item["scenarioId"])["topic"],
        "docId": hint.get("docId"),
        "decision": body.decision,
        "category": "none" if body.decision == "approved" else hint.get("category", "none"),
    }
    with _lock:
        db.resolve_review(conn(), review_id, outcome, row)
    askers = [x for x in [item["answerId"], *item["watchers"]] if x]
    return {"outcome": outcome, "askers": askers, "queue": queue()}


@app.get("/api/metrics")
def metrics():
    data, live = db.metrics_data(conn())
    return {**Metrics(data, db.today(conn()), live).dashboard(), "liveDecisions": live}


@app.get("/api/evaluation")
def evaluation():
    """
    Agent release check: the live verifier scores agent v1 and agent v2 on the
    fixed test set, then the versions are compared. Answers are scripted;
    retrieval, rule checks, scores and the comparison are computed here.
    """
    f = fixtures.load()
    docs, _ = library()
    today = db.today(conn())
    ids = [sid for q in f["EVAL_SET"] for sid in q["answers"].values()]
    results = {sid: run_verify(fixtures.scenario_by_id(sid), None) for sid in ids}
    report = compare_versions(f, docs, results.__getitem__, lambda d: freshness_of(d, docs, today))
    answers = {sid: {"text": fixtures.scenario_by_id(sid)["answer"]["text"], "result": results[sid]} for sid in ids}
    return {**report, "answers": answers, "provenance": PROVENANCE}


@app.get("/api/documents")
def documents():
    docs, _ = library()
    today = db.today(conn())
    return [{**d, "freshness": {k: v for k, v in freshness_of(d["id"], docs, today).items() if k != "supersededBy"}} for d in docs.values()]


@app.put("/api/documents/{doc_id}/sections/{section_id}")
def edit_section(doc_id: str, section_id: str, body: SectionIn):
    """Edit the library. Retrieval and rule checks pick the change up on the next verification."""
    with _lock:
        if not db.update_section(conn(), doc_id, section_id, body.text, body.updated):
            raise HTTPException(404, "No such section")
    return {"ok": True}


@app.post("/api/admin/reset")
def admin_reset():
    """Restore the seeded demo state (library, queue, history)."""
    with _lock:
        db.reset(conn())
    return {"ok": True}


# Serve the built frontend when it exists, so one process can host both.
_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="frontend")
