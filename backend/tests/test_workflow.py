"""
Through HTTP: submit any answer -> verify -> mandatory review -> correction
re-verified -> policy change -> affected answers flagged -> re-verified.
"""
import mongomock
import json

import pytest
from fastapi.testclient import TestClient

from app import db, library
from app import main as api
from tests.fakes import FakeProvider

FX_WRONG = "Relationship managers can apply an FX rate override of up to 50 basis points without further approval."
FX_RIGHT = "Relationship managers may apply FX rate overrides of up to 10 basis points. Any override above 10 basis points requires prior approval from the Treasury desk head."
KYC_RIGHT = "Identify every beneficial owner who holds 25% or more of the company's shares or voting rights."


def make_client(tmp_path, monkeypatch, provider=None):
    monkeypatch.setattr(api, "_conn", db.connect(client=mongomock.MongoClient()))
    monkeypatch.setattr(api, "_index", None)
    monkeypatch.setattr(api, "_provider", provider or api.get_provider())
    return TestClient(api.app)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.delenv("ASSESSMENT_MODEL_PROVIDER", raising=False)
    return make_client(tmp_path, monkeypatch)


@pytest.fixture()
def model_client(tmp_path, monkeypatch):
    return make_client(tmp_path, monkeypatch, FakeProvider())


def sse(text):
    out = []
    for block in text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        out.append((lines["event"], json.loads(lines["data"])))
    return out


def submit(client, answer, citations=(), question="Can I override the FX rate without approval?", as_of=None):
    body = {"question": question, "answer": answer, "citations": list(citations)}
    if as_of:
        body["asOf"] = as_of
    a = client.post("/api/answers", json=body).json()
    events = sse(client.get(f"/api/answers/{a['answerId']}/verify?pace=0").text)
    return a["answerId"], events[-1][1]


def decide(client, rid, **kw):
    body = {"decision": "approved", "note": "Checked against the guideline.", "reviewerId": "rev-treasury", **kw}
    return client.post(f"/api/reviews/{rid}/decision", json=body)


# ── stage 1: any answer ──────────────────────────────────────────────────

def test_submitted_answer_is_verified_by_the_pipeline_and_streams_like_any_other(client, schema_validator):
    aid, done = submit(client, FX_WRONG, ["DOC-FX-019"])
    r = done["result"]
    assert list(schema_validator.iter_errors(r)) == []
    assert r["claims"][0]["status"] == "conflicting"
    assert r["assessment"]["partial"] is True  # no model configured in tests
    assert done["state"] == "review-required" and done["routed"]["queueId"].startswith("RQ-")
    assert client.get(f"/api/answers/{aid}").json()["kind"] == "submitted"


def test_health_reports_the_model_honestly(client):
    h = client.get("/api/health").json()
    assert h["model"]["available"] is False and "not set" in h["model"]["reason"]
    assert all(r["simulated"] for r in h["reviewers"])


# ── stage 2: mandatory review ────────────────────────────────────────────

def test_high_index_does_not_bypass_review_on_a_high_risk_topic(model_client):
    aid, done = submit(model_client, FX_RIGHT, ["DOC-FX-019"])
    assert done["result"]["band"]["id"] == "high"
    assert done["state"] == "review-required"
    item = next(q for q in model_client.get("/api/reviews").json() if q["answerId"] == aid)
    assert item["reasons"] == ["high-stakes"]


def test_a_clean_answer_on_an_ordinary_topic_needs_no_review(model_client):
    _, done = submit(model_client, KYC_RIGHT, ["DOC-KYC-031"], question="Who counts as a beneficial owner?")
    assert done["result"]["band"]["id"] == "high" and done["state"] == "cleared" and done["routed"] is None


def test_a_partial_assessment_always_needs_review(client):
    _, done = submit(client, KYC_RIGHT, ["DOC-KYC-031"], question="Who counts as a beneficial owner?")
    assert done["state"] == "review-required"
    item = next(q for q in client.get("/api/reviews").json() if q["id"] == done["routed"]["queueId"])
    assert item["reasons"] == ["partial"]


