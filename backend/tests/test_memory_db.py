"""MONGODB_URI=memory: an in-memory database for when the cluster is unreachable."""
from app import db


def test_memory_uri_seeds_an_in_memory_database():
    d = db.connect(uri="memory", name="memory-test")
    assert d.meta.find_one({"_id": "schema"})["value"] == db.SCHEMA_VERSION
    assert d.policy_versions.count_documents({}) > 0


def test_memory_uri_is_case_and_space_insensitive():
    d = db.connect(uri=" Memory ", name="memory-test-2")
    assert d.policy_versions.count_documents({}) > 0
