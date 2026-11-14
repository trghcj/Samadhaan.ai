"""Split conformal prediction on top of a trained run (read-only: writes nothing).

Run from the repo root:
    python research/conformal.py research/outputs/final_e40 [more run folders ...]
    python research/conformal.py research/outputs/final_e40 --final_test

Method (classification, split conformal):
  score of a calibration row = 1 - probability of its true class
  qhat  = the ceil((n+1)(1-alpha))/n quantile of those scores (infinite if that rank exceeds n)
  set   = every class with probability >= 1 - qhat
Routing from the set size:  1 -> auto-route,  2 or 3 -> ask a clarifying question,  0 or >= 4 -> human.

Default evaluation uses CALIBRATION rows only: the rows are split into two halves BY GROUP (all versions of a base
complaint stay together), qhat is fitted on one half and evaluated on the other, repeated for 200 random splits and
averaged. The probs files carry no group id, so groups are looked up in data/complaints.csv through the row id.
The test rows are read ONLY with --final_test (qhat fitted on all calibration rows, evaluated once on the test rows).
With several run folders, the average and spread (max - min) over the runs are printed too.
"""
import argparse
import csv
import math
import os
import random

import numpy as np

LABELS = ["Water", "Electricity", "Roads", "Sanitation", "Drainage", "Street Lights", "Unclear"]
ALPHAS = (0.05, 0.10, 0.20)
N_SPLITS = 200
EPS = 1e-9  # guards the comparison p >= 1 - qhat against float rounding of the stored probabilities


def load_run(run_dir, split, data_path):
    """probs (n, 7), true labels (n,), languages (n,), group ids (n,) for one split of a run folder."""
    with open(os.path.join(run_dir, f"probs_{split}.csv"), encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    with open(data_path, encoding="utf-8-sig", newline="") as f:
        group_of = {r["id"]: r["group_id"] for r in csv.DictReader(f)}
    probs = np.array([[float(r[f"p_{c}"]) for c in LABELS] for r in rows])
    labels = np.array([LABELS.index(r["true"]) for r in rows])
    langs = np.array([r["language"] for r in rows])
    groups = np.array([group_of[r["id"]] for r in rows])
    return probs, labels, langs, groups


def fit_qhat(probs, labels, alpha):
    """The ceil((n+1)(1-alpha))/n quantile of the scores 1 - p(true class); inf if there are too few rows."""
    scores = np.sort(1.0 - probs[np.arange(len(labels)), labels])
    k = math.ceil((len(scores) + 1) * (1 - alpha))
    return float("inf") if k > len(scores) else float(scores[k - 1])


def prediction_sets(probs, qhat):
    """Boolean (n, 7): class is in the set when its probability >= 1 - qhat."""
    return probs >= 1.0 - qhat - EPS


def route(set_sizes):
    """'auto' for size 1, 'ask' for size 2 or 3, 'human' for size 0 or >= 4."""
    return np.where(set_sizes == 1, "auto", np.where((set_sizes == 2) | (set_sizes == 3), "ask", "human"))


def evaluate(probs, labels, langs, qhat):
    sets = prediction_sets(probs, qhat)
    covered = sets[np.arange(len(labels)), labels]
    sizes = sets.sum(axis=1)
    where = route(sizes)
    auto_wrong = (where == "auto") & (sets.argmax(axis=1) != labels)
    out = {"coverage": covered.mean(), "set_size": sizes.mean(), "auto": (where == "auto").mean(),
           "ask": (where == "ask").mean(), "human": (where == "human").mean(), "silent": auto_wrong.mean()}
    for lang in sorted(set(langs)):
        out[f"cov_{lang}"] = covered[langs == lang].mean()
    return out


def group_halves(groups, rng):
    """Split the distinct groups into two halves; return row indices (fit, eval). Whole groups stay together."""
    ids = sorted(set(groups))
    rng.shuffle(ids)
    fit_ids = set(ids[: len(ids) // 2])
    in_fit = np.array([g in fit_ids for g in groups])
    return np.where(in_fit)[0], np.where(~in_fit)[0]


def calibration_only_eval(probs, labels, langs, groups, alpha, seed=0):
    """Average metrics over N_SPLITS random by-group half splits of the calibration rows."""
    rng = random.Random(seed)
    results = []
    for _ in range(N_SPLITS):
        fit_idx, eval_idx = group_halves(groups, rng)
        qhat = fit_qhat(probs[fit_idx], labels[fit_idx], alpha)
        results.append(evaluate(probs[eval_idx], labels[eval_idx], langs[eval_idx], qhat))
    return {k: float(np.mean([r[k] for r in results])) for k in results[0]}


METRICS = ["coverage", "set_size", "auto", "ask", "human", "silent"]


def fmt(m):
    langs = "  ".join(f"{k[4:]} {m[k]:.3f}" for k in m if k.startswith("cov_"))
    return (f"coverage {m['coverage']:.3f} (by language: {langs})  set size {m['set_size']:.2f}  "
            f"auto {m['auto']:.1%}  ask {m['ask']:.1%}  human {m['human']:.1%}  silent error {m['silent']:.1%}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dirs", nargs="+", help="run folder(s) with probs_calibration.csv (and probs_test.csv for --final_test)")
    ap.add_argument("--data", default="data/complaints.csv", help="dataset with id -> group_id (default data/complaints.csv)")
    ap.add_argument("--final_test", action="store_true",
                    help="fit qhat on ALL calibration rows and evaluate once on the test rows (use for the main model only)")
    args = ap.parse_args()

    if args.final_test:
        if len(args.run_dirs) != 1:
            raise SystemExit("--final_test takes exactly one run folder (the main model)")
        run = args.run_dirs[0]
        cal = load_run(run, "calibration", args.data)
        test = load_run(run, "test", args.data)
        print(f"TEST ROWS (n={len(test[1])}) - qhat fitted on all {len(cal[1])} calibration rows - {run}")
        for alpha in ALPHAS:
            qhat = fit_qhat(cal[0], cal[1], alpha)
            print(f"alpha {alpha:.2f}  qhat {qhat:.4f}  " + fmt(evaluate(test[0], test[1], test[2], qhat)))
        return

    per_run = {}
    for run in args.run_dirs:
        probs, labels, langs, groups = load_run(run, "calibration", args.data)
        print(f"\n{run}: CALIBRATION rows only (n={len(labels)}, {len(set(groups))} groups), "
              f"mean of {N_SPLITS} random by-group half splits")
        per_run[run] = {}
        for alpha in ALPHAS:
            per_run[run][alpha] = calibration_only_eval(probs, labels, langs, groups, alpha)
            print(f"alpha {alpha:.2f}  " + fmt(per_run[run][alpha]))

    if len(args.run_dirs) > 1:
        print(f"\nAverage and spread (max - min) over {len(args.run_dirs)} runs:")
        for alpha in ALPHAS:
            parts = []
            for k in METRICS + [k for k in per_run[args.run_dirs[0]][alpha] if k.startswith("cov_")]:
                vals = [per_run[r][alpha][k] for r in args.run_dirs]
                parts.append(f"{k} {np.mean(vals):.3f} (spread {max(vals) - min(vals):.3f})")
            print(f"alpha {alpha:.2f}  " + "  ".join(parts))


if __name__ == "__main__":
    main()
