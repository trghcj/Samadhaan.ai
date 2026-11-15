"""Routing rule (router_config.json) and the citizen clarification endpoint.

Routing: confidence >= t_high -> High (auto); else conformal set (prob >= 1 - qhat): size 2 or 3 -> Medium (ask),
any other size -> Low (human, top 3). The clarify endpoint works on a throw-away SQLite database (see conftest.py).
"""
import csv
import json
import os

import numpy as np
import pytest
from fastapi.testclient import TestClient

import muril_classifier as mc

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RUN = os.path.join(REPO, "research", "outputs", "final_e40")
CFG = {"t_high": 0.90, "qhat": 0.70, "score_map": [{"max_conf": 1.0, "est_accuracy": 0.9}]}  # set = probs >= 0.30


def probs(*top):
    """7 class probabilities from the first values given; the remainder is spread over the other classes."""
    rest = (1 - sum(top)) / (7 - len(top))
    return np.array(list(top) + [rest] * (7 - len(top)))


# ---------- the rule ----------
def test_high_when_confidence_reaches_t_high():
    r = mc.build_result(probs(0.93), CFG)
    assert (r["confidence_level"], r["route"], r["prediction_set"]) == ("High", "auto", "Water")
    assert "options" not in r


def test_medium_when_two_or_three_classes_are_in_the_set():
    two = mc.build_result(probs(0.55, 0.35), CFG)
    assert (two["confidence_level"], two["route"], two["set_size"]) == ("Medium", "ask", 2)
    assert two["options"] == ["Water", "Electricity"] and two["alternative_departments"] == "Water, Electricity"
    assert two["clarifying_question"]
    three = mc.build_result(probs(0.40, 0.31, 0.30), CFG)
    assert three["confidence_level"] == "Medium" and three["options"] == ["Water", "Electricity", "Roads"]


def test_low_when_set_size_is_one_zero_or_four_plus_and_gives_top_three():
    one = mc.build_result(probs(0.80), CFG)            # sure-ish, but below t_high and alone in the set -> human
    assert (one["confidence_level"], one["route"], one["set_size"]) == ("Low", "human", 1)
    assert one["alternative_departments"].count(",") == 2 and "options" not in one
    none = mc.build_result(np.full(7, 1 / 7), CFG)     # every class has 0.143 < 0.30 -> empty set
    assert (none["confidence_level"], none["set_size"]) == ("Low", 0)
    four = mc.build_result(np.array([0.30, 0.30, 0.30, 0.30, 0.0, 0.0, 0.0]) / 1.2, {**CFG, "qhat": 0.80})  # set = probs >= 0.2
    assert (four["confidence_level"], four["set_size"]) == ("Low", 4)
    assert len(four["top3"]) == 3


def test_t_high_beats_the_set_size():
    r = mc.build_result(probs(0.95, 0.04), CFG)        # also has set size 1, but above t_high
    assert r["confidence_level"] == "High"
    r2 = mc.build_result(probs(0.50, 0.45), {**CFG, "t_high": 0.40})
    assert r2["confidence_level"] == "High"            # two classes in the set, still High because conf >= t_high


