"""Checks research/conformal.py. Run from the repo root:  python research/tests/test_conformal.py  (or python -m pytest research/tests)
Uses synthetic numbers plus the CALIBRATION file of the committed final_e40 run. Test rows are never read. Nothing is written."""
import os
import random
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "research"))
import conformal as cf  # noqa: E402


def test_qhat_rank():
    # scores 1 - p(true) = 0.0 ... 0.9 for 10 rows (true class is class 0 in every row)
    p = np.zeros((10, 7)); p[:, 0] = 1 - np.arange(10) / 10; p[:, 1] = 1 - p[:, 0]
    y = np.zeros(10, dtype=int)
    assert abs(cf.fit_qhat(p, y, 0.2) - 0.8) < 1e-9   # ceil(11*0.8)=9 -> 9th smallest score
    assert abs(cf.fit_qhat(p, y, 0.1) - 0.9) < 1e-9   # ceil(11*0.9)=10 -> largest
    assert cf.fit_qhat(p, y, 0.05) == float("inf")    # ceil(11*0.95)=11 > 10 -> too few rows


def test_set_rule_and_routing():
    p = np.array([[0.7, 0.2, 0.1, 0, 0, 0, 0], [0.4, 0.3, 0.2, 0.1, 0, 0, 0], [0.15] * 6 + [0.1], [0.5, 0.5, 0, 0, 0, 0, 0]])
    sets = cf.prediction_sets(p, qhat=0.65)            # threshold 0.35
    assert sets.sum(axis=1).tolist() == [1, 1, 0, 2]
    assert cf.route(np.array([0, 1, 2, 3, 4, 7])).tolist() == ["human", "auto", "ask", "ask", "human", "human"]
    assert cf.prediction_sets(p, float("inf")).all()   # infinite qhat -> every class


def test_halves_keep_groups_together():
    groups = np.array([f"g{i // 6}" for i in range(126)])
    rng = random.Random(1)
    for _ in range(50):
        fit, ev = cf.group_halves(groups, rng)
        assert not set(groups[fit]) & set(groups[ev])
        assert len(fit) + len(ev) == 126 and len(fit) and len(ev)


def test_coverage_on_exchangeable_data():
    rng = np.random.default_rng(0)
    n = 4000
    p = rng.dirichlet(np.ones(7) * 0.5, size=n)
    y = np.array([rng.choice(7, p=row) for row in p])  # labels drawn from the model's own probabilities
    langs = np.array(["en"] * n)
    for alpha in (0.05, 0.1, 0.2):
        q = cf.fit_qhat(p[: n // 2], y[: n // 2], alpha)
        cov = cf.evaluate(p[n // 2:], y[n // 2:], langs[n // 2:], q)["coverage"]
        assert cov >= 1 - alpha - 0.03, (alpha, cov)


def test_real_calibration_runs_and_is_reproducible():
    run = os.path.join(ROOT, "research", "outputs", "final_e40")
    before = sorted(os.listdir(run))
    probs, y, langs, groups = cf.load_run(run, "calibration", os.path.join(ROOT, "data", "complaints.csv"))
    assert probs.shape == (126, 7) and len(set(groups)) == 21
    a = cf.calibration_only_eval(probs, y, langs, groups, 0.10)
    assert a == cf.calibration_only_eval(probs, y, langs, groups, 0.10)
    assert abs(a["auto"] + a["ask"] + a["human"] - 1) < 1e-9 and 0 <= a["silent"] <= a["auto"]
    assert sorted(os.listdir(run)) == before


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok  ", name)
