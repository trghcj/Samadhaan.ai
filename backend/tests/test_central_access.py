"""Central ("All Departments") operator access is limited to emails in CENTRAL_OPERATOR_EMAILS,
and the PostgreSQL URL always uses the installed psycopg2 driver."""
import uuid

import pytest
from fastapi.testclient import TestClient

CENTRAL = "All Departments"


# ---------- database URL ----------

@pytest.mark.parametrize("url,expected", [
    ("postgresql://u:p@db.example.co:5432/postgres", "postgresql+psycopg2://u:p@db.example.co:5432/postgres"),
    ("postgres://u:p@h/db", "postgresql+psycopg2://u:p@h/db"),
    ("postgresql+psycopg2://u:p@h/db", "postgresql+psycopg2://u:p@h/db"),
    ("sqlite:///demo.db", "sqlite:///demo.db"),
])
def test_normalize_db_url_uses_psycopg2(url, expected):
    from database import normalize_db_url

    assert normalize_db_url(url) == expected


# ---------- helpers ----------

@pytest.fixture(scope="module")
def client():
    import main

    return TestClient(main.app)


@pytest.fixture
def allow(monkeypatch):
    def _allow(*emails):
        monkeypatch.setenv("CENTRAL_OPERATOR_EMAILS", ",".join(emails))
    _allow()  # nobody by default
    return _allow


def new_email():
    return f"user-{uuid.uuid4().hex[:10]}@example.com"


def sync(client, email, role="citizen", department=None, uid=None):
    uid = uid or uuid.uuid4().hex
    r = client.post("/api/users/sync", json={"uid": uid, "email": email, "display_name": "T", "role": role, "department": department})
    assert r.status_code == 200
    return uid, r.json()


def add_user_row(uid, email, role, department):
    import models
    from database import SessionLocal

    db = SessionLocal()
    db.add(models.User(uid=uid, email=email, role=role, department=department))
    db.commit()
    db.close()


def add_grievance(prediction):
    import models
    from database import SessionLocal

    db = SessionLocal()
    g = models.Grievance(transcript=f"test {uuid.uuid4().hex}", prediction=prediction, confidence="Low", confidence_score=0.3)
    db.add(g)
    db.commit()
    gid = g.id
    db.close()
    return gid


def register_ids(client, uid):
    data = client.get("/api/grievances", params={"uid": uid}).json()
    assert isinstance(data, list), data
    return {g["id"] for g in data}


# ---------- sign-in ----------

def test_allowlisted_email_becomes_central_operator_whatever_it_signs_up_as(client, allow):
    email = new_email()
    allow(email.upper())  # matching ignores case
    _, body = sync(client, email, role="citizen")
    assert (body["role"], body["department"]) == ("operator", CENTRAL)


def test_central_department_is_refused_for_other_emails(client, allow):
    allow("someone-else@example.com")
    _, body = sync(client, new_email(), role="operator", department=CENTRAL)
    assert body["department"] != CENTRAL
    assert body["role"] == "citizen"


def test_existing_central_user_not_on_allowlist_is_demoted_at_login(client, allow):
    email, uid = new_email(), uuid.uuid4().hex
    add_user_row(uid, email, "operator", CENTRAL)
    _, body = sync(client, email, uid=uid)
    assert (body["role"], body["department"]) == ("citizen", None)


def test_department_operator_keeps_its_department(client, allow):
    _, body = sync(client, new_email(), role="operator", department="Roads")
    assert (body["role"], body["department"]) == ("operator", "Roads")


# ---------- register visibility ----------

def test_central_operator_sees_unclear_and_every_department(client, allow):
    unclear, roads = add_grievance("Unclear"), add_grievance("Roads")
    email = new_email()
    allow(email)
    uid, _ = sync(client, email)
    assert {unclear, roads} <= register_ids(client, uid)


def test_department_operator_sees_only_its_department(client, allow):
    unclear, roads = add_grievance("Unclear"), add_grievance("Roads")
    uid, _ = sync(client, new_email(), role="operator", department="Roads")
    ids = register_ids(client, uid)
    assert roads in ids and unclear not in ids


def test_operator_without_valid_department_sees_nothing(client, allow):
    add_grievance("Roads")
    uid = uuid.uuid4().hex
    add_user_row(uid, new_email(), "operator", None)
    assert register_ids(client, uid) == set()


def test_central_operator_can_reassign_unclear_to_a_department(client, allow):
    gid = add_grievance("Unclear")
    email = new_email()
    allow(email)
    uid, _ = sync(client, email)

    r = client.patch(f"/api/grievances/{gid}/reassign", json={"uid": uid, "department": "Roads"})
    assert r.status_code == 200, r.text
    assert r.json()["prediction"] == "Roads"

    row = next(g for g in client.get("/api/grievances", params={"uid": uid}).json() if g["id"] == gid)
    assert (row["prediction"], row["confidence"], row["previous_prediction"], row["assigned_by"]) == ("Roads", "Assigned by officer", "Unclear", email)
    assert row["assigned_at"]

    roads_uid, _ = sync(client, new_email(), role="operator", department="Roads")
    assert gid in register_ids(client, roads_uid)


def test_department_operator_cannot_reassign(client, allow):
    gid = add_grievance("Unclear")
    uid, _ = sync(client, new_email(), role="operator", department="Roads")
    assert client.patch(f"/api/grievances/{gid}/reassign", json={"uid": uid, "department": "Roads"}).status_code == 403


def test_unknown_uid_cannot_reassign(client, allow):
    gid = add_grievance("Unclear")
    assert client.patch(f"/api/grievances/{gid}/reassign", json={"uid": "nobody", "department": "Roads"}).status_code == 403


def test_reassign_rejects_unknown_department(client, allow):
    gid = add_grievance("Unclear")
    email = new_email()
    allow(email)
    uid, _ = sync(client, email)
    for dept in ("Unclear", "All Departments", "Parks"):
        assert client.patch(f"/api/grievances/{gid}/reassign", json={"uid": uid, "department": dept}).status_code == 400


def test_reassign_missing_or_resolved_complaint(client, allow):
    import models
    from database import SessionLocal

    email = new_email()
    allow(email)
    uid, _ = sync(client, email)
    assert client.patch("/api/grievances/999999999/reassign", json={"uid": uid, "department": "Roads"}).status_code == 404

    gid = add_grievance("Unclear")
    db = SessionLocal()
    db.query(models.Grievance).filter(models.Grievance.id == gid).update({"is_resolved": True})
    db.commit()
    db.close()
    assert client.patch(f"/api/grievances/{gid}/reassign", json={"uid": uid, "department": "Roads"}).status_code == 409


def test_central_row_without_allowlist_sees_nothing(client, allow):
    add_grievance("Roads")
    uid = uuid.uuid4().hex
    add_user_row(uid, new_email(), "operator", CENTRAL)
    assert register_ids(client, uid) == set()
