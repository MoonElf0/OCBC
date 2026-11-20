"""
SQLite storage. One file, no server: data/assessment.db (override with
ASSESSMENT_DB). Seeded from data/fixtures.json on first run; reset with
`python -m app.db --reset` or POST /api/admin/reset.

What lives here
  documents, sections   the approved policy library retrieval searches
  topics, weekly_counts history behind the Trends dashboard
  review_outcomes       tagged reviewer decisions (seeded history + live)
  answers               every question asked, its answer and verification
  reviews               the human review queue
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from pymongo import ASCENDING, DESCENDING, MongoClient, ReturnDocument
from pymongo.database import Database

from . import fixtures, library

DEFAULT_PATH = Path(__file__).resolve().parent.parent / "data" / "assessment.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY, name TEXT NOT NULL, ord INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, version TEXT NOT NULL, topic TEXT NOT NULL REFERENCES topics(id),
  owner TEXT NOT NULL, updated TEXT NOT NULL, review_cycle_months INTEGER NOT NULL,
  superseded_by TEXT REFERENCES documents(id), ord INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sections (
  doc_id TEXT NOT NULL REFERENCES documents(id), section_id TEXT NOT NULL, heading TEXT NOT NULL,
  text TEXT NOT NULL, ord INTEGER NOT NULL, PRIMARY KEY (doc_id, section_id)
);
CREATE TABLE IF NOT EXISTS weekly_counts (
  topic TEXT NOT NULL REFERENCES topics(id), week INTEGER NOT NULL, label TEXT NOT NULL,
  answers INTEGER NOT NULL, claims INTEGER NOT NULL, unsupported INTEGER NOT NULL, conflicting INTEGER NOT NULL,
  stale INTEGER NOT NULL, no_source INTEGER NOT NULL, reviews INTEGER NOT NULL, PRIMARY KEY (topic, week)
);
CREATE TABLE IF NOT EXISTS review_outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT NOT NULL, decision TEXT NOT NULL, category TEXT NOT NULL,
  doc_id TEXT, count INTEGER NOT NULL,
  review_id TEXT  -- NULL: seeded history. Set: a decision made through the API.
);
CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY, question TEXT NOT NULL, scenario_id TEXT NOT NULL, text TEXT NOT NULL,
  citations TEXT NOT NULL, result TEXT, feedback TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY, seq INTEGER NOT NULL, answer_id TEXT REFERENCES answers(id), scenario_id TEXT NOT NULL,
  asked_by TEXT NOT NULL, asked_at TEXT NOT NULL, routed_by TEXT NOT NULL, reasons TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, watchers TEXT NOT NULL DEFAULT '[]',
  outcome TEXT, created_at TEXT NOT NULL
);
"""

METRIC_COLS = [("answers", "answers"), ("claims", "claims"), ("unsupported", "unsupported"), ("conflicting", "conflicting"),
               ("stale", "stale"), ("noSource", "no_source"), ("reviews", "reviews")]

SYSTEM = "Assessment AI"


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(path: str | os.PathLike | None = None) -> sqlite3.Connection:
    path = path or os.environ.get("ASSESSMENT_DB") or DEFAULT_PATH
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    if conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0] == 0:
        seed(conn)
    return conn


def reset(conn: sqlite3.Connection) -> None:
    for t in ["reviews", "answers", "review_outcomes", "weekly_counts", "sections", "documents", "topics", "meta"]:
        conn.execute(f"DELETE FROM {t}")
    seed(conn)


