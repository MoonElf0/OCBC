"""
SQLite storage. One file, no server: data/assessment.db (override with
ASSESSMENT_DB). Seeded from data/fixtures.json on first run; reset with
`python -m app.db --reset` or POST /api/admin/reset. A database written by
an older schema is rebuilt from the seed (it holds demo data only).

What lives here
  policy_versions       every version of every policy document; approved
                        text is never edited in place
  topics, weekly_counts history behind the Trends dashboard
  review_outcomes       tagged reviewer decisions (seeded history + live)
  answers               every answer: asked, submitted for verification,
                        or written by a reviewer as a correction
  assessments           every verification of an answer, kept when a newer
                        one is made, with the policy versions it relied on
  reviews               the human review queue
  events                audit trail: who did what to which answer, when
  eval_runs             evaluation runs and their recorded predictions
"""
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from . import fixtures, library

DEFAULT_PATH = Path(__file__).resolve().parent.parent / "data" / "assessment.db"
SCHEMA_VERSION = "3"

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY, name TEXT NOT NULL, ord INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS policy_versions (
  doc_id TEXT NOT NULL, version TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('draft','approved','superseded')),
  title TEXT NOT NULL, topic TEXT NOT NULL, owner TEXT NOT NULL,
  effective_from TEXT NOT NULL, review_date TEXT NOT NULL,
  replaces TEXT, superseded_by TEXT, sections TEXT NOT NULL, change_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, approved_at TEXT, ord INTEGER NOT NULL,
  PRIMARY KEY (doc_id, version)
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
  id TEXT PRIMARY KEY, kind TEXT NOT NULL,            -- asked | submitted | correction
  question TEXT NOT NULL, scenario_id TEXT, text TEXT NOT NULL, citations TEXT NOT NULL,
  topic TEXT, as_of TEXT NOT NULL, parent_id TEXT REFERENCES answers(id),
  state TEXT NOT NULL, latest_assessment TEXT, feedback TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY, answer_id TEXT NOT NULL REFERENCES answers(id), trigger TEXT NOT NULL,
  result TEXT NOT NULL, policy_versions TEXT NOT NULL, routing TEXT NOT NULL,
  evidence_changed TEXT,           -- JSON note set when a policy it relied on changed
  replaced_by TEXT,                -- the newer assessment of the same answer
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY, seq INTEGER NOT NULL, answer_id TEXT REFERENCES answers(id), scenario_id TEXT,
  asked_by TEXT NOT NULL, asked_at TEXT NOT NULL, routed_by TEXT NOT NULL, reasons TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, watchers TEXT NOT NULL DEFAULT '[]',
  outcome TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, answer_id TEXT, review_id TEXT,
  actor TEXT NOT NULL, actor_role TEXT NOT NULL, simulated INTEGER NOT NULL DEFAULT 1,
  action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS eval_runs (
  id TEXT PRIMARY KEY, created_at TEXT NOT NULL, split TEXT NOT NULL, mode TEXT NOT NULL,
  provider TEXT NOT NULL, summary TEXT NOT NULL, cases TEXT NOT NULL
);
"""

TABLES = ["events", "eval_runs", "reviews", "assessments", "answers", "review_outcomes", "weekly_counts", "policy_versions", "topics", "meta"]

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
    has_meta = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'").fetchone()
    version = conn.execute("SELECT value FROM meta WHERE key='schema'").fetchone() if has_meta else None
    if has_meta and (version is None or version[0] != SCHEMA_VERSION):
        # Written by an older version of the prototype: demo data only, rebuild it.
        conn.execute("PRAGMA foreign_keys = OFF")
        for t in TABLES + ["documents", "sections"]:
            conn.execute(f"DROP TABLE IF EXISTS {t}")
        conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    if conn.execute("SELECT COUNT(*) FROM policy_versions").fetchone()[0] == 0:
        seed(conn)
    return conn


def reset(conn: sqlite3.Connection) -> None:
    with conn:
        for t in TABLES:
            conn.execute(f"DELETE FROM {t}")
    seed(conn)


def seed(conn: sqlite3.Connection) -> None:
    f = fixtures.load()
    with conn:
        for k, v in {"schema": SCHEMA_VERSION, "window_weeks": str(f["WINDOW_WEEKS"]), "today": f["DEMO_TODAY"],
                     "answer_seq": "0", "assessment_seq": "0", "library_rev": uuid4().hex}.items():
            conn.execute("INSERT OR REPLACE INTO meta VALUES (?, ?)", (k, v))
        for i, t in enumerate(f["TOPICS"].values()):
            conn.execute("INSERT INTO topics VALUES (?, ?, ?)", (t["id"], t["name"], i))
        for i, r in enumerate(library.seed_records(f["DOCUMENTS"])):
            _insert_version(conn, r, i)
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

def today(conn) -> str:
    return conn.execute("SELECT value FROM meta WHERE key='today'").fetchone()[0]


def library_rev(conn) -> str:
    """Changes whenever the library changes, so the retrieval index is rebuilt."""
    return conn.execute("SELECT value FROM meta WHERE key='library_rev'").fetchone()[0]


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

def metrics_data(conn) -> tuple[dict, list[dict]]:
    """(data shaped like the fixtures, live decisions) for app.metrics.Metrics."""
    topics = {t["id"]: {"id": t["id"], "name": t["name"]} for t in conn.execute("SELECT * FROM topics ORDER BY ord")}
    weeks = [r["label"] for r in conn.execute("SELECT DISTINCT week, label FROM weekly_counts ORDER BY week")]
    weekly = {}
    for t in topics:
        rows = conn.execute("SELECT * FROM weekly_counts WHERE topic=? ORDER BY week", (t,)).fetchall()
        weekly[t] = {k: [r[col] for r in rows] for k, col in METRIC_COLS}
    outcomes, live = [], []
    for r in conn.execute("SELECT * FROM review_outcomes ORDER BY id"):
        row = {"topic": r["topic"], "decision": r["decision"], "category": r["category"], "docId": r["doc_id"]}
        if r["review_id"]:
            live.append({"id": r["review_id"], **row})
        else:
            outcomes.append({**row, "count": r["count"]})
    data = {
        "TOPICS": topics, "WEEKS": weeks, "WEEKLY": weekly, "REVIEW_OUTCOMES": outcomes, "DOCUMENTS": documents(conn),
        "WINDOW_WEEKS": int(conn.execute("SELECT value FROM meta WHERE key='window_weeks'").fetchone()[0]),
    }
    return data, live


# ── answers and assessments ──────────────────────────────────────────────

def _seq(conn, key: str) -> int:
    n = int(conn.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()[0]) + 1
    conn.execute("UPDATE meta SET value=? WHERE key=?", (str(n), key))
    return n


def _answer(row) -> dict | None:
    if not row:
        return None
    return {"id": row["id"], "kind": row["kind"], "question": row["question"], "scenarioId": row["scenario_id"], "text": row["text"],
            "citations": json.loads(row["citations"]), "topic": row["topic"], "asOf": row["as_of"], "parentId": row["parent_id"],
            "state": row["state"], "latestAssessment": row["latest_assessment"], "feedback": row["feedback"], "createdAt": row["created_at"]}


def get_answer(conn, answer_id: str) -> dict | None:
    a = _answer(conn.execute("SELECT * FROM answers WHERE id=?", (answer_id,)).fetchone())
    if a:
        latest = get_assessment(conn, a["latestAssessment"]) if a["latestAssessment"] else None
        a["result"] = latest["result"] if latest else None
        a["assessment"] = {k: v for k, v in latest.items() if k != "result"} if latest else None
    return a


def add_answer(conn, *, kind: str, question: str, text: str, citations: list[str], as_of: str,
               scenario_id: str | None = None, parent_id: str | None = None, topic: str | None = None) -> str:
    with conn:
        answer_id = f"ANS-{_seq(conn, 'answer_seq'):05d}"
        conn.execute("INSERT INTO answers (id, kind, question, scenario_id, text, citations, topic, as_of, parent_id, state, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                     (answer_id, kind, question, scenario_id, text, json.dumps(citations), topic, as_of, parent_id, "verifying", now()))
    return answer_id


def _assessment(row) -> dict:
    return {"id": row["id"], "answerId": row["answer_id"], "trigger": row["trigger"], "result": json.loads(row["result"]),
            "policyVersions": json.loads(row["policy_versions"]), "routing": json.loads(row["routing"]),
            "evidenceChanged": json.loads(row["evidence_changed"]) if row["evidence_changed"] else None,
            "replacedBy": row["replaced_by"], "createdAt": row["created_at"]}


def get_assessment(conn, assessment_id: str) -> dict | None:
    row = conn.execute("SELECT * FROM assessments WHERE id=?", (assessment_id,)).fetchone()
    return _assessment(row) if row else None


def assessments_of(conn, answer_id: str) -> list[dict]:
    return [_assessment(r) for r in conn.execute("SELECT * FROM assessments WHERE answer_id=? ORDER BY created_at, id", (answer_id,))]


def add_assessment(conn, answer_id: str, trigger: str, result: dict, policy_versions: list[dict], routing: dict, state: str, topic: str | None) -> str:
    """Record a new assessment. An earlier one is kept and points to its replacement."""
    with conn:
        aid = f"AS-{_seq(conn, 'assessment_seq'):05d}"
        prev = conn.execute("SELECT latest_assessment FROM answers WHERE id=?", (answer_id,)).fetchone()[0]
        conn.execute("INSERT INTO assessments (id, answer_id, trigger, result, policy_versions, routing, created_at) VALUES (?,?,?,?,?,?,?)",
                     (aid, answer_id, trigger, json.dumps(result), json.dumps(policy_versions), json.dumps(routing), now()))
        if prev:
            conn.execute("UPDATE assessments SET replaced_by=? WHERE id=?", (aid, prev))
        conn.execute("UPDATE answers SET latest_assessment=?, state=?, topic=COALESCE(?, topic) WHERE id=?", (aid, state, topic, answer_id))
    return aid


def set_state(conn, answer_id: str, state: str) -> None:
    with conn:
        conn.execute("UPDATE answers SET state=? WHERE id=?", (state, answer_id))


def set_feedback(conn, answer_id: str, value: str | None) -> None:
    with conn:
        conn.execute("UPDATE answers SET feedback=? WHERE id=?", (value, answer_id))


def assessments_relying_on(conn, doc_id: str, except_version: str) -> list[dict]:
    """Current (not replaced) assessments that used another version of doc_id."""
    out = []
    for r in conn.execute("SELECT * FROM assessments WHERE replaced_by IS NULL"):
        a = _assessment(r)
        if any(v["docId"] == doc_id and v["version"] != except_version for v in a["policyVersions"]):
            out.append(a)
    return out


def mark_evidence_changed(conn, assessment_id: str, note: dict) -> None:
    with conn:
        conn.execute("UPDATE assessments SET evidence_changed=? WHERE id=?", (json.dumps(note), assessment_id))


# ── reviews ──────────────────────────────────────────────────────────────

def _review(row) -> dict:
    return {"id": row["id"], "answerId": row["answer_id"], "scenarioId": row["scenario_id"], "askedBy": row["asked_by"],
            "askedAt": row["asked_at"], "routedBy": row["routed_by"], "reasons": json.loads(row["reasons"]), "note": row["note"],
            "status": row["status"], "watchers": json.loads(row["watchers"]),
            "outcome": json.loads(row["outcome"]) if row["outcome"] else None, "createdAt": row["created_at"]}


def reviews(conn) -> list[dict]:
    return [_review(r) for r in conn.execute("SELECT * FROM reviews ORDER BY seq DESC")]


def get_review(conn, review_id: str) -> dict | None:
    row = conn.execute("SELECT * FROM reviews WHERE id=?", (review_id,)).fetchone()
    return _review(row) if row else None


def open_review_for(conn, answer_id: str) -> dict | None:
    row = conn.execute("SELECT * FROM reviews WHERE status='pending' AND (answer_id=? OR watchers LIKE ?) ORDER BY seq DESC LIMIT 1",
                       (answer_id, f'%"{answer_id}"%')).fetchone()
    return _review(row) if row else None


def route(conn, answer: dict, routed_by: str, reasons: list[str], note: str, asked_by: str) -> dict:
    """
    Queue an answer for review. Scripted questions join an open review of the
    same question (one reviewer decision answers every employee waiting on it);
    any other answer gets a review of its own.
    """
    with conn:
        own = conn.execute("SELECT * FROM reviews WHERE status='pending' AND answer_id=? LIMIT 1", (answer["id"],)).fetchone()
        open_ = own or (conn.execute("SELECT * FROM reviews WHERE status='pending' AND scenario_id=? ORDER BY seq DESC LIMIT 1",
                                     (answer["scenarioId"],)).fetchone() if answer.get("scenarioId") and answer["kind"] == "asked" else None)
        if open_:
            r = _review(open_)
            watchers = r["watchers"] if answer["id"] in r["watchers"] or answer["id"] == r["answerId"] else [*r["watchers"], answer["id"]]
            merged = list(dict.fromkeys([*r["reasons"], *reasons]))
            note_ = r["note"] if not note else (f"{r['note']}\n{note}" if r["note"] else note)
            conn.execute("UPDATE reviews SET watchers=?, reasons=?, note=? WHERE id=?", (json.dumps(watchers), json.dumps(merged), note_, r["id"]))
            return {"by": routed_by, "queueId": r["id"], "joined": r["answerId"] != answer["id"]}
        seq = max(1041, conn.execute("SELECT COALESCE(MAX(seq), 0) FROM reviews").fetchone()[0]) + 1
        review_id = f"RQ-{seq}"
        conn.execute(
            "INSERT INTO reviews (id, seq, answer_id, scenario_id, asked_by, asked_at, routed_by, reasons, note, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (review_id, seq, answer["id"], answer.get("scenarioId"), asked_by, now(), routed_by, json.dumps(reasons), note, "pending", now()),
        )
        return {"by": routed_by, "queueId": review_id}


def resolve_review(conn, review_id: str, outcome: dict, decision_row: dict) -> None:
    with conn:
        conn.execute("UPDATE reviews SET status='resolved', outcome=? WHERE id=?", (json.dumps(outcome), review_id))
        conn.execute("INSERT INTO review_outcomes (topic, decision, category, doc_id, count, review_id) VALUES (?,?,?,?,1,?)",
                     (decision_row["topic"], decision_row["decision"], decision_row["category"], decision_row["docId"], review_id))


# ── audit trail ──────────────────────────────────────────────────────────

def log(conn, action: str, *, actor: str = SYSTEM, role: str = "system", simulated: bool = False,
        answer_id: str | None = None, review_id: str | None = None, **detail) -> None:
    with conn:
        conn.execute("INSERT INTO events (at, answer_id, review_id, actor, actor_role, simulated, action, detail) VALUES (?,?,?,?,?,?,?,?)",
                     (now(), answer_id, review_id, actor, role, int(simulated), action, json.dumps(detail)))


def events(conn, *, answer_ids: list[str] | None = None, review_id: str | None = None) -> list[dict]:
    rows = conn.execute("SELECT * FROM events ORDER BY id").fetchall()
    out = []
    for r in rows:
        if answer_ids is not None or review_id is not None:
            if not ((answer_ids and r["answer_id"] in answer_ids) or (review_id and r["review_id"] == review_id)):
                continue
        out.append({"id": r["id"], "at": r["at"], "answerId": r["answer_id"], "reviewId": r["review_id"], "actor": r["actor"],
                    "role": r["actor_role"], "simulated": bool(r["simulated"]), "action": r["action"], "detail": json.loads(r["detail"])})
    return out


# ── evaluation ───────────────────────────────────────────────────────────

def add_eval_run(conn, run: dict) -> None:
    with conn:
        conn.execute("INSERT INTO eval_runs VALUES (?,?,?,?,?,?,?)",
                     (run["id"], run["createdAt"], run["split"], run["mode"], json.dumps(run["provider"]), json.dumps(run["summary"]), json.dumps(run["cases"])))


def eval_runs(conn) -> list[dict]:
    return [{"id": r["id"], "createdAt": r["created_at"], "split": r["split"], "mode": r["mode"], "provider": json.loads(r["provider"]),
             "summary": json.loads(r["summary"]), "cases": json.loads(r["cases"])} for r in conn.execute("SELECT * FROM eval_runs ORDER BY created_at DESC, id DESC")]


if __name__ == "__main__":
    c = connect()
    if "--reset" in sys.argv:
        reset(c)
        print("Database reset and reseeded from data/fixtures.json")
    else:
        print(f"Database ready ({c.execute('SELECT COUNT(DISTINCT doc_id) FROM policy_versions').fetchone()[0]} documents)")
