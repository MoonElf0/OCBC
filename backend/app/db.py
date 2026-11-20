"""
MongoDB storage. Connection string in MONGODB_URI (put it in backend/.env,
which git ignores), database name in MONGODB_DB (default "assessment").
Seeded from data/fixtures.json on first run; reset with
`python -m app.db --reset` or POST /api/admin/reset. A database written by
an older schema is rebuilt from the seed (it holds demo data only).

Collections
  policy_versions  every version of every policy document; approved
                   text is never edited in place
  topics, weekly_counts   history behind the Trends dashboard
  review_outcomes  tagged reviewer decisions (seeded history + live)
  answers          every answer: asked, submitted for verification,
                   or written by a reviewer as a correction
  assessments      every verification of an answer, kept when a newer
                   one is made, with the policy versions it relied on
  reviews          the human review queue
  events           audit trail: who did what to which answer, when
  eval_runs        evaluation runs and their recorded predictions
  meta             schema version, demo date, counters, library revision

Writes are serialised by main.py's lock; counters use atomic $inc.
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from pymongo import ASCENDING, DESCENDING, MongoClient, ReturnDocument
from pymongo.database import Database

from . import fixtures, library

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DEFAULT_DB = "assessment"
SCHEMA_VERSION = "3-mongo"
COLLECTIONS = ["events", "eval_runs", "reviews", "assessments", "answers", "review_outcomes", "weekly_counts",
               "policy_versions", "topics", "meta"]
METRIC_KEYS = ["answers", "claims", "unsupported", "conflicting", "stale", "noSource", "reviews"]
VERSION_KEYS = ["docId", "version", "status", "title", "topic", "owner", "effectiveFrom", "reviewDate", "replaces",
                "supersededBy", "sections", "changeNote", "createdAt", "approvedAt"]

SYSTEM = "Assessment AI"


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _plain(value):
    """JSON round-trip, so what is stored matches what the API sends (string keys, lists not tuples)."""
    return json.loads(json.dumps(value))


# ── connection and seed ──────────────────────────────────────────────────

def connect(uri: str | None = None, name: str | None = None, client=None) -> Database:
    """Open the database, rebuilding or seeding it as needed. Tests pass `client=mongomock.MongoClient()`."""
    if client is None:
        uri = uri or os.environ.get("MONGODB_URI")
        if not uri:
            raise RuntimeError("MONGODB_URI is not set. Copy backend/.env.example to backend/.env and put your "
                               "MongoDB connection string in it (see backend/README.md).")
        client = MongoClient(uri, serverSelectionTimeoutMS=8000, appname="assessment-ai-backend")
    db = client[name or os.environ.get("MONGODB_DB") or DEFAULT_DB]
    schema = db.meta.find_one({"_id": "schema"})
    if not schema or schema["value"] != SCHEMA_VERSION or db.policy_versions.count_documents({}) == 0:
        # Empty, half-seeded, or written by an older version of the prototype: demo data only, rebuild it.
        for c in db.list_collection_names():
            db.drop_collection(c)
        _indexes(db)
        seed(db)
    return db


def _indexes(db: Database) -> None:
    db.policy_versions.create_index([("docId", ASCENDING), ("version", ASCENDING)], unique=True)
    db.weekly_counts.create_index([("topic", ASCENDING), ("week", ASCENDING)], unique=True)
    db.reviews.create_index([("status", ASCENDING), ("scenarioId", ASCENDING), ("seq", DESCENDING)])
    db.assessments.create_index([("answerId", ASCENDING)])
    db.answers.create_index([("parentId", ASCENDING)])


def reset(db: Database) -> None:
    for c in COLLECTIONS:
        db[c].delete_many({})
    seed(db)


def seed(db: Database) -> None:
    f = fixtures.load()
    db.meta.insert_many([{"_id": k, "value": v} for k, v in {
        "schema": SCHEMA_VERSION, "window_weeks": f["WINDOW_WEEKS"], "today": f["DEMO_TODAY"], "answer_seq": 0,
        "assessment_seq": 0, "outcome_seq": 0, "event_seq": 0, "version_seq": 0, "library_rev": uuid4().hex}.items()])
    db.topics.insert_many([{"_id": t["id"], "name": t["name"], "ord": i} for i, t in enumerate(f["TOPICS"].values())])
    for r in library.seed_records(f["DOCUMENTS"]):
        _insert_version(db, r)
    db.weekly_counts.insert_many([
        {"topic": topic, "week": i, "label": label, **{k: w[k][i] for k in METRIC_KEYS}}
        for topic, w in f["WEEKLY"].items() for i, label in enumerate(f["WEEKS"])
    ])
    for r in f["REVIEW_OUTCOMES"]:
        db.review_outcomes.insert_one({"ord": _next(db, "outcome_seq"), "topic": r["topic"], "decision": r["decision"],
                                       "category": r["category"], "docId": r["docId"], "count": r["count"], "reviewId": None})
    db.reviews.insert_many([
        {"_id": q["id"], "seq": int(q["id"].split("-")[1]), "answerId": None, "scenarioId": q["scenarioId"],
         "askedBy": q["askedBy"], "askedAt": q["askedAt"], "routedBy": q["routedBy"], "reasons": list(q["reasons"]),
         "note": "", "status": "pending", "watchers": [], "outcome": None, "createdAt": q["askedAt"]}
        for q in f["REVIEW_QUEUE_SEED"]
    ])


def _next(db: Database, counter: str) -> int:
    doc = db.meta.find_one_and_update({"_id": counter}, {"$inc": {"value": 1}}, upsert=True, return_document=ReturnDocument.AFTER)
    return doc["value"]


def _meta(db: Database, key: str):
    return db.meta.find_one({"_id": key})["value"]


def _insert_version(db: Database, r: dict) -> None:
    rec = {k: r.get(k) for k in VERSION_KEYS}
    rec["changeNote"] = rec["changeNote"] or ""
    db.policy_versions.insert_one({"_id": f"{r['docId']}@{r['version']}", "ord": _next(db, "version_seq"), **_plain(rec)})


# ── library ──────────────────────────────────────────────────────────────

def today(db: Database) -> str:
    return _meta(db, "today")


def library_rev(db: Database) -> str:
    """Changes whenever the library changes, so the retrieval index is rebuilt."""
    return str(_meta(db, "library_rev"))


def _bump_rev(db: Database) -> None:
    db.meta.update_one({"_id": "library_rev"}, {"$set": {"value": uuid4().hex}})


def _version(doc) -> dict:
    return {k: doc.get(k) for k in VERSION_KEYS}


def version_records(db: Database) -> list[dict]:
    return [_version(d) for d in db.policy_versions.find().sort("ord", ASCENDING)]


def get_version(db: Database, doc_id: str, version: str) -> dict | None:
    doc = db.policy_versions.find_one({"docId": doc_id, "version": version})
    return _version(doc) if doc else None


def documents(db: Database) -> dict:
    """The library in the original fixture shape, as in force today. For the seed this equals the fixtures."""
    return library.current_docs(version_records(db), today(db))


def add_draft(db: Database, doc_id: str, version: str, sections: list[dict], effective_from: str, review_date: str,
              change_note: str, owner: str | None = None, title: str | None = None) -> dict:
    """A new version starts as a draft. Approved versions are never changed."""
    base = db.policy_versions.find_one({"docId": doc_id, "status": {"$ne": "draft"}},
                                       sort=[("effectiveFrom", DESCENDING), ("ord", DESCENDING)])
    if not base:
        raise KeyError(doc_id)
    if db.policy_versions.find_one({"docId": doc_id, "version": version}):
        raise ValueError(f"{doc_id} {version} already exists. Versions are never overwritten.")
    b = _version(base)
    rec = {**b, "version": version, "status": "draft", "effectiveFrom": effective_from, "reviewDate": review_date,
           "replaces": b["version"], "supersededBy": None, "sections": sections, "changeNote": change_note,
           "owner": owner or b["owner"], "title": title or b["title"], "createdAt": now(), "approvedAt": None}
    _insert_version(db, rec)
    return _plain(rec)


def approve_version(db: Database, doc_id: str, version: str) -> dict:
    """Approve a draft. The version it replaces is marked superseded, its text kept for audit."""
    row = get_version(db, doc_id, version)
    if not row:
        raise KeyError(f"{doc_id} {version}")
    if row["status"] != "draft":
        raise ValueError(f"{doc_id} {version} is {row['status']}, not a draft.")
    db.policy_versions.update_one({"docId": doc_id, "version": version}, {"$set": {"status": "approved", "approvedAt": now()}})
    if row["replaces"]:
        db.policy_versions.update_one({"docId": doc_id, "version": row["replaces"], "status": "approved"},
                                      {"$set": {"status": "superseded", "supersededBy": {"docId": doc_id, "version": version}}})
    _bump_rev(db)
    return get_version(db, doc_id, version)


def next_version(db: Database, doc_id: str) -> str:
    """v2.3 -> v2.4 (never reuses an existing label)."""
    labels = {d["version"] for d in db.policy_versions.find({"docId": doc_id}, {"version": 1})}
    latest = db.policy_versions.find_one({"docId": doc_id}, sort=[("ord", DESCENDING)])["version"]
    major, _, minor = latest.lstrip("v").partition(".")
    n = int(minor or 0) + 1
    while f"v{major}.{n}" in labels:
        n += 1
    return f"v{major}.{n}"


# ── metrics ──────────────────────────────────────────────────────────────

def metrics_data(db: Database) -> tuple[dict, list[dict]]:
    """(data shaped like the fixtures, live decisions) for app.metrics.Metrics."""
    topics = {t["_id"]: {"id": t["_id"], "name": t["name"]} for t in db.topics.find().sort("ord", ASCENDING)}
    labels = {r["week"]: r["label"] for r in db.weekly_counts.find({}, {"week": 1, "label": 1})}
    weeks = [labels[w] for w in sorted(labels)]
    weekly = {}
    for t in topics:
        rows = list(db.weekly_counts.find({"topic": t}).sort("week", ASCENDING))
        weekly[t] = {k: [r[k] for r in rows] for k in METRIC_KEYS}
    outcomes, live = [], []
    for r in db.review_outcomes.find().sort("ord", ASCENDING):
        row = {"topic": r["topic"], "decision": r["decision"], "category": r["category"], "docId": r["docId"]}
        if r["reviewId"]:
            live.append({"id": r["reviewId"], **row})
        else:
            outcomes.append({**row, "count": r["count"]})
    data = {
        "TOPICS": topics, "WEEKS": weeks, "WEEKLY": weekly, "REVIEW_OUTCOMES": outcomes, "DOCUMENTS": documents(db),
        "WINDOW_WEEKS": int(_meta(db, "window_weeks")),
    }
    return data, live


# ── answers and assessments ──────────────────────────────────────────────

ANSWER_KEYS = ["kind", "question", "scenarioId", "text", "citations", "topic", "asOf", "parentId", "state",
               "latestAssessment", "feedback", "createdAt"]


def _answer(doc) -> dict | None:
    if not doc:
        return None
    return {"id": doc["_id"], **{k: doc.get(k) for k in ANSWER_KEYS}}


def get_answer(db: Database, answer_id: str) -> dict | None:
    a = _answer(db.answers.find_one({"_id": answer_id}))
    if a:
        latest = get_assessment(db, a["latestAssessment"]) if a["latestAssessment"] else None
        a["result"] = latest["result"] if latest else None
        a["assessment"] = {k: v for k, v in latest.items() if k != "result"} if latest else None
    return a


def add_answer(db: Database, *, kind: str, question: str, text: str, citations: list[str], as_of: str,
               scenario_id: str | None = None, parent_id: str | None = None, topic: str | None = None) -> str:
    answer_id = f"ANS-{_next(db, 'answer_seq'):05d}"
    db.answers.insert_one({"_id": answer_id, "kind": kind, "question": question, "scenarioId": scenario_id, "text": text,
                           "citations": _plain(citations), "topic": topic, "asOf": as_of, "parentId": parent_id,
                           "state": "verifying", "latestAssessment": None, "feedback": None, "createdAt": now()})
    return answer_id


def child_answer_ids(db: Database, parent_id: str) -> list[str]:
    """Corrections written for an answer, oldest first."""
    return [d["_id"] for d in db.answers.find({"parentId": parent_id}, {"_id": 1}).sort("_id", ASCENDING)]


ASSESSMENT_KEYS = ["answerId", "trigger", "result", "policyVersions", "routing", "evidenceChanged", "replacedBy", "createdAt"]


def _assessment(doc) -> dict:
    return {"id": doc["_id"], **{k: doc.get(k) for k in ASSESSMENT_KEYS}}


def get_assessment(db: Database, assessment_id: str) -> dict | None:
    doc = db.assessments.find_one({"_id": assessment_id})
    return _assessment(doc) if doc else None


def assessments_of(db: Database, answer_id: str) -> list[dict]:
    return [_assessment(d) for d in db.assessments.find({"answerId": answer_id}).sort([("createdAt", ASCENDING), ("_id", ASCENDING)])]


def add_assessment(db: Database, answer_id: str, trigger: str, result: dict, policy_versions: list[dict], routing: dict,
                   state: str, topic: str | None) -> str:
    """Record a new assessment. An earlier one is kept and points to its replacement."""
    aid = f"AS-{_next(db, 'assessment_seq'):05d}"
    prev = (db.answers.find_one({"_id": answer_id}, {"latestAssessment": 1}) or {}).get("latestAssessment")
    db.assessments.insert_one({"_id": aid, "answerId": answer_id, "trigger": trigger, "result": _plain(result),
                               "policyVersions": _plain(policy_versions), "routing": _plain(routing), "evidenceChanged": None,
                               "replacedBy": None, "createdAt": now()})
    if prev:
        db.assessments.update_one({"_id": prev}, {"$set": {"replacedBy": aid}})
    changes = {"latestAssessment": aid, "state": state, **({"topic": topic} if topic is not None else {})}
    db.answers.update_one({"_id": answer_id}, {"$set": changes})
    return aid


def set_state(db: Database, answer_id: str, state: str) -> None:
    db.answers.update_one({"_id": answer_id}, {"$set": {"state": state}})


def set_feedback(db: Database, answer_id: str, value: str | None) -> None:
    db.answers.update_one({"_id": answer_id}, {"$set": {"feedback": value}})


def assessments_relying_on(db: Database, doc_id: str, except_version: str) -> list[dict]:
    """Current (not replaced) assessments that used another version of doc_id."""
    out = []
    for d in db.assessments.find({"replacedBy": None}).sort("_id", ASCENDING):
        a = _assessment(d)
        if any(v["docId"] == doc_id and v["version"] != except_version for v in a["policyVersions"]):
            out.append(a)
    return out


def mark_evidence_changed(db: Database, assessment_id: str, note: dict) -> None:
    db.assessments.update_one({"_id": assessment_id}, {"$set": {"evidenceChanged": _plain(note)}})


# ── reviews ──────────────────────────────────────────────────────────────

REVIEW_KEYS = ["answerId", "scenarioId", "askedBy", "askedAt", "routedBy", "reasons", "note", "status", "watchers",
               "outcome", "createdAt"]


def _review(doc) -> dict:
    return {"id": doc["_id"], **{k: doc.get(k) for k in REVIEW_KEYS}}


def reviews(db: Database) -> list[dict]:
    return [_review(d) for d in db.reviews.find().sort("seq", DESCENDING)]


def get_review(db: Database, review_id: str) -> dict | None:
    doc = db.reviews.find_one({"_id": review_id})
    return _review(doc) if doc else None


def unlinked_reviews(db: Database) -> list[dict]:
    """Seeded queue items that have no answer record yet."""
    return [_review(d) for d in db.reviews.find({"answerId": None}).sort("seq", ASCENDING)]


def link_review(db: Database, review_id: str, answer_id: str) -> None:
    db.reviews.update_one({"_id": review_id}, {"$set": {"answerId": answer_id}})


def open_review_for(db: Database, answer_id: str) -> dict | None:
    doc = db.reviews.find_one({"status": "pending", "$or": [{"answerId": answer_id}, {"watchers": answer_id}]},
                              sort=[("seq", DESCENDING)])
    return _review(doc) if doc else None


def route(db: Database, answer: dict, routed_by: str, reasons: list[str], note: str, asked_by: str) -> dict:
    """
    Queue an answer for review. Scripted questions join an open review of the
    same question (one reviewer decision answers every employee waiting on it);
    any other answer gets a review of its own.
    """
    open_ = db.reviews.find_one({"status": "pending", "answerId": answer["id"]})
    if not open_ and answer.get("scenarioId") and answer["kind"] == "asked":
        open_ = db.reviews.find_one({"status": "pending", "scenarioId": answer["scenarioId"]}, sort=[("seq", DESCENDING)])
    if open_:
        r = _review(open_)
        watchers = r["watchers"] if answer["id"] in r["watchers"] or answer["id"] == r["answerId"] else [*r["watchers"], answer["id"]]
        merged = list(dict.fromkeys([*r["reasons"], *reasons]))
        note_ = r["note"] if not note else (f"{r['note']}\n{note}" if r["note"] else note)
        db.reviews.update_one({"_id": r["id"]}, {"$set": {"watchers": watchers, "reasons": merged, "note": note_}})
        return {"by": routed_by, "queueId": r["id"], "joined": r["answerId"] != answer["id"]}
    last = db.reviews.find_one({}, {"seq": 1}, sort=[("seq", DESCENDING)])
    seq = max(1041, last["seq"] if last else 0) + 1
    review_id = f"RQ-{seq}"
    db.reviews.insert_one({"_id": review_id, "seq": seq, "answerId": answer["id"], "scenarioId": answer.get("scenarioId"),
                           "askedBy": asked_by, "askedAt": now(), "routedBy": routed_by, "reasons": list(reasons), "note": note,
                           "status": "pending", "watchers": [], "outcome": None, "createdAt": now()})
    return {"by": routed_by, "queueId": review_id}


def resolve_review(db: Database, review_id: str, outcome: dict, decision_row: dict) -> None:
    db.reviews.update_one({"_id": review_id}, {"$set": {"status": "resolved", "outcome": _plain(outcome)}})
    db.review_outcomes.insert_one({"ord": _next(db, "outcome_seq"), "topic": decision_row["topic"],
                                   "decision": decision_row["decision"], "category": decision_row["category"],
                                   "docId": decision_row["docId"], "count": 1, "reviewId": review_id})


# ── audit trail ──────────────────────────────────────────────────────────

def log(db: Database, action: str, *, actor: str = SYSTEM, role: str = "system", simulated: bool = False,
        answer_id: str | None = None, review_id: str | None = None, **detail) -> None:
    db.events.insert_one({"_id": _next(db, "event_seq"), "at": now(), "answerId": answer_id, "reviewId": review_id,
                          "actor": actor, "role": role, "simulated": bool(simulated), "action": action, "detail": _plain(detail)})


def events(db: Database, *, answer_ids: list[str] | None = None, review_id: str | None = None) -> list[dict]:
    query = {}
    if answer_ids is not None or review_id is not None:
        query = {"$or": [{"answerId": {"$in": answer_ids or []}}, {"reviewId": review_id}] if review_id else
                 [{"answerId": {"$in": answer_ids or []}}]}
    return [{"id": d["_id"], "at": d["at"], "answerId": d["answerId"], "reviewId": d["reviewId"], "actor": d["actor"],
             "role": d["role"], "simulated": d["simulated"], "action": d["action"], "detail": d["detail"]}
            for d in db.events.find(query).sort("_id", ASCENDING)]


# ── evaluation ───────────────────────────────────────────────────────────

def add_eval_run(db: Database, run: dict) -> None:
    db.eval_runs.insert_one({"_id": run["id"], "createdAt": run["createdAt"], "split": run["split"], "mode": run["mode"],
                             "provider": _plain(run["provider"]), "summary": _plain(run["summary"]), "cases": _plain(run["cases"])})


def eval_runs(db: Database) -> list[dict]:
    return [{"id": d["_id"], "createdAt": d["createdAt"], "split": d["split"], "mode": d["mode"], "provider": d["provider"],
             "summary": d["summary"], "cases": d["cases"]}
            for d in db.eval_runs.find().sort([("createdAt", DESCENDING), ("_id", DESCENDING)])]


if __name__ == "__main__":
    d = connect()
    if "--reset" in sys.argv:
        reset(d)
        print(f"Database '{d.name}' reset and reseeded from data/fixtures.json")
    else:
        print(f"Database '{d.name}' ready ({len(d.policy_versions.distinct('docId'))} documents)")