def test_review_cannot_be_bypassed(client):
    aid, done = submit(client, FX_WRONG, ["DOC-FX-019"])
    rid = done["routed"]["queueId"]
    # Feedback and escalation never clear it.
    client.post(f"/api/answers/{aid}/feedback", json={"value": "helpful"})
    client.post(f"/api/answers/{aid}/escalate", json={"note": "Looks fine to me"})
    assert client.get(f"/api/answers/{aid}").json()["state"] == "review-required"
    # Approving flagged claims needs an explicit override; the reviewer must be one of the simulated identities.
    assert decide(client, rid).status_code == 422
    assert decide(client, rid, overrideFlags=True, reviewerId="someone").status_code == 422
    assert decide(client, rid, overrideFlags=True, note="ok").status_code == 422  # a note is required
    ok = decide(client, rid, overrideFlags=True)
    assert ok.status_code == 200 and ok.json()["outcome"]["override"] is True
    assert client.get(f"/api/answers/{aid}").json()["state"] == "approved"


def test_arbitrary_correction_is_re_verified_and_history_is_kept(client):
    aid, done = submit(client, FX_WRONG, ["DOC-FX-019"])
    rid = done["routed"]["queueId"]
    own_words = "No. Overrides of up to 10 basis points are within a relationship manager's authority; above that, the Treasury desk head must approve first (DOC-FX-019 §2.2)."
    d = decide(client, rid, decision="corrected", correctedText=own_words, note="Limit is 10 bps, not 50.")
    assert d.status_code == 200, d.text
    out = d.json()["outcome"]
    assert out["reviewer"].startswith("Reviewer B (simulated)") and out["simulatedIdentity"] is True
    assert out["at"].endswith("+00:00")  # an actual timestamp
    re_ = out["recheck"]
    assert re_["result"]["checks"][0]["status"] == "pass"  # the inline citation DOC-FX-019 §2.2 resolves
    assert not any(c["status"] == "conflicting" for c in re_["result"]["claims"])
    assert out["policyVersions"] and out["policyVersions"][0]["version"] == "v2.3"

    h = client.get(f"/api/answers/{aid}/history").json()
    assert h["answer"]["state"] == "corrected"
    assert len(h["assessments"]) == 1 and h["assessments"][0]["result"]["claims"][0]["status"] == "conflicting"  # original kept
    corr = h["corrections"][0]
    assert corr["text"] == own_words and corr["state"] == "approved" and corr["parentId"] == aid
    assert h["correctionAssessments"][corr["id"]][0]["id"] == re_["assessmentId"]
    actions = [e["action"] for e in h["events"]]
    assert "submitted for verification" in actions and "review decision: corrected" in actions
    assert any(e["simulated"] and e["actor"].startswith("Reviewer B") for e in h["events"])


def test_a_correction_with_its_own_conflicts_is_held_back(client):
    _, done = submit(client, FX_WRONG, ["DOC-FX-019"])
    bad = "Relationship managers can apply FX rate overrides of up to 30 basis points."
    r = decide(client, done["routed"]["queueId"], decision="corrected", correctedText=bad, note="Raised it.")
    assert r.status_code == 422
    assert client.get("/api/reviews").json()[0]["status"] == "pending"


# ── stage 3: policy versions and change impact ───────────────────────────

def new_fx_version(client, bps=25):
    sections = [
        {"id": "§2.1", "heading": "Relationship manager authority", "text": f"Relationship managers may apply FX rate overrides of up to {bps} basis points."},
        {"id": "§2.2", "heading": "Approval above authority", "text": f"Any override above {bps} basis points requires prior approval from the Treasury desk head."},
        {"id": "§3.1", "heading": "Record keeping", "text": "Every override must be recorded in the deal ticket with a reason code."},
    ]
    r = client.post("/api/library/DOC-FX-019/versions", json={"sections": sections, "changeNote": f"Authority raised to {bps} bps."})
    assert r.status_code == 200, r.text
    return r.json()


def test_drafts_do_not_change_anything_until_approved(client):
    aid, _ = submit(client, FX_RIGHT, ["DOC-FX-019"])
    draft = new_fx_version(client)
    assert draft["status"] == "draft" and draft["replaces"] == "v2.3" and draft["version"] == "v2.4"
    assert client.get(f"/api/answers/{aid}").json()["state"] == "review-required"
    lib = client.get("/api/library").json()
    fx = next(d for d in lib["documents"] if d["docId"] == "DOC-FX-019")
    assert fx["current"]["version"] == "v2.3"


