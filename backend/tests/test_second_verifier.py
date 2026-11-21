"""The second verifier: an advisory, side-by-side assessment that never changes the answer's state or routing."""
from app import main as api
from app.models import NoSecondProvider, QwenProvider, get_second_provider
from tests.fakes import FakeProvider
from tests.test_workflow import FX_WRONG, make_client, submit


def test_not_configured_reports_not_run(tmp_path, monkeypatch):
    monkeypatch.delenv("SECOND_VERIFIER_PROVIDER", raising=False)
    monkeypatch.setattr(api, "_second", None)
    client = make_client(tmp_path, monkeypatch)
    assert client.get("/api/health").json()["secondVerifier"]["available"] is False
    aid, _ = submit(client, FX_WRONG, ["DOC-FX-019"])
    out = client.post(f"/api/answers/{aid}/second-opinion").json()
    assert out["result"] is None and out["verifier"]["available"] is False


def test_second_opinion_is_advisory(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)  # main verifier: no model
    monkeypatch.setattr(api, "_second", FakeProvider())
    aid, done = submit(client, FX_WRONG, ["DOC-FX-019"])
    before = client.get(f"/api/answers/{aid}").json()
    out = client.post(f"/api/answers/{aid}/second-opinion").json()
    assert out["verifier"]["model"] == "fake-model"
    r = out["result"]
    assert r["assessment"]["partial"] is False  # the second verifier had a model; the main one did not
    assert any(c["status"] != "supported" for c in r["claims"])
    for c in r["claims"]:
        assert FX_WRONG[c["start"]:c["end"]]  # located by offset in the same answer
    after = client.get(f"/api/answers/{aid}").json()
    assert after["state"] == before["state"] and after["latestAssessment"] == before["latestAssessment"]
    assert len(client.get(f"/api/answers/{aid}/history").json()["assessments"]) == 1


def test_provider_selection(monkeypatch):
    monkeypatch.delenv("SECOND_VERIFIER_PROVIDER", raising=False)
    assert isinstance(get_second_provider(), NoSecondProvider)
    monkeypatch.setenv("SECOND_VERIFIER_PROVIDER", "qwen")
    monkeypatch.delenv("SECOND_VERIFIER_MODEL", raising=False)
    monkeypatch.setenv("ASSESSMENT_MODEL", "qwen-plus")  # the main verifier's setting does not leak in
    p = get_second_provider()
    assert isinstance(p, QwenProvider) and p.model == "qwen4-max"
