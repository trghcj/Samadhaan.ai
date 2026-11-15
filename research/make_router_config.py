"""Build router_config.json: the frozen routing settings the app reads.

Run from the repo root:  python research/make_router_config.py [run_dir]     (default research/outputs/final_e40)

Uses ALL calibration rows of the run (probs_calibration.csv); the test rows are never read. It computes
  t_high  lowest confidence threshold satisfying the risk-corrected rule (wrong_auto + 1) / (n + 1) <= 5%
  qhat    split-conformal quantile at alpha = 0.10 (conformal.fit_qhat)
  score_map  confidence -> estimated chance of being right, as in calibration_report.py (5 equal-count bins, +1/+2 smoothing)
and writes router_config.json next to the probabilities. It does not touch thresholds.json (the old backup).
Routing in the app (backend/muril_classifier.py):
  confidence >= t_high                      -> High   : route automatically
  else conformal set (prob >= 1 - qhat):
      size 2 or 3                           -> Medium : ask the citizen to pick from the set
      any other size                        -> Low    : send to a human with the top 3
"""
import argparse
import json
import os

import numpy as np

from calibration_report import N_BINS, reliability
from compare_methods import TARGET, pick_threshold
from conformal import fit_qhat, load_run

ALPHA = 0.10
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)


def build_config(run_dir, data_path):
    probs, labels, _, _ = load_run(run_dir, "calibration", data_path)
    n = len(labels)
    conf = probs.max(axis=1)
    ok = probs.argmax(axis=1) == labels

    t_high = pick_threshold(conf, ok, corrected=True)
    if not np.isfinite(t_high):
        raise SystemExit("no threshold satisfies the risk-corrected rule on these calibration rows")
    wrong_auto = int(((conf >= t_high) & ~ok).sum())
    qhat = fit_qhat(probs, labels, ALPHA)
    if not np.isfinite(qhat):
        raise SystemExit("qhat is infinite: too few calibration rows for this alpha")

    bins, _ = reliability(conf, ok, N_BINS)
    score_map = [{"max_conf": float(hi), "est_accuracy": float((a * k + 1) / (k + 2))} for _, hi, _, a, k in bins]

    rel_run = os.path.relpath(os.path.abspath(run_dir), REPO).replace(os.sep, "/")
    return {
        "model_dir": f"{rel_run}/model",
        "t_high": float(t_high),
        "qhat": float(qhat),
        "alpha": ALPHA,
        "target_silent_error": TARGET,
        "rule": "t_high = lowest threshold with (wrong_auto + 1) / (n + 1) <= target on the calibration rows",
        "calibrated_on": f"all {n} calibration rows of {rel_run}",
        "n_calibration": n,
        "calibration_wrong_auto": wrong_auto,
        "calibration_auto_share": float((conf >= t_high).mean()),
        "score_map": score_map,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", nargs="?", default=os.path.join(HERE, "outputs", "final_e40"))
    ap.add_argument("--data", default=os.path.join(REPO, "data", "complaints.csv"))
    ap.add_argument("--force", action="store_true", help="overwrite an existing router_config.json")
    args = ap.parse_args()

    path = os.path.join(args.run_dir, "router_config.json")
    if os.path.exists(path) and not args.force:
        raise SystemExit(f"{path} already exists (the config is frozen); pass --force to rebuild it")
    config = build_config(args.run_dir, args.data)
    with open(path, "w") as f:
        json.dump(config, f, indent=2)
    print(f"saved {path}")
    print(f"  t_high = {config['t_high']:.6f}  ({config['calibration_wrong_auto']} wrong among "
          f"{config['calibration_auto_share']:.1%} auto-routed calibration rows)")
    print(f"  qhat   = {config['qhat']:.6f}  (alpha {ALPHA})")


if __name__ == "__main__":
    main()
