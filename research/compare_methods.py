"""Compare five ways of deciding what to route automatically, under ONE protocol (read-only, writes nothing).

Run from the repo root (give the five 40-epoch run folders):
    python research/compare_methods.py <run1> <run2> <run3> <run4> <run5>

Protocol, the same as conformal.py for every method: the CALIBRATION rows are split into two halves BY GROUP
(200 random splits, the same splits for every method and run); the method is fitted on one half and evaluated on the
other; results are averaged over the splits. Test rows are never read. Then average and spread (max - min) over runs.

Methods
  1 raw softmax + threshold       lowest threshold whose silent error on the fitting half is <= 5%
  2 temperature scaling + same    T fitted on the fitting half (temperature_scaling.fit_temperature), same rule
  3 method 1 with risk correction require (wrong_auto + 1) / (n + 1) <= 5% on the fitting half
  4 ensemble                      average the probabilities of all given runs, then the rule of method 1 (one result)
  5 conformal sets, alpha 0.10    conformal.py: set size 1 -> auto; 2 or 3 -> ask; 0 or >= 4 -> human
Silent error = auto-routed AND wrong, as a share of ALL evaluated rows. ECE (5 equal-count bins) and accuracy are those
of the probabilities the method uses (raw, scaled, or averaged). "splits >5%" = share of the splits whose held-out
silent error exceeded 5%.
"""
import argparse
import csv
import random

import numpy as np

import conformal as cf
from temperature_scaling import apply_temperature, ece_of, fit_temperature

TARGET = 0.05
ALPHA = 0.10
METHODS = ["1 raw softmax + threshold", "2 temperature + threshold", "3 threshold, risk-corrected",
           "4 ensemble + threshold", "5 conformal sets (alpha 0.10)"]


def pick_threshold(conf, ok, corrected=False):
    """Lowest confidence threshold whose silent error on these rows is <= 5% (inf = route nothing automatically)."""
    n = len(conf)
    for t in np.unique(conf):  # ascending
        wrong_auto = int(((conf >= t) & ~ok).sum())
        risk = (wrong_auto + 1) / (n + 1) if corrected else wrong_auto / n
        if risk <= TARGET + 1e-12:
            return float(t)
    return float("inf")


def score(probs, labels, langs, auto, extra=None):
    """Metrics on the held-out rows, given which rows were auto-routed."""
    pred = probs.argmax(axis=1)
    ece, acc, _ = ece_of(probs, labels)
    wrong_auto = auto & (pred != labels)
    out = {"accuracy": acc, "ece": ece, "auto": auto.mean(), "silent": wrong_auto.mean(),
           "over5": float(wrong_auto.mean() > TARGET)}
    for lang in sorted(set(langs)):
        m = langs == lang
        out[f"auto_{lang}"] = auto[m].mean()
        out[f"silent_{lang}"] = wrong_auto[m].mean()
    out.update(extra or {})
    return out


def threshold_method(fit_p, fit_y, ev_p, ev_y, ev_l, corrected):
    ok = fit_p.argmax(axis=1) == fit_y
    t = pick_threshold(fit_p.max(axis=1), ok, corrected)
    return score(ev_p, ev_y, ev_l, ev_p.max(axis=1) >= t)


def run_methods(fit_idx, ev_idx, p, y, l, ens):
    """All five methods for one run on one split. p = this run's probs, ens = averaged probs of all runs."""
    fp, fy, ep, ey, el = p[fit_idx], y[fit_idx], p[ev_idx], y[ev_idx], l[ev_idx]
    res = [threshold_method(fp, fy, ep, ey, el, False)]
    t_fit = fit_temperature(fp, fy)
    res.append(threshold_method(apply_temperature(fp, t_fit), fy, apply_temperature(ep, t_fit), ey, el, False))
    res.append(threshold_method(fp, fy, ep, ey, el, True))
    res.append(threshold_method(ens[fit_idx], fy, ens[ev_idx], ey, el, False))
    qhat = cf.fit_qhat(fp, fy, ALPHA)
    where = cf.route(cf.prediction_sets(ep, qhat).sum(axis=1))
    res.append(score(ep, ey, el, where == "auto", {"ask": (where == "ask").mean(), "human": (where == "human").mean()}))
    return res


