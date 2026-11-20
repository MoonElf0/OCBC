"""
The verifier's own retrieval over the approved policy library.

Independent of the answering agent: it searches every document, including
ones the agent did not cite and ones that have been superseded (so it can
tell when an answer rests on a stale source).

Scoring is lexical and needs no model or network: IDF-weighted term
coverage -- the share of a claim's informative terms (weighted by rarity
across the library) that a passage contains, 0..1. Figures are left out of
relevance on purpose: retrieval finds passages on the *same point*; whether
the numbers agree is the rule checks' job. Phase 4 can add embeddings
behind the same `search` signature (hybrid retrieval).
"""
import math
import re
from dataclasses import dataclass

STOPWORDS = set(
    """a an and are as at be before by can for from has have if in into is it its may must
    of on or that the their them then there these this those to under up was were will
    with within without any each every all such than so not no yes also you your i we our
    do does need needs needed what which who how""".split()
)

_WORD = re.compile(r"[a-z][a-z'-]*")
_SENT = re.compile(r"(?<=[.!?])\s+")

# Minimum relevance for a passage to count as found. Below it, a claim has
# "no source". Tuned on the synthetic library; tests/test_retrieval.py pins
# which side of it each fixture claim falls on.
THRESHOLD = 0.5
# Stricter bar for "the current approved passage on the same point" that a
# claim's figures are compared against (the counter-passage).
SAME_POINT = 0.7
TOP_K = 5


def stem(w: str) -> str:
    """Light suffix stemming: managers/manager, approved/approval/approve."""
    w = w.strip("'-").replace("'s", "")
    for suf in ("ations", "ation", "ings", "ing", "ers", "ed", "es", "al", "s"):
        if w.endswith(suf) and len(w) - len(suf) >= 4:
            w = w[: -len(suf)]
            break
    if w.endswith("e") and len(w) > 4:
        w = w[:-1]
    return w


def terms(text: str) -> set[str]:
    words = _WORD.findall(text.lower().replace("’", "'"))
    out = set()
    for w in words:
        for part in w.split("-"):  # cross-border -> cross, border
            if part and part not in STOPWORDS and len(part) > 1:
                out.add(stem(part))
    return out


@dataclass(frozen=True)
class Unit:
    """One sentence of one section -- the unit retrieval scores."""

    doc_id: str
    section: str
    text: str  # the sentence
    passage: str  # the whole section text
    terms: frozenset


class Index:
    def __init__(self, docs: dict):
        self.docs = docs
        self.units: list[Unit] = []
        for d in docs.values():
            for s in d["sections"]:
                # Sentences first, whole section last: on a tie the single
                # sentence wins, so its figures are the ones compared.
                sents = _SENT.split(s["text"])
                for sent in [*sents, *([s["text"]] if len(sents) > 1 else [])]:
                    self.units.append(Unit(d["id"], s["id"], sent, s["text"], frozenset(terms(sent + " " + s["heading"]))))
        n = len({(u.doc_id, u.section, u.text) for u in self.units})
        df: dict[str, int] = {}
        for u in {(u.doc_id, u.section, u.text): u for u in self.units}.values():
            for t in u.terms:
                df[t] = df.get(t, 0) + 1
        self.n = n
        self.df = df

    def idf(self, t: str) -> float:
        return math.log(1 + self.n / (self.df.get(t, 0) + 0.5))

    def coverage(self, q: set[str], unit_terms: frozenset) -> float:
        total = sum(self.idf(t) for t in q)
        if not total:
            return 0.0
        return sum(self.idf(t) for t in q & unit_terms) / total

    def search(self, query: str, k: int = TOP_K) -> list[dict]:
        """Best sentence per section, ranked. Each hit: docId, section, passage, sentence, score."""
        q = terms(query)
        best: dict[tuple, dict] = {}
        for u in self.units:
            s = self.coverage(q, u.terms)
            key = (u.doc_id, u.section)
            if s > best.get(key, {"score": -1})["score"]:
                best[key] = {"docId": u.doc_id, "section": u.section, "passage": u.passage, "sentence": u.text, "score": round(s, 3)}
        hits = sorted(best.values(), key=lambda h: -h["score"])
        return [h for h in hits[:k] if h["score"] > 0]
