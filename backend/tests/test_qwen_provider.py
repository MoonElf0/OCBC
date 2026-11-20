"""QwenProvider against a stub OpenAI-style client: no network, no key."""
import json
from types import SimpleNamespace as NS

import pytest

from app.models import ModelUnavailable, QwenProvider, get_provider


class StubClient:
    def __init__(self, content, finish_reason="stop"):
        self.content, self.finish_reason, self.calls = content, finish_reason, []
        self.chat = NS(completions=NS(create=self._create))

    def _create(self, **kw):
        self.calls.append(kw)
        msg = NS(content=self.content if isinstance(self.content, str) else json.dumps(self.content))
        return NS(choices=[NS(message=msg, finish_reason=self.finish_reason)])


PASSAGES = [{"docId": "D1", "version": "v1", "section": "1", "text": "Fees are waived for 12 months."}]


def test_judge_parses_and_sends_json_mode_without_thinking():
    stub = StubClient({"verdict": "supported", "passage": 0, "quote": "Fees are waived", "reason": "Matches."})
    out = QwenProvider(client=stub).judge_claim("q", "Fees are waived.", PASSAGES)
    assert out["verdict"] == "supported"
    call = stub.calls[0]
    assert call["response_format"] == {"type": "json_object"}
    assert call["extra_body"] == {"enable_thinking": False}
    assert "<passage>" in call["messages"][1]["content"]


def test_extract_claims():
    stub = StubClient({"claims": ["Fees are waived.", 3]})
    assert QwenProvider(client=stub).extract_claims("q", "Fees are waived.") == ["Fees are waived."]


@pytest.mark.parametrize("content,finish", [
    ("not json", "stop"),
    ({"verdict": "probably", "passage": 0, "quote": "", "reason": ""}, "stop"),
    ({"verdict": "supported", "passage": "0", "quote": "", "reason": ""}, "stop"),
    ({"verdict": "supported"}, "stop"),
    ('{"verdict": "supp', "length"),
    ("", "stop"),
])
def test_bad_output_is_unavailable_never_guessed(content, finish):
    with pytest.raises(ModelUnavailable):
        QwenProvider(client=StubClient(content, finish)).judge_claim("q", "c", PASSAGES)


def test_missing_key_reports_unavailable(monkeypatch):
    monkeypatch.setenv("ASSESSMENT_MODEL_PROVIDER", "qwen")
    monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)
    p = get_provider()
    assert p.name == "qwen" and p.status()["available"] is False
    with pytest.raises(ModelUnavailable, match="DASHSCOPE_API_KEY"):
        p.extract_claims("q", "a")
