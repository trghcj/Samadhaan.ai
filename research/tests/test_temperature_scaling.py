"""Checks research/temperature_scaling.py on the committed 40-epoch run (research/outputs/final_e40, seed 42).

Run from the repo root:  python research/tests/test_temperature_scaling.py   (or: python -m pytest research/tests)
Nothing is written: the run folder must be unchanged afterwards.
"""
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "research"))
import temperature_scaling as ts  # noqa: E402

RUN = os.path.join(ROOT, "research", "outputs", "final_e40")


def _run(*extra):
    sys.argv = ["temperature_scaling.py", RUN, *extra]
    ts.main()


def test_fit_matches_known_values():
    probs, labels = ts.load_probs(RUN, "calibration")
    t = ts.fit_temperature(probs, labels)
    assert abs(t - 1.1313) < 0.005, t
    before = ts.ece_of(probs, labels)[0]
    after = ts.ece_of(ts.apply_temperature(probs, t), labels)[0]
    assert abs(before - 0.1073) < 0.0005 and abs(after - 0.0905) < 0.0005, (before, after)


def test_temperature_one_changes_nothing():
    probs, _ = ts.load_probs(RUN, "calibration")
    assert np.allclose(ts.apply_temperature(probs, 1.0), probs, atol=1e-5)


def test_invalid_temperature_is_refused():
    original = ts.fit_temperature
    try:
        ts.fit_temperature = lambda p, l: -1.0
        try:
            _run()
        except SystemExit as e:
            assert "finite float > 0" in str(e)
        else:
            raise AssertionError("a negative T was accepted")
    finally:
        ts.fit_temperature = original


def test_run_folder_untouched():
    before = sorted(os.listdir(RUN))
    _run()
    _run("--report_test")
    assert sorted(os.listdir(RUN)) == before


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok  ", name)
