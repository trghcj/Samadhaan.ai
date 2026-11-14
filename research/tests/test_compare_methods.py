"""Checks research/compare_methods.py. Run from the repo root:  python research/tests/test_compare_methods.py
Synthetic numbers plus the CALIBRATION file of the committed final_e40 run. Test rows are never read. Nothing is written."""
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "research"))
import compare_methods as cm  # noqa: E402
import conformal as cf  # noqa: E402

RUN = os.path.join(ROOT, "research", "outputs", "final_e40")
DATA = os.path.join(ROOT, "data", "complaints.csv")


def test_threshold_rule_and_risk_correction():
    n = 40  # confidences 0.60 ... 0.99; the 3 lowest-confidence rows are wrong
    conf = np.linspace(0.60, 0.99, n)
    ok = np.ones(n, dtype=bool)
    ok[:3] = False
    t = cm.pick_threshold(conf, ok)                   # wrong/40 <= 5% -> at most 2 wrong rows above the threshold
    assert abs(t - conf[1]) < 1e-9
    tc = cm.pick_threshold(conf, ok, corrected=True)  # (wrong+1)/41 <= 5% -> at most 1 wrong row above the threshold
    assert abs(tc - conf[2]) < 1e-9 and tc > t
    assert cm.pick_threshold(np.array([0.5, 0.5]), np.array([False, False])) == float("inf")


def test_method_4_equals_method_1_when_runs_are_identical():
    res = cm.compare([RUN, RUN], DATA, n_splits=6)
    for k in ("accuracy", "ece", "auto", "silent", "over5"):
        assert abs(res[3][0][k] - res[0][0][k]) < 1e-12, k  # an ensemble of identical runs is the raw softmax


def test_risk_correction_is_never_less_strict():
    res = cm.compare([RUN], DATA, n_splits=20)
    assert res[2][0]["auto"] <= res[0][0]["auto"] + 1e-12
    assert res[2][0]["silent"] <= res[0][0]["silent"] + 1e-12


def test_conformal_row_matches_conformal_py_and_shares_add_up():
    probs, y, langs, groups = cf.load_run(RUN, "calibration", DATA)
    ref = cf.calibration_only_eval(probs, y, langs, groups, 0.10, seed=0)
    res = cm.compare([RUN], DATA, n_splits=cf.N_SPLITS)[4][0]
    assert abs(res["auto"] - ref["auto"]) < 1e-9 and abs(res["silent"] - ref["silent"]) < 1e-9
    assert abs(res["auto"] + res["ask"] + res["human"] - 1) < 1e-9


def test_summary_spread():
    fake = {m: {i: {"x": float(i)} for i in range(5)} for m in range(5)}
    s = cm.summarise(fake, 5)
    assert s[0]["x"] == (2.0, 4.0) and s[3]["x"] == (0.0, 0.0)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok  ", name)