# ---------- the frozen config ----------
def test_router_config_follows_the_stated_rule():
    cfg = mc.read_config(os.path.join(RUN, "router_config.json"))
    assert cfg["model_dir"] == "research/outputs/final_e40/model" and cfg["alpha"] == 0.10
    with open(os.path.join(RUN, "probs_calibration.csv"), encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    conf = np.array([float(r["confidence"]) for r in rows])
    ok = np.array([r["true"] == r["pred"] for r in rows])
    n = len(rows)
    assert cfg["n_calibration"] == n == 126
    auto = conf >= cfg["t_high"]
    assert ((auto & ~ok).sum() + 1) / (n + 1) <= 0.05                       # risk-corrected rule holds at t_high
    lower = conf[conf < cfg["t_high"]]
    assert ((conf >= lower.max()) & ~ok).sum() + 1 > 0.05 * (n + 1)         # and the next lower threshold would break it
    scores = np.sort(1 - np.array([float(r[f"p_{r['true']}"]) for r in rows]))
    k = int(np.ceil((n + 1) * 0.90))
    assert abs(cfg["qhat"] - scores[k - 1]) < 1e-6                          # conformal quantile at alpha 0.10


def test_missing_config_means_not_available(monkeypatch, tmp_path):
    monkeypatch.setattr(mc, "CONFIG_PATH", str(tmp_path / "nope.json"))
    assert mc.is_available() is False and mc.classify("paani nahi aa raha") is None


@pytest.mark.skipif(not mc.is_available(), reason="final_e40 model weights not on this machine")
def test_real_model_reproduces_saved_probabilities():
    with open(os.path.join(REPO, "data", "complaints.csv"), encoding="utf-8-sig", newline="") as f:
        text = {r["id"]: r["text"] for r in csv.DictReader(f)}
    with open(os.path.join(RUN, "probs_calibration.csv"), encoding="utf-8-sig", newline="") as f:
        row = next(csv.DictReader(f))
    r = mc.classify(text[row["id"]])
    assert r is not None and r["prediction_set"] == row["pred"]
    assert abs(r["raw_confidence"] - float(row["confidence"])) < 0.01


# ---------- clarify endpoint ----------
@pytest.fixture(scope="module")
def client():
    import main

    return TestClient(main.app)


def make_grievance(alt="Water, Drainage", question="Which department?", confidence="Medium"):
    from database import SessionLocal
    import models

    db = SessionLocal()
    g = models.Grievance(transcript="paani aur naali", prediction="Water", confidence=confidence, confidence_score=0.7,
                         clarifying_question=question, alternative_departments=alt)
    db.add(g)
    db.commit()
    gid = g.id
    db.close()
    return gid


def fetch(gid):
    from database import SessionLocal
    import models

    db = SessionLocal()
    g = db.query(models.Grievance).filter(models.Grievance.id == gid).first()
    out = {k: getattr(g, k) for k in ("prediction", "confidence", "clarifying_question", "transcript")}
    db.close()
    return out


def test_picked_department_becomes_the_prediction_and_is_marked_confirmed(client):
    gid = make_grievance()
    r = client.patch(f"/api/grievances/{gid}/clarify", json={"choice": "Drainage"})
    assert r.status_code == 200 and r.json()["outcome"] == "confirmed"
    g = fetch(gid)
    assert g["prediction"] == "Drainage" and g["confidence"] == "Confirmed by citizen"
    assert g["clarifying_question"] is None and "chose Drainage" in g["transcript"]


def test_none_of_these_goes_to_human_review_and_is_never_marked_high(client):
    gid = make_grievance()
    r = client.patch(f"/api/grievances/{gid}/clarify", json={"choice": "none_of_these"})
    assert r.status_code == 200 and r.json()["outcome"] == "human_review"
    g = fetch(gid)
    assert g["confidence"] == "Low" and g["prediction"] == "Water" and g["clarifying_question"] is None
    assert "none of the offered" in g["transcript"]


def test_department_that_was_not_offered_is_refused_and_nothing_changes(client):
    gid = make_grievance(alt="Water, Drainage")
    r = client.patch(f"/api/grievances/{gid}/clarify", json={"choice": "Roads"})
    assert r.status_code == 400
    g = fetch(gid)
    assert g["prediction"] == "Water" and g["confidence"] == "Medium" and g["clarifying_question"]


def test_free_text_answer_is_no_longer_accepted(client):
    gid = make_grievance()
    assert client.patch(f"/api/grievances/{gid}/clarify", json={"answer": "it is a drain"}).status_code == 422


def test_unknown_grievance_and_not_waiting_grievance(client):
    assert client.patch("/api/grievances/999999/clarify", json={"choice": "Water"}).status_code == 404
    gid = make_grievance(question=None, confidence="High")
    assert client.patch(f"/api/grievances/{gid}/clarify", json={"choice": "Water"}).status_code == 409
    assert fetch(gid)["confidence"] == "High"


def test_without_stored_options_any_real_department_can_be_picked(client):
    gid = make_grievance(alt=None)                      # e.g. the Gemini fallback, which stores no options
    assert client.patch(f"/api/grievances/{gid}/clarify", json={"choice": "Roads"}).status_code == 200
    assert client.patch(f"/api/grievances/{make_grievance(alt=None)}/clarify", json={"choice": "Nonsense"}).status_code == 400


def test_router_config_json_is_valid_json():
    with open(os.path.join(RUN, "router_config.json")) as f:
        assert {"model_dir", "t_high", "qhat", "score_map"} <= set(json.load(f))
