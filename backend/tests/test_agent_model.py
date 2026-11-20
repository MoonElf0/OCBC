"""The optional model-backed answering agent (AGENT_MODEL_PROVIDER=qwen). No network: the model call is faked."""
import json

import mongomock
import pytest
from fastapi.testclient import TestClient

from app import agent, db, fixtures, qwen
from app import main as api
from app.models import QwenProvider, ModelUnavailable

SME_Q = fixtures.scenario_by_id("sme-limit")["question"]


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(api, "_conn", db.connect(client=mongomock.MongoClient()))
    monkeypatch.setattr(api, "_index", None)
    return TestClient(api.app)


def test_model_request_falls_back_to_scripted_when_no_agent_model_is_configured(client):
    a = client.post("/api/ask", json={"question": SME_Q, "agent": "model"}).json()
    assert a["scenarioId"] == "sme-limit"
    assert client.get("/api/health").json()["agent"]["provider"] == "scripted"


def test_model_answer_has_no_scenario_and_runs_the_full_pipeline(client, monkeypatch):
    monkeypatch.setenv("AGENT_MODEL_PROVIDER", "qwen")
    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
    seen = {}

    def fake_chat_json(model, system, user, schema):
        seen["user"] = user
        return {"answer": "A relationship manager can approve an SME cross-border transfer of up to SGD 200,000.", "citations": ["DOC-SME-087 §3.1"]}

    monkeypatch.setattr(qwen, "chat_json", fake_chat_json)
    a = client.post("/api/ask", json={"question": SME_Q, "agent": "model"}).json()
    assert a["scenarioId"] is None and a["generatedBy"]["provider"] == "qwen"
    assert "<passage" in seen["user"]  # it answered from retrieved library passages
    stored = client.get(f"/api/answers/{a['answerId']}").json()
    assert stored["text"] == a["text"]
    events = client.get(f"/api/answers/{a['answerId']}/verify?pace=0").text
    result = json.loads(events.strip().split("\n\n")[-1].split("data: ", 1)[1])["result"]
    # No verifier model in tests: model steps are "Not run" and the result is partial, never scripted.
    assert result["assessment"]["partial"] is True


def test_scripted_request_ignores_the_agent_model(client, monkeypatch):
    monkeypatch.setenv("AGENT_MODEL_PROVIDER", "qwen")
    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
    monkeypatch.setattr(qwen, "chat_json", lambda *a: pytest.fail("the model was called"))
    a = client.post("/api/ask", json={"question": SME_Q, "agent": "scripted"}).json()
    assert a["scenarioId"] == "sme-limit"


def test_model_failure_is_reported_not_replaced(client, monkeypatch):
    monkeypatch.setenv("AGENT_MODEL_PROVIDER", "qwen")
    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")

    def boom(*a):
        raise qwen.QwenError("The model provider is rate limiting requests. Try again shortly.")

    monkeypatch.setattr(qwen, "chat_json", boom)
    r = client.post("/api/ask", json={"question": SME_Q, "agent": "model"})
    assert r.status_code == 503 and "rate limiting" in r.json()["detail"]


def test_qwen_verifier_provider_reports_missing_key(monkeypatch):
    monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)
    p = QwenProvider(model="qwen-plus")
    assert p.status()["available"] is False
    with pytest.raises(ModelUnavailable):
        p.extract_claims("q", "a")
