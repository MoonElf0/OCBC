"""The Python port must produce exactly what the JS demo produces."""
import pytest

from app import fixtures
from app.assess import assess
from app.rules import figures

F = fixtures.load()
DOCS, TODAY = F["DOCUMENTS"], F["DEMO_TODAY"]
IDS = [s["id"] for s in fixtures.all_scenarios()]


@pytest.mark.parametrize("sid", IDS)
def test_assess_matches_js(sid, golden):
    assert assess(fixtures.scenario_by_id(sid), DOCS, TODAY) == golden["assess"][sid]


@pytest.mark.parametrize("sid", [s["id"] for s in F["SCENARIOS"]])
def test_paraphrased_matches_js(sid, golden):
    got = assess(fixtures.scenario_by_id(sid), DOCS, TODAY, question=golden["paraphrase"])
    assert got == golden["assessParaphrased"][sid]


def test_figures():
    assert figures("up to SGD 250,000 before 2:30 pm, 25%") == ["250000", "2:30", "25"]
