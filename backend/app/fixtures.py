"""
Scripted demo data, exported from frontend/src/fixtures/index.js.

The JS module stays the single source of truth; `npm run export:fixtures`
writes data/fixtures.json and a frontend test fails if it is stale.

What is still scripted (and what replaces it later):
  answers           -> an LLM answering agent        (phase 4)
  claim spans       -> an LLM claim extractor         (phase 4)
  judge verdicts    -> an LLM judge that must quote   (phase 4)
Everything else -- retrieval, rule checks, score, routing, metrics -- is
computed by this backend.
"""
import json
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"


@lru_cache(maxsize=1)
def load() -> dict:
    return json.loads((DATA / "fixtures.json").read_text(encoding="utf-8"))


def scenarios() -> list[dict]:
    return load()["SCENARIOS"]


def all_scenarios() -> list[dict]:
    f = load()
    return [*f["SCENARIOS"], f["FALLBACK"], *f["CORRECTIONS"].values()]


def scenario_by_id(scenario_id: str) -> dict:
    for s in all_scenarios():
        if s["id"] == scenario_id:
            return s
    return load()["FALLBACK"]


def checks_meta() -> list[dict]:
    return load()["CHECKS"]


def demo_today() -> str:
    return load()["DEMO_TODAY"]