def seed(db: Database) -> None:
    f = fixtures.load()
    with conn:
        conn.execute("INSERT OR REPLACE INTO meta VALUES ('window_weeks', ?)", (str(f["WINDOW_WEEKS"]),))
        conn.execute("INSERT OR REPLACE INTO meta VALUES ('today', ?)", (f["DEMO_TODAY"],))
        conn.execute("INSERT OR REPLACE INTO meta VALUES ('answer_seq', '0')")
        conn.execute("INSERT OR REPLACE INTO meta VALUES ('library_rev', ?)", (uuid4().hex,))
        for i, t in enumerate(f["TOPICS"].values()):
            conn.execute("INSERT INTO topics VALUES (?, ?, ?)", (t["id"], t["name"], i))
        # Insert without supersededBy first, so the reference always resolves.
        for i, d in enumerate(f["DOCUMENTS"].values()):
            conn.execute("INSERT INTO documents VALUES (?,?,?,?,?,?,?,NULL,?)",
                         (d["id"], d["title"], d["version"], d["topic"], d["owner"], d["updated"], d["reviewCycleMonths"], i))
            for j, s in enumerate(d["sections"]):
                conn.execute("INSERT INTO sections VALUES (?,?,?,?,?)", (d["id"], s["id"], s["heading"], s["text"], j))
        for d in f["DOCUMENTS"].values():
            conn.execute("UPDATE documents SET superseded_by = ? WHERE id = ?", (d["supersededBy"], d["id"]))
        for topic, w in f["WEEKLY"].items():
            for i, label in enumerate(f["WEEKS"]):
                conn.execute("INSERT INTO weekly_counts VALUES (?,?,?,?,?,?,?,?,?,?)",
                             (topic, i, label, *[w[k][i] for k, _ in METRIC_COLS]))
        for r in f["REVIEW_OUTCOMES"]:
            conn.execute("INSERT INTO review_outcomes (topic, decision, category, doc_id, count) VALUES (?,?,?,?,?)",
                         (r["topic"], r["decision"], r["category"], r["docId"], r["count"]))
        for q in f["REVIEW_QUEUE_SEED"]:
            conn.execute(
                "INSERT INTO reviews (id, seq, answer_id, scenario_id, asked_by, asked_at, routed_by, reasons, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (q["id"], int(q["id"].split("-")[1]), None, q["scenarioId"], q["askedBy"], q["askedAt"], q["routedBy"], json.dumps(q["reasons"]), "pending", q["askedAt"]),
            )


def _insert_version(conn, r: dict, ord_: int) -> None:
    conn.execute(
        "INSERT INTO policy_versions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (r["docId"], r["version"], r["status"], r["title"], r["topic"], r["owner"], r["effectiveFrom"], r["reviewDate"],
         r.get("replaces"), json.dumps(r["supersededBy"]) if r.get("supersededBy") else None, json.dumps(r["sections"]),
         r.get("changeNote", ""), r["createdAt"], r.get("approvedAt"), ord_),
    )


# ── library ──────────────────────────────────────────────────────────────

def today(db: Database) -> str:
    return _meta(db, "today")


def documents(conn) -> dict:
    """The library, shaped like fixtures DOCUMENTS."""
    docs = {}
    for d in conn.execute("SELECT * FROM documents ORDER BY ord"):
        docs[d["id"]] = {
            "id": d["id"], "title": d["title"], "version": d["version"], "topic": d["topic"], "owner": d["owner"],
            "updated": d["updated"], "reviewCycleMonths": d["review_cycle_months"], "supersededBy": d["superseded_by"],
            "sections": [{"id": s["section_id"], "heading": s["heading"], "text": s["text"]}
                         for s in conn.execute("SELECT * FROM sections WHERE doc_id=? ORDER BY ord", (d["id"],))],
        }
    return docs


def library_rev(conn) -> str:
    """Changes whenever the library changes, so the retrieval index is rebuilt."""
    return str(_meta(db, "library_rev"))


def _bump_rev(conn) -> None:
    conn.execute("UPDATE meta SET value=? WHERE key='library_rev'", (uuid4().hex,))


def _version(row) -> dict:
    return {
        "docId": row["doc_id"], "version": row["version"], "status": row["status"], "title": row["title"], "topic": row["topic"],
        "owner": row["owner"], "effectiveFrom": row["effective_from"], "reviewDate": row["review_date"], "replaces": row["replaces"],
        "supersededBy": json.loads(row["superseded_by"]) if row["superseded_by"] else None, "sections": json.loads(row["sections"]),
        "changeNote": row["change_note"], "createdAt": row["created_at"], "approvedAt": row["approved_at"],
    }


