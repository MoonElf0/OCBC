"""
The answering agent -- a separate system from Assessment AI.

Deliberately minimal, same as frontend/src/lib/agent.js: it matches the
question to a scripted scenario and returns that answer. It is meant to be
wrong some of the time so the verifier has something to catch. Phase 4
replaces `ask` with a retrieval agent behind the same return shape.
"""
import re

from . import fixtures


def _normalise(s: str) -> str:
    s = s.lower().replace("’", "'")
    return re.sub(r"[^a-z0-9%' -]+", " ", s)


def _has(text: str, term: str) -> bool:
    # Whole words only, so "whether" never matches "ether".
    return re.search(rf"(^|[^a-z0-9]){re.escape(term)}([^a-z0-9]|$)", text) is not None


def match_scenario(question: str) -> dict:
    text = _normalise(question)
    for s in fixtures.scenarios():
        if _normalise(s["question"]).strip() == text.strip():
            return s
    best, best_score = None, 0
    for s in fixtures.scenarios():
        if any(_has(text, k) for k in s.get("excludes", [])):
            continue
        score = sum(3 for k in s["strong"] if _has(text, k)) + sum(1 for k in s["keywords"] if _has(text, k))
        if score > best_score:
            best, best_score = s, score
    return best if best_score >= 4 else fixtures.load()["FALLBACK"]


def ask(question: str) -> dict:
    s = match_scenario(question)
    return {"scenarioId": s["id"], "text": s["answer"]["text"], "citations": s["answer"]["citations"]}
