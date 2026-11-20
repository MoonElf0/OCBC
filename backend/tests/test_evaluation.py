"""The evaluation harness reports what it recorded, and nothing else."""
import mongomock
import pytest
from fastapi.testclient import TestClient

from app import db, evaluation, pipeline
from app import main as api
from app.models import NoProvider
from tests.fakes import FakeProvider

DATA = evaluation.load()


def test_dataset_size_and_held_out_split():
    cases = DATA["cases"]
    assert 30 <= len(cases) <= 50
    tuning = {c["id"] for c in cases if c["split"] == "tuning"}
    held = {c["id"] for c in cases if c["split"] == "heldout"}
    assert tuning and held and not tuning & held and len(tuning | held) == len(cases)
    cats = {c["category"] for c in cases}
    for needed in ["correct", "incorrect-figure", "superseded-policy", "invented-citation", "irrelevant-citation",
                   "missing-evidence", "ambiguous-question", "reviewer-correction", "prompt-injection"]:
        assert needed in cats, needed


def test_every_labelled_quote_is_in_its_answer():
    for c in DATA["cases"]:
        for cl in c["claims"]:
            assert pipeline.locate(c["answer"], cl["quote"]), (c["id"], cl["quote"])
            assert cl["label"] in ("correct", "incorrect", "no-evidence")
        assert c.get("citation") in ("valid", "weak", "invalid", "missing")


def recount(rows):
    """Independent recount of the headline rates from the recorded rows."""
    flag = {"conflicting", "unsupported", "insufficient", "no-source"}
    claims = [c for r in rows for c in r["claims"]]
    inc = [c for c in claims if c["label"] == "incorrect"]
    cor = [c for c in claims if c["label"] == "correct"]
    want = {"valid": "pass", "weak": "warning", "invalid": "fail", "missing": "fail"}
    return {
        "detection": (sum(c["predicted"] in flag for c in inc), len(inc)),
        "falsePositive": (sum(c["predicted"] in flag for c in cor), len(cor)),
        "citation": (sum(want[r["citationLabel"]] == r["citationPredicted"] for r in rows), len(rows)),
        "abstention": (sum(c["predicted"] in ("insufficient", "no-source") for c in claims if c["label"] == "no-evidence"),
                       sum(c["label"] == "no-evidence" for c in claims)),
    }


@pytest.mark.parametrize("provider", [NoProvider(), FakeProvider()], ids=["no-model", "fake-model"])
def test_metrics_match_recorded_predictions_and_labels(provider):
    run = evaluation.run(provider, split="all")
    s = run["summary"]
    for k, (num, den) in recount(run["cases"]).items():
        assert (s[k]["numerator"], s[k]["denominator"]) == (num, den), k
        assert s[k]["rate"] == (num / den if den else None)
    assert s["latency"]["cases"] == len(run["cases"]) == len(DATA["cases"])


def test_the_run_says_how_it_was_produced():
    assert evaluation.run(NoProvider(), "tuning")["mode"] == "rule-based"
    assert evaluation.run(FakeProvider(), "tuning")["mode"] == "model-based"


def test_without_a_model_nothing_is_confirmed_and_nothing_is_guessed():
    s = evaluation.run(NoProvider(), "all")["summary"]
    assert s["confirmed"]["numerator"] == 0  # meaning is never confirmed by figures alone
    assert s["falsePositive"]["numerator"] == 0


def test_runs_are_recorded_through_the_api(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "_conn", db.connect(client=mongomock.MongoClient()))
    monkeypatch.setattr(api, "_provider", NoProvider())
    c = TestClient(api.app)
    r = c.post("/api/eval/run", json={"split": "heldout"}).json()
    assert r["split"] == "heldout" and all(x["split"] == "heldout" for x in r["cases"])
    info = c.get("/api/eval").json()
    assert info["runs"][0]["id"] == r["id"] and info["runs"][0]["summary"] == r["summary"]
    assert info["dataset"]["cases"] == len(DATA["cases"]) and len(info["definitions"]) >= 6