def version_records(conn) -> list[dict]:
    return [_version(r) for r in conn.execute("SELECT * FROM policy_versions ORDER BY ord")]


def get_version(conn, doc_id: str, version: str) -> dict | None:
    row = conn.execute("SELECT * FROM policy_versions WHERE doc_id=? AND version=?", (doc_id, version)).fetchone()
    return _version(row) if row else None


def documents(conn) -> dict:
    """The library in the original fixture shape, as in force today. For the seed this equals the fixtures."""
    return library.current_docs(version_records(conn), today(conn))


def add_draft(conn, doc_id: str, version: str, sections: list[dict], effective_from: str, review_date: str,
              change_note: str, owner: str | None = None, title: str | None = None) -> dict:
    """A new version starts as a draft. Approved versions are never changed."""
    with conn:
        base = conn.execute("SELECT * FROM policy_versions WHERE doc_id=? AND status!='draft' ORDER BY effective_from DESC, ord DESC LIMIT 1", (doc_id,)).fetchone()
        if not base:
            raise KeyError(doc_id)
        if conn.execute("SELECT 1 FROM policy_versions WHERE doc_id=? AND version=?", (doc_id, version)).fetchone():
            raise ValueError(f"{doc_id} {version} already exists. Versions are never overwritten.")
        b = _version(base)
        rec = {**b, "version": version, "status": "draft", "effectiveFrom": effective_from, "reviewDate": review_date,
               "replaces": b["version"], "supersededBy": None, "sections": sections, "changeNote": change_note,
               "owner": owner or b["owner"], "title": title or b["title"], "createdAt": now(), "approvedAt": None}
        _insert_version(conn, rec, conn.execute("SELECT COALESCE(MAX(ord),0)+1 FROM policy_versions").fetchone()[0])
    return rec


def approve_version(conn, doc_id: str, version: str) -> dict:
    """Approve a draft. The version it replaces is marked superseded, its text kept for audit."""
    with conn:
        row = conn.execute("SELECT * FROM policy_versions WHERE doc_id=? AND version=?", (doc_id, version)).fetchone()
        if not row:
            raise KeyError(f"{doc_id} {version}")
        if row["status"] != "draft":
            raise ValueError(f"{doc_id} {version} is {row['status']}, not a draft.")
        conn.execute("UPDATE policy_versions SET status='approved', approved_at=? WHERE doc_id=? AND version=?", (now(), doc_id, version))
        if row["replaces"]:
            conn.execute("UPDATE policy_versions SET status='superseded', superseded_by=? WHERE doc_id=? AND version=? AND status='approved'",
                         (json.dumps({"docId": doc_id, "version": version}), doc_id, row["replaces"]))
        _bump_rev(conn)
    return get_version(conn, doc_id, version)


def next_version(conn, doc_id: str) -> str:
    """v2.3 -> v2.4 (never reuses an existing label)."""
    labels = {r["version"] for r in conn.execute("SELECT version FROM policy_versions WHERE doc_id=?", (doc_id,))}
    latest = conn.execute("SELECT version FROM policy_versions WHERE doc_id=? ORDER BY ord DESC LIMIT 1", (doc_id,)).fetchone()[0]
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

def _seq(conn, key: str) -> int:
    n = int(conn.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()[0]) + 1
    conn.execute("UPDATE meta SET value=? WHERE key=?", (str(n), key))
    return n


def _answer(doc) -> dict | None:
    if not doc:
        return None
    return {"id": row["id"], "question": row["question"], "scenarioId": row["scenario_id"], "text": row["text"],
            "citations": json.loads(row["citations"]), "result": json.loads(row["result"]) if row["result"] else None,
            "feedback": row["feedback"], "createdAt": row["created_at"]}


