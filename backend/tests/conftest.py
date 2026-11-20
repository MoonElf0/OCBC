import json
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

# Tests never call a real model, whatever backend/.env says. load_dotenv does
# not override variables that are already set, so these win.
os.environ["ASSESSMENT_MODEL_PROVIDER"] = "none"
os.environ["AGENT_MODEL_PROVIDER"] = "none"


@pytest.fixture(scope="session")
def golden():
    return json.loads((ROOT / "backend/data/golden.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def schema_validator():
    import jsonschema

    schema = json.loads((ROOT / "contract/verification-result.schema.json").read_text(encoding="utf-8"))
    return jsonschema.Draft202012Validator(schema)
