"""
Live verifier (real retrieval + rule checks) against the scripted verdicts.

The scripted fixtures say which passage each verdict rests on, which
current passage contradicts it, and which documents the verifier found by
itself. Here those are recomputed from the document library alone, and
must agree. This is the start of the evaluation harness for phase 4.
"""
from copy import deepcopy

import pytest

from app import fixtures
from app.retrieval import THRESHOLD, Index
from app.verifier import verify

F = fixtures.load()
DOCS, TODAY = F["DOCUMENTS"], F["DEMO_TODAY"]
INDEX = Index(DOCS)
IDS = [s["id"] for s in fixtures.all_scenarios()]


def strip_live(result: dict) -> dict:
    r = deepcopy(result)
    r.pop("provenance", None)
    r.pop("search", None)
    for c in r["claims"]:
        c.pop("retrieval", None)
    return r


@pytest.mark.parametrize("sid", IDS)
def test_live_verifier_reproduces_scripted_evidence(sid, golden):
    live = verify(fixtures.scenario_by_id(sid), DOCS, TODAY, index=INDEX)
    expected = deepcopy(golden["assess"][sid])
    expected.pop("search", None)
    assert strip_live(live) == expected


@pytest.mark.parametrize("sid", IDS)
def test_live_result_matches_contract(sid, schema_validator):
    live = verify(fixtures.scenario_by_id(sid), DOCS, TODAY, index=INDEX)
    errors = [f"{list(e.path)}: {e.message}" for e in schema_validator.iter_errors(live)]
    assert errors == []


def test_no_source_found_is_computed():
    live = verify(fixtures.scenario_by_id("collateral-crypto"), DOCS, TODAY, index=INDEX)
    assert live["noSource"] is True
    assert live["search"]["topMatch"] < THRESHOLD == live["search"]["threshold"]
    assert live["search"]["documentsSearched"] == len(DOCS)


def test_every_found_claim_clears_the_threshold_and_misses_do_not():
    for s in fixtures.all_scenarios():
        live = verify(s, DOCS, TODAY, index=INDEX)
        for c in live["claims"]:
            found = c["retrieval"]["topScore"] >= THRESHOLD
            assert found == (c["status"] != "no-source" and not c.get("nearest")), c["id"]


def test_guard_rejects_a_verdict_citing_a_passage_retrieval_never_returned():
    s = deepcopy(fixtures.scenario_by_id("kyc-ubo"))
    # A judge that claims support from an unrelated FX passage.
    s["verification"]["claims"][0]["source"] = {"docId": "DOC-FX-019", "section": "§3.1", "passage": DOCS["DOC-FX-019"]["sections"][2]["text"]}
    c = verify(s, DOCS, TODAY, index=INDEX)["claims"][0]
    assert c["status"] == "unsupported"
    assert c["source"]["docId"] == "DOC-KYC-031"


def test_editing_a_document_changes_the_verdict():
    """The point of real retrieval: fix the library, and the flag clears."""
    docs = deepcopy(DOCS)
    # Policy owner raises the FX limit to 50 bps.
    docs["DOC-FX-019"]["sections"][0]["text"] = "Relationship managers may apply FX rate overrides of up to 50 basis points."
    before = verify(fixtures.scenario_by_id("fx-override"), DOCS, TODAY, index=INDEX)
    after = verify(fixtures.scenario_by_id("fx-override"), docs, TODAY)
    assert before["claims"][0].get("counter")
    assert "counter" not in after["claims"][0]
    assert {c["id"]: c["status"] for c in before["checks"]}["crossref"] == "fail"
    assert {c["id"]: c["status"] for c in after["checks"]}["crossref"] == "pass"