def get_answer(conn, answer_id: str) -> dict | None:
    return _answer(conn.execute("SELECT * FROM answers WHERE id=?", (answer_id,)).fetchone())


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

def add_answer(conn, question: str, reply: dict) -> str:
    with conn:
        n = int(conn.execute("SELECT value FROM meta WHERE key='answer_seq'").fetchone()[0]) + 1
        conn.execute("UPDATE meta SET value=? WHERE key='answer_seq'", (str(n),))
        answer_id = f"ANS-{n:05d}"
        conn.execute("INSERT INTO answers (id, question, scenario_id, text, citations, created_at) VALUES (?,?,?,?,?,?)",
                     (answer_id, question, reply["scenarioId"], reply["text"], json.dumps(reply["citations"]), now()))
    return answer_id


def save_result(conn, answer_id: str, result: dict) -> None:
    with conn:
        conn.execute("UPDATE answers SET result=? WHERE id=?", (json.dumps(result), answer_id))


def set_feedback(conn, answer_id: str, value: str | None) -> None:
    with conn:
        conn.execute("UPDATE answers SET feedback=? WHERE id=?", (value, answer_id))


def route(conn, answer: dict, routed_by: str, reasons: list[str], note: str, asked_by: str) -> dict:
    """Queue an answer for review, or join an open review of the same question."""
    with conn:
        open_ = conn.execute("SELECT * FROM reviews WHERE status='pending' AND scenario_id=? ORDER BY seq DESC LIMIT 1",
                             (answer["scenarioId"],)).fetchone()
        if open_:
            r = _review(open_)
            watchers = r["watchers"] if answer["id"] in r["watchers"] or answer["id"] == r["answerId"] else [*r["watchers"], answer["id"]]
            merged = list(dict.fromkeys([*r["reasons"], *reasons]))
            conn.execute("UPDATE reviews SET watchers=?, reasons=? WHERE id=?", (json.dumps(watchers), json.dumps(merged), r["id"]))
            return {"by": routed_by, "queueId": r["id"], "joined": True}
        seq = max(1041, conn.execute("SELECT COALESCE(MAX(seq), 0) FROM reviews").fetchone()[0]) + 1
        review_id = f"RQ-{seq}"
        conn.execute(
            "INSERT INTO reviews (id, seq, answer_id, scenario_id, asked_by, asked_at, routed_by, reasons, note, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (review_id, seq, answer["id"], answer["scenarioId"], asked_by, "Just now", routed_by, json.dumps(reasons), note, "pending", now()),
        )
        return {"by": routed_by, "queueId": review_id}


def resolve_review(db: Database, review_id: str, outcome: dict, decision_row: dict) -> None:
    db.reviews.update_one({"_id": review_id}, {"$set": {"status": "resolved", "outcome": _plain(outcome)}})
    db.review_outcomes.insert_one({"ord": _next(db, "outcome_seq"), "topic": decision_row["topic"],
                                   "decision": decision_row["decision"], "category": decision_row["category"],
                                   "docId": decision_row["docId"], "count": 1, "reviewId": review_id})


def update_section(conn, doc_id: str, section_id: str, text: str, updated: str | None) -> bool:
    with conn:
        cur = conn.execute("UPDATE sections SET text=? WHERE doc_id=? AND section_id=?", (text, doc_id, section_id))
        if cur.rowcount and updated:
            conn.execute("UPDATE documents SET updated=? WHERE id=?", (updated, doc_id))
        if cur.rowcount:
            conn.execute("UPDATE meta SET value=? WHERE key='library_rev'", (uuid4().hex,))
        return cur.rowcount > 0


if __name__ == "__main__":
    d = connect()
    if "--reset" in sys.argv:
        reset(c)
        c.commit()
        print("Database reset and reseeded from data/fixtures.json")
    else:
        print(f"Database ready ({c.execute('SELECT COUNT(*) FROM documents').fetchone()[0]} documents)")
