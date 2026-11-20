import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))


@pytest.fixture(autouse=True)
def _no_real_model(monkeypatch):
    """backend/.env may configure a real provider; tests never call it. Model paths use tests/fakes.py."""
    import app.db  # noqa: F401  loads .env first, so the override below wins
    import app.main

    monkeypatch.setenv("ASSESSMENT_MODEL_PROVIDER", "none")
    monkeypatch.setattr(app.main, "_provider", None)
    monkeypatch.setenv("AGENT_MODEL_PROVIDER", "none")
    monkeypatch.setattr(app.main, "_writer", None)
    monkeypatch.setattr(app.main, "_embedder", None)


@pytest.fixture(scope="session")
def golden():
    return json.loads((ROOT / "backend/data/golden.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def schema_validator():
    import jsonschema

    schema = json.loads((ROOT / "contract/verification-result.schema.json").read_text(encoding="utf-8"))
    return jsonschema.Draft202012Validator(schema)
