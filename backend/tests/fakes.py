"""
Test doubles for the model provider. They exist only so tests can exercise
the model-dependent paths (and the guards around them) without a network.
They are never used by the running app.
"""
from app.models import ModelUnavailable
from app.pipeline import sentence_spans
from app.retrieval import terms


class FakeProvider:
    """Lexical stand-in: supports a claim when a passage covers most of its terms, and quotes that passage."""

    name = "fake"
    model = "fake-model"

    def __init__(self, extra_quotes=(), bad_quote=False, unavailable_judge=False, off_topic=()):
        self.extra_quotes = list(extra_quotes)
        self.bad_quote = bad_quote
        self.unavailable_judge = unavailable_judge
        self.off_topic = list(off_topic)
        self.seen_passages: list[str] = []

    def status(self):
        return {"provider": self.name, "model": self.model, "available": True, "reason": None}

    def extract_claims(self, question, answer):
        quotes = [answer[s:e] for s, e in sentence_spans(answer) if len(terms(answer[s:e])) >= 3]
        return quotes + self.extra_quotes

    def judge_claim(self, question, claim, passages):
        if self.unavailable_judge:
            raise ModelUnavailable("Fake judge offline.")
        self.seen_passages += [p["text"] for p in passages]
        q = terms(claim)
        best, cover = -1, 0.0
        for i, p in enumerate(passages):
            c = len(q & terms(p["text"])) / max(1, len(q))
            if c > cover:
                best, cover = i, c
        if best < 0 or cover < 0.5:
            return {"verdict": "insufficient", "passage": -1, "quote": "", "reason": "No passage covers it."}
        quote = "words that are not in the passage" if self.bad_quote else passages[best]["text"].split(".")[0]
        return {"verdict": "supported", "passage": best, "quote": quote, "reason": "Covers the claim."}

    def review_answer(self, question, answer, claims):
        return {"intent": "partly" if self.off_topic else "answers", "offTopicQuotes": self.off_topic, "intentReason": "Checked.",
                "contradiction": False, "contradictionReason": ""}
