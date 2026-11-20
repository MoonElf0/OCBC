import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))


@pytest.fixture(scope="session")
def golden():
    return json.loads((ROOT / "backend/data/golden.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def schema_validator():
    import jsonschema

    schema = json.loads((ROOT / "contract/verification-result.schema.json").read_text(encoding="utf-8"))
    return jsonschema.Draft202012Validator(schema)
