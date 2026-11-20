"""The agent release check must match the JS demo, and hold over the API."""
import pytest
from fastapi.testclient import TestClient

from app import db, fixtures
from app import main as api
from app.assess import assess
from app.release_check import compare_versions
from app.freshness import freshness_of

F = fixtures.load()
DOCS, TODAY = F["DOCUMENTS"], F["DEMO_TODAY"]


def approx(x):
    if isinstance(x, float):
        return pytest.approx(x, rel=1e-12)
    if isinstance(x, dict):
        return {k: approx(v) for k, v in x.items()}
    if isinstance(x, list):
        return [approx(v) for v in x]
    return x


def scripted(sid: str) -> dict:
    return assess(fixtures.scenario_by_id(sid), DOCS, TODAY)


def test_comparison_matches_js(golden):
    got = compare_versions(F, DOCS, scripted, lambda d: freshness_of(d, DOCS, TODAY))
    assert got == approx(golden["evaluation"])


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "_conn", db.connect(tmp_path / "test.db"))
    monkeypatch.setattr(api, "_index", None)
    return TestClient(api.app)


def test_api_runs_the_live_verifier_and_agrees_with_the_demo(client, golden):
    r = client.get("/api/release-check").json()
    assert r["provenance"]["retrieval"] == "lexical"
    for k in ("questions", "topics", "overall", "counts", "release", "notes"):
        assert r[k] == approx(golden["evaluation"][k]), k
    q = r["questions"][0]
    assert set(r["answers"]) >= {q["baseId"], q["candidateId"]}
    assert r["answers"][q["candidateId"]]["result"]["claims"][0]["retrieval"]["topScore"] > 0


def test_rule_checks_follow_the_library(client):
    """Retrieval and rule checks are live: edit the KYC procedure and v2's cross-reference check changes."""
    def crossref(r, sid):
        return next(c for c in r["answers"][sid]["result"]["checks"] if c["id"] == "crossref")["status"]

    before = client.get("/api/release-check").json()
    text = "Identify every beneficial owner who holds 20% or more of the company's shares or voting rights."
    assert client.put("/api/documents/DOC-KYC-031/sections/§4.1", json={"text": text}).json()["ok"] is True
    after = client.get("/api/release-check").json()
    assert crossref(before, "eval-kyc-ubo-v2") == "fail"
    assert crossref(after, "eval-kyc-ubo-v2") == "pass"
    assert after["answers"]["eval-kyc-ubo-v2"]["result"]["score"] > before["answers"]["eval-kyc-ubo-v2"]["result"]["score"]
