"""The answering agent: scripted scenarios stay scripted; other questions go to the model writer."""
from app import agent, fixtures
from app.retrieval import Index


class StubWriter:
    name, model = "stub", "stub-writer"

    def __init__(self, answer="A relationship manager may approve up to SGD 200,000.", citations=("DOC-SME-112",), fail=False):
        self.answer, self.citations, self.fail, self.calls = answer, list(citations), fail, []

    def status(self):
        return {"provider": self.name, "model": self.model, "available": True, "reason": None}

    def write(self, question, passages):
        self.calls.append((question, passages))
        if self.fail:
            raise agent.WriterUnavailable("Stub offline.")
        return {"answer": self.answer, "citations": self.citations}


INDEX = Index(fixtures.load()["DOCUMENTS"])
FREE_Q = "What is the cut-off time for same-day processing?"


def test_scripted_question_never_calls_the_model():
    w = StubWriter()
    sc = fixtures.scenario_by_id("sme-limit")
    r = agent.ask(sc["question"], index=INDEX, writer=w)
    assert r["scenarioId"] == "sme-limit" and r["writtenBy"] == "scripted" and w.calls == []


def test_free_question_is_written_from_retrieved_passages():
    w = StubWriter(citations=["DOC-SME-112", "DOC-INVENTED-999"])
    assert agent.match_scenario(FREE_Q)["id"] == "fallback"
    r = agent.ask(FREE_Q, index=INDEX, writer=w)
    assert r["scenarioId"] is None and r["writtenBy"] == "stub-writer"
    # Citations reach the verifier unfiltered, so an invented one can be caught there.
    assert r["citations"] == ["DOC-SME-112", "DOC-INVENTED-999"]
    passages = w.calls[0][1]
    assert passages and all(p["score"] >= agent.AGENT_MIN_SCORE for p in passages)


def test_no_matching_policy_means_no_model_call():
    w = StubWriter()
    r = agent.ask("What is the office wifi password?", index=INDEX, writer=w)
    assert r["scenarioId"] == "fallback" and w.calls == []


def test_no_writer_configured_keeps_the_scripted_fallback():
    r = agent.ask(FREE_Q, index=INDEX, writer=agent.NoWriter())
    assert r["scenarioId"] == "fallback" and r["text"] == fixtures.load()["FALLBACK"]["answer"]["text"]


def test_model_failure_says_so_and_makes_no_claims():
    r = agent.ask(FREE_Q, index=INDEX, writer=StubWriter(fail=True))
    assert r["scenarioId"] == "fallback" and "could not write an answer" in r["text"] and r["citations"] == []


class StubEmbedder:
    """Puts the question next to one chosen section, far from every other."""

    def __init__(self, near=("DOC-KYC-040", "§3.2"), fail=False):
        self.near, self.fail = near, fail

    def search(self, question, docs, k):
        if self.fail:
            raise RuntimeError("embedding service down")
        d = docs[self.near[0]]
        sec = next(s for s in d["sections"] if s["id"] == self.near[1])
        return [{"docId": self.near[0], "section": sec["id"], "passage": sec["text"], "similarity": 0.8}]


PARAPHRASE_Q = "I'm not local, what paperwork should I bring?"


def test_meaning_search_finds_what_word_matching_misses():
    hits, method = agent.retrieve(PARAPHRASE_Q, INDEX, embedder=None)
    assert hits == [] and method == "lexical"
    w = StubWriter(answer="Bring a passport.", citations=["DOC-KYC-040"])
    r = agent.ask(PARAPHRASE_Q, index=INDEX, writer=w, embedder=StubEmbedder())
    assert r["scenarioId"] is None and [p["docId"] for p in w.calls[0][1]] == ["DOC-KYC-040"]


def test_embedding_outage_falls_back_to_word_matching():
    hits, method = agent.retrieve(FREE_Q, INDEX, embedder=StubEmbedder(fail=True))
    assert method == "lexical" and hits and all("score" in h for h in hits)


def test_hybrid_never_duplicates_a_section():
    sec = ("DOC-SME-112", "§3.4")
    hits, _ = agent.retrieve(FREE_Q, INDEX, embedder=StubEmbedder(near=sec))
    keys = [(h["docId"], h["section"]) for h in hits]
    assert len(keys) == len(set(keys)) and sec in keys


def test_with_a_model_only_the_exact_suggested_question_is_scripted():
    near = "How much does it cost to send money overseas?"
    assert agent.match_scenario(near)["id"] != "fallback"  # keyword matching would grab it (demo mode)
    w = StubWriter()
    r = agent.ask(near, index=INDEX, writer=w, embedder=StubEmbedder(near=("DOC-REM-019", "§1")))
    assert r["scenarioId"] is None and w.calls
    sc = fixtures.scenario_by_id("fx-override")
    assert agent.ask(sc["question"].upper(), index=INDEX, writer=w)["scenarioId"] == "fx-override"


def test_one_retry_on_a_malformed_reply():
    from types import SimpleNamespace as NS

    replies = iter(['{"Answer": "wrong key"}', '{"answer": "Within 60 days.", "citations": ["DOC-CRD-031"]}'])
    client = NS(chat=NS(completions=NS(create=lambda **kw: NS(choices=[NS(message=NS(content=next(replies)))]))))
    assert agent.QwenWriter(client=client).write("q", [])["answer"] == "Within 60 days."
