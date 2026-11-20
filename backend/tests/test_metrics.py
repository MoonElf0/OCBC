"""Dashboard numbers must match the JS demo exactly."""
import pytest

from app import fixtures
from app.metrics import Metrics

F = fixtures.load()


def approx(x):
    if isinstance(x, float):
        return pytest.approx(x, rel=1e-12)
    if isinstance(x, dict):
        return {k: approx(v) for k, v in x.items()}
    if isinstance(x, list):
        return [approx(v) for v in x]
    return x


def test_overall_and_series(golden):
    m = Metrics(F, F["DEMO_TODAY"])
    g = golden["metrics"]
    assert m.overall_stats("last") == approx(g["overall"]["last"])
    assert m.overall_stats("prev") == approx(g["overall"]["prev"])
    assert m.weekly_series() == approx(g["series"])
    assert m.topic_table() == approx(g["topics"])


def test_recommendations(golden):
    g = golden["metrics"]
    assert Metrics(F, F["DEMO_TODAY"]).recommendations() == g["recommendations"]
    assert Metrics(F, F["DEMO_TODAY"], g["sampleLiveDecisions"]).recommendations() == g["recommendationsWithLive"]
