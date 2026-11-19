"""Map location and address lines: validation (parse_place) and storage through /api/submit-text."""
import time

import pytest
from fastapi.testclient import TestClient


# ---------- parse_place ----------

def test_parse_place_valid():
    from location import parse_place

    assert parse_place("28.7", "77.1", " H 12 ", "", "110085") == {
        "latitude": 28.7, "longitude": 77.1, "address_line": "H 12", "landmark": None, "pincode": "110085",
    }


def test_parse_place_empty_strings_are_absent():
    from location import parse_place

    assert parse_place("", "", "", "", "") == {
        "latitude": None, "longitude": None, "address_line": None, "landmark": None, "pincode": None,
    }
    assert parse_place(None, None, None, None, None)["latitude"] is None


def test_parse_place_rejects_half_pair():
    from location import parse_place

    with pytest.raises(ValueError):
        parse_place("28.7", "", None, None, None)
    with pytest.raises(ValueError):
        parse_place(None, "77.1", None, None, None)


@pytest.mark.parametrize("lat,lng", [("91", "77"), ("28", "181"), ("-91", "0"), ("abc", "77"), ("nan", "77")])
def test_parse_place_rejects_out_of_range(lat, lng):
    from location import parse_place

    with pytest.raises(ValueError):
        parse_place(lat, lng, None, None, None)


@pytest.mark.parametrize("pin", ["11008", "11008A", "1100855"])
def test_parse_place_rejects_bad_pincode(pin):
    from location import parse_place

    with pytest.raises(ValueError):
        parse_place(None, None, None, None, pin)


def test_parse_place_caps_text():
    from location import parse_place

    out = parse_place(None, None, "x" * 300, "y" * 250, None)
    assert len(out["address_line"]) == 200 and len(out["landmark"]) == 200


# ---------- API ----------

@pytest.fixture(scope="module")
def client():
    import main

    return TestClient(main.app)


@pytest.fixture
def offline_classifier(monkeypatch):
    # Gemini path with no key -> the built-in mock result: no model download, no network.
    import ai_pipeline

    monkeypatch.setenv("CLASSIFIER", "gemini")
    monkeypatch.setattr(ai_pipeline, "GEMINI_API_KEY", "")


def wait_result(client, task_id):
    for _ in range(50):
        s = client.get(f"/api/status/{task_id}").json()
        if s["status"] != "processing":
            return s
        time.sleep(0.1)
    raise AssertionError("task did not finish")


def test_text_submission_stores_location(client, offline_classifier):
    r = client.post("/api/submit-text", data={
        "text": "garbage not collected for a week", "location": "Rohini",
        "latitude": "28.71", "longitude": "77.12", "address_line": "H 12", "landmark": "Near park", "pincode": "110085",
    })
    assert r.status_code == 200
    s = wait_result(client, r.json()["task_id"])
    assert s["status"] == "success", s
    gid = s["ai_result"]["id"]

    row = next(g for g in client.get("/api/grievances").json() if g["id"] == gid)
    assert (row["latitude"], row["longitude"]) == (28.71, 77.12)
    assert (row["address_line"], row["landmark"], row["pincode"], row["location"]) == ("H 12", "Near park", "110085", "Rohini")


def test_text_submission_half_pair_is_400(client, offline_classifier):
    r = client.post("/api/submit-text", data={"text": "no water", "location": "Rohini", "latitude": "28.71"})
    assert r.status_code == 400
