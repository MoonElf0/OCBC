"""
Dashboard figures. Port of frontend/src/lib/metrics.js.

`data` is read from the database (weekly counts, documents, tagged reviewer
outcomes); `live` is reviewer decisions recorded through the API. Every rate
is computed from counts, never stored.
"""
from .assess import js_round
from .freshness import freshness_of

METRICS = ["answers", "claims", "unsupported", "conflicting", "stale", "noSource", "reviews"]


def pct(x: float) -> str:
    return f"{js_round(x * 100)}%"


def _with_rates(c: dict) -> dict:
    claims, answers = c["claims"], c["answers"]
    return {
        **c,
        "accuracy": 1 - (c["unsupported"] + c["conflicting"]) / claims,
        "unsupportedRate": c["unsupported"] / claims,
        "conflictingRate": c["conflicting"] / claims,
        "staleRate": c["stale"] / claims,
        "failureRate": (c["unsupported"] + c["conflicting"]) / claims,
        "noSourceRate": c["noSource"] / answers,
    }


class Metrics:
    def __init__(self, data: dict, today: str, live: list[dict] | None = None):
        self.d = data
        self.today = today
        self.live_decisions = live or []
        self.n = len(data["WEEKS"])
        self.w = data["WINDOW_WEEKS"]

    def _range(self, which: str) -> tuple[int, int]:
        n, w = self.n, self.w
        return (n - 2 * w, n - w) if which == "prev" else (n - w, n)

    def topic_stats(self, topic_id: str, which: str = "last") -> dict:
        a, b = self._range(which)
        w = self.d["WEEKLY"][topic_id]
        return _with_rates({m: sum(w[m][a:b]) for m in METRICS})

    def overall_stats(self, which: str = "last") -> dict:
        a, b = self._range(which)
        return _with_rates({m: sum(sum(w[m][a:b]) for w in self.d["WEEKLY"].values()) for m in METRICS})

    def weekly_series(self, topic_id: str | None = None) -> list[dict]:
        sources = [self.d["WEEKLY"][topic_id]] if topic_id else list(self.d["WEEKLY"].values())
        return [
            {"label": label, **_with_rates({m: sum(w[m][i] for w in sources) for m in METRICS})}
            for i, label in enumerate(self.d["WEEKS"])
        ]

    @staticmethod
    def direction(prev: float, last: float, threshold: float = 0.01) -> dict:
        delta = last - prev
        if delta <= -threshold:
            return {"id": "improving", "delta": delta}
        if delta >= threshold:
            return {"id": "worsening", "delta": delta}
        return {"id": "flat", "delta": delta}

    def topic_table(self) -> list[dict]:
        rows = []
        for t in self.d["TOPICS"].values():
            last, prev = self.topic_stats(t["id"], "last"), self.topic_stats(t["id"], "prev")
            rows.append({
                **t,
                "last": last,
                "prev": prev,
                "trend": self.direction(prev["failureRate"] + prev["staleRate"], last["failureRate"] + last["staleRate"]),
                "series": [w["failureRate"] + w["staleRate"] for w in self.weekly_series(t["id"])],
            })
        return sorted(rows, key=lambda r: -(r["last"]["failureRate"] + r["last"]["staleRate"]))

    # ── reviewer outcomes ────────────────────────────────────────────────
    def _rows(self) -> list[dict]:
        return [*self.d["REVIEW_OUTCOMES"], *({**x, "count": 1, "live": True} for x in self.live_decisions)]

    def _count(self, pred) -> int:
        return sum(r["count"] for r in self._rows() if pred(r))

    def _live(self, pred) -> int:
        return sum(1 for r in self._rows() if r.get("live") and pred(r))

    def recommendations(self) -> list[dict]:
        count, live = self._count, self._live
        docs, topics = self.d["DOCUMENTS"], self.d["TOPICS"]
        recs = []

        # Rule 1 -- stale documents still being retrieved.
        for doc in docs.values():
            f = freshness_of(doc["id"], docs, self.today)
            if not f["stale"]:
                continue
            t = self.topic_stats(doc["topic"])
            pred = lambda r, d=doc: r.get("docId") == d["id"] and r["decision"] != "approved" and r["category"] == "stale-source"
            corrected, today = count(pred), live(pred)
            superseded = f["state"] == "superseded"
            tname = topics[doc["topic"]]["name"]
            reviews = t["reviews"] + live(lambda r, d=doc: r["topic"] == d["topic"])
            recs.append({
                "id": f"doc-{doc['id']}",
                "kind": "retire-document" if superseded else "review-document",
                "topic": doc["topic"],
                "docId": doc["id"],
                "affected": t["stale"],
                "unit": "claims",
                "title": f"Retire {doc['id']} from the retrieval index" if superseded else f"Schedule a review of {doc['id']}",
                "detail": (
                    f"{doc['title']} was superseded by {f['supersededBy']['id']} but is still being retrieved, so the agent keeps quoting its old figures. Redirect it to {f['supersededBy']['title']}."
                    if superseded
                    else f"{doc['title']} is {f['months']} months old and past its {doc['reviewCycleMonths']}-month review cycle. Ask {doc['owner']} to confirm or update it."
                ),
                "evidence": [
                    f"{tname} stale-source rate {pct(t['staleRate'])} ({t['stale']:,} of {t['claims']:,} claims)",
                    f"{corrected} of {reviews:,} {tname} reviews corrected an answer resting on it{f' · {today} today' if today else ''}",
                ],
                "today": today,
            })

        # Rule 2 -- topics where retrieval often finds nothing.
        for topic in topics.values():
            t = self.topic_stats(topic["id"])
            if t["noSourceRate"] < 0.1:
                continue
            pred = lambda r, tp=topic: r["topic"] == tp["id"] and r["category"] == "no-source" and r["decision"] != "approved"
            n_live = live(pred)
            recs.append({
                "id": f"gap-{topic['id']}",
                "kind": "add-source",
                "topic": topic["id"],
                "affected": t["unsupported"],
                "unit": "claims",
                "title": "Publish an approved policy on digital-asset collateral",
                "detail": "Questions about crypto and digital-asset collateral find no approved document, and the agent answers anyway. Publish a policy, or instruct the agent to decline these questions.",
                "evidence": [
                    f"{t['noSource']} of {t['answers']} {topic['name']} answers had no source found ({pct(t['noSourceRate'])})",
                    f"{count(pred)} of {t['reviews'] + live(lambda r, tp=topic: r['topic'] == tp['id'])} {topic['name']} reviews rejected for a missing source{f' · {n_live} today' if n_live else ''}",
                ],
                "today": n_live,
            })

        # Rule 3 -- a recurring root cause in reviewer corrections -> prompt fix.
        prompt_fixes = {
            "overstated-authority": {
                "title": "Tighten the agent prompt on approval authority",
                "detail": "Reviewers keep correcting answers that overstate how much a role can approve. Require the agent to quote numeric limits verbatim from the source, and to say when approval is needed.",
                "metric": lambda t, n: {"affected": t["conflicting"], "unit": "claims", "line": f"Conflicting-claim rate {pct(t['conflictingRate'])} ({t['conflicting']} claims)"},
            },
            "off-intent": {
                "title": "Keep answers to the product the employee asked about",
                "detail": "Answers drift into nearby products — for example retail cards when the question is about SME accounts. Instruct the agent to answer only for the product named in the question.",
                "metric": lambda t, n: {"affected": n, "unit": "answers", "line": f"{n} answers corrected for answering a different question"},
            },
        }
        for category, fix in prompt_fixes.items():
            for topic in topics.values():
                pred = lambda r, tp=topic, cat=category: r["topic"] == tp["id"] and r["category"] == cat and r["decision"] == "corrected"
                n = count(pred)
                if n < 5:
                    continue
                t = self.topic_stats(topic["id"])
                m = fix["metric"](t, n)
                n_live = live(pred)
                recs.append({
                    "id": f"prompt-{category}-{topic['id']}",
                    "kind": "tighten-prompt",
                    "topic": topic["id"],
                    "affected": m["affected"],
                    "unit": m["unit"],
                    "title": fix["title"],
                    "detail": fix["detail"],
                    "evidence": [
                        f"{n} of {t['reviews'] + live(lambda r, tp=topic: r['topic'] == tp['id'])} {topic['name']} reviews corrected for this reason{f' · {n_live} today' if n_live else ''}",
                        m["line"],
                    ],
                    "today": n_live,
                })

        recs.sort(key=lambda r: -r["affected"])
        return [{**r, "priority": "High" if i < 2 else "Medium" if i < 4 else "Low"} for i, r in enumerate(recs)]

    def dashboard(self) -> dict:
        """Everything the Trends page reads, in one payload."""
        return {
            "overall": {"last": self.overall_stats("last"), "prev": self.overall_stats("prev")},
            "series": self.weekly_series(),
            "topics": self.topic_table(),
            "recommendations": self.recommendations(),
            "weeks": self.d["WEEKS"],
            "windowWeeks": self.w,
        }