def test_approving_a_version_flags_affected_answers_and_keeps_the_old_text(client):
    aid, before = submit(client, FX_RIGHT, ["DOC-FX-019"])
    other, _ = submit(client, KYC_RIGHT, ["DOC-KYC-031"], question="Who counts as a beneficial owner?")
    new_fx_version(client)
    r = client.post("/api/library/DOC-FX-019/versions/v2.4/approve").json()
    impacted = {i["answerId"] for i in r["impacted"]}
    assert aid in impacted and other not in impacted

    a = client.get(f"/api/answers/{aid}").json()
    assert a["state"] == "reverify-required"
    assert a["assessment"]["evidenceChanged"]["newVersion"] == "v2.4"
    assert a["result"] == before["result"]  # the original result is preserved as it was

    fx = next(d for d in r["library"]["documents"] if d["docId"] == "DOC-FX-019")
    states = {v["version"]: v["status"] for v in fx["versions"]}
    assert states == {"v2.4": "approved", "v2.3": "superseded"}
    old = next(v for v in fx["versions"] if v["version"] == "v2.3")
    assert "10 basis points" in old["sections"][0]["text"]  # never overwritten
    assert client.post("/api/library/DOC-FX-019/versions/v2.4/approve").status_code == 409
    assert client.post("/api/library/DOC-FX-019/versions", json={"version": "v2.3", "sections": fx["versions"][0]["sections"], "changeNote": "again"}).status_code == 409


def test_reverification_compares_against_the_new_version(client):
    aid, before = submit(client, FX_RIGHT, ["DOC-FX-019"])
    new_fx_version(client)
    client.post("/api/library/DOC-FX-019/versions/v2.4/approve")
    r = client.post(f"/api/answers/{aid}/reverify").json()
    assert r["previousAssessmentId"] != r["assessmentId"]
    new_claims = r["result"]["claims"]
    assert new_claims[0]["status"] == "unsupported"  # 10 bps now only matches the replaced v2.3
    assert new_claims[0]["counter"]["version"] == "v2.4" and "25 basis points" in new_claims[0]["counter"]["passage"]
    assert new_claims[0]["source"]["version"] == "v2.3" and new_claims[0]["source"]["state"] == "superseded"
    h = client.get(f"/api/answers/{aid}/history").json()
    first, second = h["assessments"]
    assert first["replacedBy"] == second["id"] and first["result"] == before["result"]
    assert any(v["docId"] == "DOC-FX-019" and v["version"] == "v2.4" for v in second["policyVersions"])
    assert "evidence-changed" in second["routing"]["reasons"]
    assert h["answer"]["state"] == "review-required"


def test_question_date_selects_the_version_in_force(client):
    new_fx_version(client)
    client.post("/api/library/DOC-FX-019/versions/v2.4/approve")
    _, old = submit(client, FX_RIGHT, ["DOC-FX-019"], as_of="2026-09-01")
    _, now = submit(client, FX_RIGHT, ["DOC-FX-019"])
    assert old["result"]["claims"][0]["source"]["version"] == "v2.3"
    assert now["result"]["claims"][0]["status"] == "unsupported"


def test_scripted_answers_show_the_backend_version_and_text(client):
    a = client.post("/api/ask", json={"question": "Can I override the FX rate for a corporate client without approval?"}).json()
    done = sse(client.get(f"/api/answers/{a['answerId']}/verify?pace=0").text)[-1][1]
    recs = {library.key_of(r["docId"], r["version"]): r for r in db.version_records(api.conn())}
    for c in done["result"]["claims"]:
        for ref in (c.get("source"), c.get("counter")):
            if ref:
                rec = recs[library.key_of(ref["docId"], ref["version"])]
                assert ref["passage"] == next(s["text"] for s in rec["sections"] if s["id"] == ref["section"])


def test_legacy_section_edit_creates_a_version_instead_of_overwriting(client):
    client.put("/api/documents/DOC-FX-019/sections/§2.1", json={"text": "Relationship managers may apply FX rate overrides of up to 50 basis points."})
    fx = next(d for d in client.get("/api/library").json()["documents"] if d["docId"] == "DOC-FX-019")
    assert [v["version"] for v in fx["versions"]] == ["v2.4", "v2.3"]
    assert "10 basis points" in fx["versions"][1]["sections"][0]["text"]
