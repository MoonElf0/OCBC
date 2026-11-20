"""
Assemble a verification result: rule checks + judge verdicts + computed score.
Port of frontend/src/lib/assess.js. Pure, so tests and the API agree.
"""
import math

from . import fixtures
from .rules import citation_check, crossref_check, freshness_check


def js_round(x: float) -> int:
    """Math.round: halves round up (Python's round() rounds halves to even)."""
    return math.floor(x + 0.5)


def score_model() -> dict:
    return fixtures.load()["SCORE_MODEL"]


def score_of(claims: list[dict], checks: list[dict]) -> dict:
    if not claims:
        return {"score": None, "parts": None}
    m = score_model()
    claim_share = sum(m["claimCredit"][c["status"]] for c in claims) / len(claims)
    counted = [c for c in checks if c["status"] in m["checkCredit"]]
    check_share = sum(m["checkCredit"][c["status"]] for c in counted) / len(counted) if counted else 0
    claim_pts = claim_share * m["claimWeight"]
    check_pts = check_share * m["checkWeight"]
    # When retrieval found nothing for any claim, passing checks prove little.
    all_no_source = all(c["status"] == "no-source" for c in claims)
    cap = m["noSourceCap"] if all_no_source else m["cap"]
    return {
        "score": min(cap, js_round(claim_pts + check_pts)),
        "parts": {
            "claimPts": js_round(claim_pts),
            "checkPts": js_round(check_pts),
            "capped": claim_pts + check_pts > cap,
            "cap": cap,
            "counted": len(counted),
        },
    }


def band_for(score: int | None) -> dict:
    if score is None:
        return {"id": "none", "label": "Not scored", "status": "unknown"}
    return next(b for b in fixtures.load()["BANDS"] if score >= b["min"])


def assess(
    scenario: dict,
    docs: dict,
    today: str,
    *,
    question: str | None = None,
    verification: dict | None = None,
) -> dict:
    """
    scenario      the agent's answer plus the scripted judge output
    verification  optional replacement for scenario['verification'] -- the live
                  verifier passes claims whose evidence came from real retrieval
    """
    v = verification or scenario["verification"]
    answer = scenario["answer"]
    scripted_q = scenario.get("question")
    paraphrased = bool(question and scripted_q and question.strip() != scripted_q)
    judge = {c["id"]: c for c in v["checks"]}
    if paraphrased and "intent" in judge:
        # The prototype matched free text to a scripted question. Say so rather than
        # pretending the scripted intent verdict applies to what was actually asked.
        judge["intent"] = {
            "id": "intent",
            "status": "warning",
            "short": "Matched to a similar question",
            "summary": f"Your question was matched to the scripted question “{scripted_q}”. The answer may not address exactly what you asked.",
            "evidence": [{"kind": "question"}],
        }
    rule = {
        "citation": citation_check(answer, v["claims"], docs),
        "freshness": freshness_check(answer, v["claims"], docs, today),
        "crossref": crossref_check(answer, v["claims"]),
    }
    checks = [rule.get(meta["id"]) or judge[meta["id"]] for meta in fixtures.checks_meta()]
    scored = score_of(v["claims"], checks)
    return {
        **v,
        "checks": checks,
        "score": scored["score"],
        "parts": scored["parts"],
        "band": band_for(scored["score"]),
        "matchedQuestion": scripted_q if paraphrased else None,
    }
