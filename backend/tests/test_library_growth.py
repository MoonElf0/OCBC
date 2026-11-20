"""Library-only documents: an existing database picks them up, and retrieval finds them."""
import mongomock

from app import db, fixtures
from app.retrieval import Index

NEW_DOCS = ["DOC-KYC-040", "DOC-DEP-015", "DOC-CRD-030", "DOC-SME-130", "DOC-PAY-008"]


def test_a_database_seeded_before_new_documents_gains_them_without_a_reset():
    client = mongomock.MongoClient()
    d = db.connect(client=client)
    d.policy_versions.delete_many({"docId": {"$in": NEW_DOCS}})  # as if seeded before they existed
    d.reviews.update_one({}, {"$set": {"note": "kept"}})
    rev = db.library_rev(d)
    d = db.connect(client=client)
    assert set(NEW_DOCS) <= set(d.policy_versions.distinct("docId"))
    assert d.reviews.find_one({"note": "kept"})  # nothing else was rebuilt
    assert db.library_rev(d) != rev  # the retrieval index is rebuilt
    assert db.add_missing_documents(d) == []


def test_questions_on_the_new_topics_retrieve_the_new_documents():
    index = Index(fixtures.load()["DOCUMENTS"])
    for q, doc in [
        ("What ID does a foreign applicant need to open a personal savings account?", "DOC-KYC-040"),
        ("What is the fall-below fee on a personal savings account?", "DOC-DEP-015"),
        ("How long does a cardholder have to raise a card dispute?", "DOC-CRD-030"),
        ("Is there a prepayment fee for early repayment of an SME term loan?", "DOC-SME-130"),
        ("What commission is charged for an outward telegraphic transfer?", "DOC-PAY-008"),
    ]:
        assert index.search(q)[0]["docId"] == doc, q
