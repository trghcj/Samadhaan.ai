"""Temperature scaling for one training run.

Run from the repo root:  python research/temperature_scaling.py research/outputs/final_e40

Reads probs_calibration.csv from the run folder, fits ONE number T on the CALIBRATION rows only, and reports the
calibration error (ECE) of the calibration rows before and after dividing the model's scores by T.
The test rows are read only with --report_test (off by default); they must never be used to fit T.
--save writes temperature.json into the run folder. This script never touches thresholds.json.

probs_*.csv hold softmax probabilities, so log(p) equals the model's scores up to a constant, which is all that
dividing by T needs. The saved probabilities have 6 decimals, so T fitted from them is approximate.
"""
import argparse
import csv
import json
import math
import os

import numpy as np

from calibration_report import N_BINS, reliability

LABELS = ["Water", "Electricity", "Roads", "Sanitation", "Drainage", "Street Lights", "Unclear"]


def load_probs(run_dir, split):
    with open(os.path.join(run_dir, f"probs_{split}.csv"), encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    probs = np.array([[float(r[f"p_{label}"]) for label in LABELS] for r in rows])
    labels = np.array([LABELS.index(r["true"]) for r in rows])
    return probs, labels


def apply_temperature(probs, temperature):
    """Softmax of (scores / T), recovered from the saved probabilities. T < 1 sharpens, T > 1 softens."""
    scores = np.log(np.clip(probs, 1e-12, 1.0)) / temperature
    scores -= scores.max(axis=1, keepdims=True)
    e = np.exp(scores)
    return e / e.sum(axis=1, keepdims=True)


def fit_temperature(probs, labels):
    """Return the single temperature T > 0 that fits the calibration rows.

    probs:  array (n_rows, 7), softmax probabilities from probs_calibration.csv
    labels: array (n_rows,), true class indices in the same row order
    Use calibration rows only. Return a float.
    """
    rows = np.arange(len(labels))
    best_t, best_nll = None, float("inf")
    for t in np.linspace(0.05, 5.0, 500):
        p = apply_temperature(probs, t)[rows, labels]
        nll = float(-np.mean(np.log(np.clip(p, 1e-12, 1.0))))
        if nll < best_nll:
            best_t, best_nll = float(t), nll
    return best_t


def ece_of(probs, labels):
    conf = probs.max(axis=1)
    ok = probs.argmax(axis=1) == labels
    _, ece = reliability(conf, ok, N_BINS)
    return float(ece), float(ok.mean()), float(conf.mean())


def report(name, probs, labels, temperature):
    before = ece_of(probs, labels)
    after = ece_of(apply_temperature(probs, temperature), labels)
    print(f"{name}: n={len(labels)}  accuracy {before[1]:.4f}  mean confidence {before[2]:.4f} -> {after[2]:.4f}  "
          f"ECE {before[0]:.4f} -> {after[0]:.4f}")
    return before[0], after[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", help="folder with probs_calibration.csv, e.g. research/outputs/final_e40")
    ap.add_argument("--report_test", action="store_true", help="also report ECE on the test rows (never used for fitting)")
    ap.add_argument("--save", action="store_true", help="write temperature.json into the run folder")
    args = ap.parse_args()

    cal_probs, cal_labels = load_probs(args.run_dir, "calibration")
    temperature = fit_temperature(cal_probs, cal_labels)
    if not (isinstance(temperature, (int, float)) and math.isfinite(temperature) and temperature > 0):
        raise SystemExit(f"fit_temperature must return a finite float > 0, got {temperature!r}")
    print(f"temperature T = {temperature:.4f}  (fitted on the calibration rows of {args.run_dir})")

    result = {"temperature": float(temperature), "fitted_on": "calibration rows only", "run_dir": args.run_dir}
    result["ece_calibration_before"], result["ece_calibration_after"] = report("calibration", cal_probs, cal_labels, temperature)
    if args.report_test:
        test_probs, test_labels = load_probs(args.run_dir, "test")
        result["ece_test_before"], result["ece_test_after"] = report("test", test_probs, test_labels, temperature)

    if args.save:
        path = os.path.join(args.run_dir, "temperature.json")
        with open(path, "w") as f:
            json.dump(result, f, indent=2)
        print("saved", path)


if __name__ == "__main__":
    main()
