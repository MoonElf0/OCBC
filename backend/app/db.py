"""
MongoDB storage. Connection string in MONGODB_URI (put it in backend/.env,
which git ignores), database name in MONGODB_DB (default "assessment").
Seeded from data/fixtures.json on first run; reset with
`python -m app.db --reset` or POST /api/admin/reset.

Collections
  documents        the approved policy library retrieval searches; sections embedded
  topics, weekly_counts   history behind the Trends dashboard
  review_outcomes  tagged reviewer decisions (seeded history + live)
  answers          every question asked, its answer and verification
  reviews          the human review queue
  meta             demo date, window, counters, library revision

Every function returns the same shapes the earlier SQLite version did, so main.py
and the API are unchanged. Writes are serialised by main.py's lock; counters
use atomic $inc.
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from pymongo import ASCENDING, DESCENDING, MongoClient, ReturnDocument
from pymongo.database import Database

from . import fixtures

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DEFAULT_DB = "assessment"
COLLECTIONS = ["reviews", "answers", "review_outcomes", "weekly_counts", "documents", "topics", "meta"]
METRIC_KEYS = ["answers", "claims", "unsupported", "conflicting", "stale", "noSource", "reviews"]


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _plain(value):
    """JSON round-trip, so stored results match what the API sends (string keys, lists not tuples)."""
    return json.loads(json.dumps(value))


def connect(uri: str | None = None, name: str | None = None, client=None) -> Database:
    """Open the database, seeding it if the library is empty. Pass `client` (e.g. mongomock) in tests."""
    if client is None:
        uri = uri or os.environ.get("MONGODB_URI")
        if not uri:
            raise RuntimeError("MONGODB_URI is not set. Add it to backend/.env (see backend/README.md).")
        client = MongoClient(uri, serverSelectionTimeoutMS=8000, appname="assessment-ai-backend")
    db = client[name or os.environ.get("MONGODB_DB") or DEFAULT_DB]
    db.reviews.create_index([("status", ASCENDING), ("scenarioId", ASCENDING), ("seq", DESCENDING)])
    db.weekly_counts.create_index([("topic", ASCENDING), ("week", ASCENDING)], unique=True)
    if db.documents.count_documents({}) == 0:
        reset(db)  # empty or half-seeded: clear leftovers, then seed
    return db


def reset(db: Database) -> None:
    for c in COLLECTIONS:
        db[c].delete_many({})
    seed(db)


def seed(db: Database) -> None:
    f = fixtures.load()
    db.meta.insert_many([
        {"_id": "window_weeks", "value": f["WINDOW_WEEKS"]},
        {"_id": "today", "value": f["DEMO_TODAY"]},
        {"_id": "answer_seq", "value": 0},
        {"_id": "outcome_seq", "value": 0},
        {"_id": "library_rev", "value": 0},
    ])
    db.topics.insert_many([{"_id": t["id"], "name": t["name"], "ord": i} for i, t in enumerate(f["TOPICS"].values())])
    db.documents.insert_many([
        {"_id": d["id"], "title": d["title"], "version": d["version"], "topic": d["topic"], "owner": d["owner"],
         "updated": d["updated"], "reviewCycleMonths": d["reviewCycleMonths"], "supersededBy": d["supersededBy"],
         "ord": i, "sections": [{"id": s["id"], "heading": s["heading"], "text": s["text"]} for s in d["sections"]]}
        for i, d in enumerate(f["DOCUMENTS"].values())
    ])
    db.weekly_counts.insert_many([
        {"topic": topic, "week": i, "label": label, **{k: w[k][i] for k in METRIC_KEYS}}
        for topic, w in f["WEEKLY"].items() for i, label in enumerate(f["WEEKS"])
    ])
    for r in f["REVIEW_OUTCOMES"]:
        db.review_outcomes.insert_one({"ord": _next(db, "outcome_seq"), "topic": r["topic"], "decision": r["decision"],
                                       "category": r["category"], "docId": r["docId"], "count": r["count"], "reviewId": None})
    db.reviews.insert_many([
        {"_id": q["id"], "seq": int(q["id"].split("-")[1]), "answerId": None, "scenarioId": q["scenarioId"],
         "askedBy": q["askedBy"], "askedAt": q["askedAt"], "routedBy": q["routedBy"], "reasons": q["reasons"],
         "note": "", "status": "pending", "watchers": [], "outcome": None, "createdAt": q["askedAt"]}
        for q in f["REVIEW_QUEUE_SEED"]
    ])


def _next(db: Database, counter: str) -> int:
    doc = db.meta.find_one_and_update({"_id": counter}, {"$inc": {"value": 1}}, upsert=True, return_document=ReturnDocument.AFTER)
    return doc["value"]


def _meta(db: Database, key: str):
    return db.meta.find_one({"_id": key})["value"]


# ── reads ────────────────────────────────────────────────────────────────

def today(db: Database) -> str:
    return _meta(db, "today")


def documents(db: Database) -> dict:
    """The library, shaped like fixtures DOCUMENTS."""
    return {
        d["_id"]: {"id": d["_id"], "title": d["title"], "version": d["version"], "topic": d["topic"], "owner": d["owner"],
                   "updated": d["updated"], "reviewCycleMonths": d["reviewCycleMonths"], "supersededBy": d["supersededBy"],
                   "sections": d["sections"]}
        for d in db.documents.find().sort("ord", ASCENDING)
    }


def library_rev(db: Database) -> str:
    """Changes whenever the library changes, so the retrieval index is rebuilt."""
    return str(_meta(db, "library_rev"))


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


def _answer(doc) -> dict | None:
    if not doc:
        return None
    return {"id": doc["_id"], "question": doc["question"], "scenarioId": doc["scenarioId"], "text": doc["text"],
            "citations": doc["citations"], "result": doc.get("result"), "feedback": doc.get("feedback"),
            "createdAt": doc["createdAt"]}


def get_answer(db: Database, answer_id: str) -> dict | None:
    return _answer(db.answers.find_one({"_id": answer_id}))


def _review(doc) -> dict:
    return {"id": doc["_id"], "answerId": doc["answerId"], "scenarioId": doc["scenarioId"], "askedBy": doc["askedBy"],
            "askedAt": doc["askedAt"], "routedBy": doc["routedBy"], "reasons": doc["reasons"], "note": doc["note"],
            "status": doc["status"], "watchers": doc["watchers"], "outcome": doc.get("outcome"), "createdAt": doc["createdAt"]}


def reviews(db: Database) -> list[dict]:
    return [_review(r) for r in db.reviews.find().sort("seq", DESCENDING)]


def get_review(db: Database, review_id: str) -> dict | None:
    doc = db.reviews.find_one({"_id": review_id})
    return _review(doc) if doc else None


# ── writes ───────────────────────────────────────────────────────────────

def add_answer(db: Database, question: str, reply: dict) -> str:
    answer_id = f"ANS-{_next(db, 'answer_seq'):05d}"
    db.answers.insert_one({"_id": answer_id, "question": question, "scenarioId": reply["scenarioId"], "text": reply["text"],
                           "citations": _plain(reply["citations"]), "result": None, "feedback": None, "createdAt": now()})
    return answer_id


def save_result(db: Database, answer_id: str, result: dict) -> None:
    db.answers.update_one({"_id": answer_id}, {"$set": {"result": _plain(result)}})


def set_feedback(db: Database, answer_id: str, value: str | None) -> None:
    db.answers.update_one({"_id": answer_id}, {"$set": {"feedback": value}})


def route(db: Database, answer: dict, routed_by: str, reasons: list[str], note: str, asked_by: str) -> dict:
    """Queue an answer for review, or join an open review of the same question."""
    open_ = db.reviews.find_one({"status": "pending", "scenarioId": answer["scenarioId"]}, sort=[("seq", DESCENDING)])
    if open_:
        r = _review(open_)
        watchers = r["watchers"] if answer["id"] in r["watchers"] or answer["id"] == r["answerId"] else [*r["watchers"], answer["id"]]
        merged = list(dict.fromkeys([*r["reasons"], *reasons]))
        db.reviews.update_one({"_id": r["id"]}, {"$set": {"watchers": watchers, "reasons": merged}})
        return {"by": routed_by, "queueId": r["id"], "joined": True}
    last = db.reviews.find_one({}, {"seq": 1}, sort=[("seq", DESCENDING)])
    seq = max(1041, last["seq"] if last else 0) + 1
    review_id = f"RQ-{seq}"
    db.reviews.insert_one({"_id": review_id, "seq": seq, "answerId": answer["id"], "scenarioId": answer["scenarioId"],
                           "askedBy": asked_by, "askedAt": "Just now", "routedBy": routed_by, "reasons": list(reasons),
                           "note": note, "status": "pending", "watchers": [], "outcome": None, "createdAt": now()})
    return {"by": routed_by, "queueId": review_id}


def resolve_review(db: Database, review_id: str, outcome: dict, decision_row: dict) -> None:
    db.reviews.update_one({"_id": review_id}, {"$set": {"status": "resolved", "outcome": _plain(outcome)}})
    db.review_outcomes.insert_one({"ord": _next(db, "outcome_seq"), "topic": decision_row["topic"],
                                   "decision": decision_row["decision"], "category": decision_row["category"],
                                   "docId": decision_row["docId"], "count": 1, "reviewId": review_id})


def update_section(db: Database, doc_id: str, section_id: str, text: str, updated: str | None) -> bool:
    changes = {"sections.$.text": text, **({"updated": updated} if updated else {})}
    res = db.documents.update_one({"_id": doc_id, "sections.id": section_id}, {"$set": changes})
    if res.matched_count:
        _next(db, "library_rev")
    return res.matched_count > 0


if __name__ == "__main__":
    d = connect()
    if "--reset" in sys.argv:
        reset(d)
        print(f"Database '{d.name}' reset and reseeded from data/fixtures.json")
    else:
        print(f"Database '{d.name}' ready ({d.documents.count_documents({})} documents)")