def read_ids(run_dir):
    with open(f"{run_dir}/probs_calibration.csv", encoding="utf-8-sig", newline="") as f:
        return [r["id"] for r in csv.DictReader(f)]


def compare(run_dirs, data_path, n_splits=cf.N_SPLITS, seed=0):
    """Returns {method index: {run index: {metric: mean over splits}}}; method 4 (index 3) uses the ensemble."""
    runs = [cf.load_run(r, "calibration", data_path) for r in run_dirs]
    ids = read_ids(run_dirs[0])
    for r in run_dirs[1:]:
        if read_ids(r) != ids:
            raise SystemExit(f"{r} has different calibration rows or order; cannot average probabilities")
    ens = np.mean([r[0] for r in runs], axis=0)
    _, y, l, groups = runs[0]
    rng = random.Random(seed)
    splits = [cf.group_halves(groups, rng) for _ in range(n_splits)]
    acc = {m: {i: [] for i in range(len(runs))} for m in range(5)}
    for fit_idx, ev_idx in splits:
        for i, run in enumerate(runs):
            for m, res in enumerate(run_methods(fit_idx, ev_idx, run[0], y, l, ens)):
                acc[m][i].append(res)
    return {m: {i: {k: float(np.mean([r[k] for r in rs])) for k in rs[0]} for i, rs in per.items()} for m, per in acc.items()}


def summarise(results, n_runs):
    """Average and spread over runs per method; method 4 is a single result (it does not depend on one run's seed)."""
    out = {}
    for m, per in results.items():
        use = [0] if m == 3 else list(range(n_runs))
        out[m] = {k: (float(np.mean([per[i][k] for i in use])), float(max(per[i][k] for i in use) - min(per[i][k] for i in use)))
                  for k in per[0]}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dirs", nargs="+")
    ap.add_argument("--data", default="data/complaints.csv")
    ap.add_argument("--splits", type=int, default=cf.N_SPLITS)
    args = ap.parse_args()
    n = len(args.run_dirs)
    s = summarise(compare(args.run_dirs, args.data, args.splits), n)

    def cell(v, pct, m):
        avg, spr = v
        txt = f"{avg:.1%}" if pct else f"{avg:.3f}"
        if m == 3:
            return txt
        return f"{txt} ({spr:.1%})" if pct else f"{txt} ({spr:.3f})"

    print(f"CALIBRATION rows only, {args.splits} by-group half splits, {n} runs: average (spread over runs). "
          f"Method 4 is one result, no spread.\n")
    print(f"{'method':<32}{'accuracy':>16}{'ECE':>16}{'auto share':>18}{'silent error':>18}{'splits >5%':>18}")
    for m, name in enumerate(METHODS):
        d = s[m]
        print(f"{name:<32}{cell(d['accuracy'], False, m):>16}{cell(d['ece'], False, m):>16}{cell(d['auto'], True, m):>18}"
              f"{cell(d['silent'], True, m):>18}{cell(d['over5'], True, m):>18}")
    c = s[4]
    print(f"\nmethod 5 also: ask {c['ask'][0]:.1%} ({c['ask'][1]:.1%}), human {c['human'][0]:.1%} ({c['human'][1]:.1%})")
    langs = sorted(k[5:] for k in s[0] if k.startswith("auto_"))
    print("\nPer language: auto share / silent error (share of that language's own rows)")
    print(f"{'method':<32}" + "".join(f"{lang:>30}" for lang in langs))
    for m, name in enumerate(METHODS):
        row = "".join(f"{cell(s[m]['auto_' + g], True, m) + ' / ' + cell(s[m]['silent_' + g], True, m):>30}" for g in langs)
        print(f"{name:<32}{row}")


if __name__ == "__main__":
    main()
