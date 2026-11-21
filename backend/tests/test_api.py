"""End to end through HTTP: ask -> verify -> route -> review -> dashboard."""
import json

import mongomock
import pytest
from fastapi.testclient import TestClient

from app import db, fixtures
from app import main as api

SME_Q = fixtures.scenario_by_id("sme-limit")["question"]
FX_Q = fixtures.scenario_by_id("fx-override")["question"]


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(api, "_conn", db.connect(client=mongomock.MongoClient()))  # in-memory, never the real cluster
    monkeypatch.setattr(api, "_index", None)
    return TestClient(api.app)


def sse(text: str) -> list[tuple[str, dict]]:
    out = []
    for block in text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        out.append((lines["event"], json.loads(lines["data"])))
    return out


def ask_and_verify(client, q):
    a = client.post("/api/ask", json={"question": q}).json()
    events = sse(client.get(f"/api/answers/{a['answerId']}/verify?pace=0").text)
    return a, events


def test_ask_returns_the_agent_answer_only(client):
    a = client.post("/api/ask", json={"question": SME_Q}).json()
    assert a["scenarioId"] == "sme-limit" and a["answerId"].startswith("ANS-")
    assert set(a) == {"answerId", "scenarioId", "text", "citations"}


def test_verify_streams_checks_in_order_then_a_valid_result(client, schema_validator):
    _, events = ask_and_verify(client, SME_Q)
    names = [e for e, _ in events]
    assert names == ["check_start", "check_done"] * 6 + ["complete"]
    assert [d["i"] for e, d in events if e == "check_done"] == list(range(6))
    result = events[-1][1]["result"]
    assert list(schema_validator.iter_errors(result)) == []
    assert result["band"]["id"] == "medium" and result["provenance"]["retrieval"] == "lexical"
    assert any("claims" in d for e, d in events if e == "check_done")


def test_low_score_is_routed_without_the_employee_asking(client):
    a, events = ask_and_verify(client, FX_Q)
    routed = events[-1][1]["routed"]
    # The seeded queue already has an open FX review, so this joins it.
    assert routed == {"by": "auto", "queueId": "RQ-1041", "joined": True}
    item = next(r for r in client.get("/api/reviews").json() if r["id"] == "RQ-1041")
    assert a["answerId"] in item["watchers"]


def test_escalate_then_correct_feeds_the_dashboard(client):
    a, events = ask_and_verify(client, SME_Q)
    assert events[-1][1]["routed"] is None  # Medium, not high-stakes: not auto-routed
    before = client.get("/api/metrics").json()
    esc = client.post(f"/api/answers/{a['answerId']}/escalate", json={"note": "Limit looks old"}).json()
    rid = esc["routed"]["queueId"]
    item = next(r for r in esc["queue"] if r["id"] == rid)
    assert item["reasons"] == ["employee", "unsupported", "stale"]
    assert item["note"] == "Limit looks old" and item["question"] == SME_Q

    draft = fixtures.load()["CORRECTIONS"]["sme-limit"]["answer"]["text"]
    d = client.post(f"/api/reviews/{rid}/decision", json={"decision": "corrected", "note": "Use DOC-SME-112", "correctedText": draft}).json()
    assert d["askers"] == [a["answerId"]]
    # The correction is re-verified by the general pipeline, not a scripted verdict. With no model
    # configured the figures check out but meaning is unchecked: partial, so never High.
    re_ = d["outcome"]["recheck"]["result"]
    assert re_["assessment"]["partial"] is True and re_["band"]["id"] != "high"
    assert not any(c["status"] in ("conflicting", "unsupported", "insufficient") for c in re_["claims"])
    assert client.post(f"/api/reviews/{rid}/decision", json={"decision": "approved"}).status_code == 409

    after = client.get("/api/metrics").json()
    assert after["liveDecisions"] == [{"id": rid, "topic": "sme", "decision": "corrected", "category": "stale-source", "docId": "DOC-SME-087"}]
    top = after["recommendations"][0]
    assert top["docId"] == "DOC-SME-087" and top["today"] == 1
    assert before["recommendations"][0]["today"] == 0


def test_metrics_from_the_database_match_the_js_dashboard(client, golden):
    from tests.test_metrics import approx

    m = client.get("/api/metrics").json()
    assert m["overall"] == approx(golden["metrics"]["overall"])
    assert m["topics"] == approx(golden["metrics"]["topics"])
    assert m["recommendations"] == golden["metrics"]["recommendations"]


def test_editing_the_library_changes_the_next_verification(client):
    r = client.put("/api/documents/DOC-FX-019/sections/§2.1", json={"text": "Relationship managers may apply FX rate overrides of up to 50 basis points."})
    assert r.status_code == 200
    _, events = ask_and_verify(client, FX_Q)
    checks = {c["id"]: c["status"] for c in events[-1][1]["result"]["checks"]}
    assert checks["crossref"] == "pass"
    client.post("/api/admin/reset")
    _, events = ask_and_verify(client, FX_Q)
    assert {c["id"]: c["status"] for c in events[-1][1]["result"]["checks"]}["crossref"] == "fail"


def test_feedback_and_errors(client):
    a = client.post("/api/ask", json={"question": SME_Q}).json()
    assert client.post(f"/api/answers/{a['answerId']}/feedback", json={"value": "wrong"}).json() == {"ok": True}
    assert client.get(f"/api/answers/{a['answerId']}").json()["feedback"] == "wrong"
    assert client.get("/api/answers/ANS-99999/verify").status_code == 404
    assert client.post("/api/ask", json={"question": ""}).status_code == 422
