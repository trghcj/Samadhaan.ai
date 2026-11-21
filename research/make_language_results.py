"""Per-language results for the routing methods (read-only: reuses compare_methods.py and conformal.py unchanged).

Run from the repo root with the five 40-epoch run folders that also hold probs_mc_calibration.csv:
    python research/make_language_results.py <run1> <run2> <run3> <run4> <run5>
Writes research/results/per_language_routing.csv, per_language_coverage.csv and per_language_silent.png.
Calibration rows only, 200 by-group half splits, average and spread (max - min) over the runs; the ensemble (method 4) is one result.
Silent error = auto-routed AND wrong, as a share of that language's own rows; auto share is also within the language.
"""
import argparse
import csv
import os
import textwrap

import numpy as np

import compare_methods as cm
import conformal as cf

HERE = os.path.dirname(os.path.abspath(__file__))
LANG_NAMES = {"en": "English", "hi": "Hindi", "hinglish": "Hinglish"}
ALPHAS = (0.05, 0.10, 0.20)
# Reference palette, first three categorical slots (validated for all pairs in light and dark; see the dataviz skill).
COLORS = {"en": "#2a78d6", "hi": "#eb6834", "hinglish": "#1baf7a"}
SURFACE, INK, INK_2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e3e2dd"


def routing_rows(results, n_runs, languages):
    rows = []
    for m, name in enumerate(cm.METHODS[:len(results)]):
        used = [0] if m == 3 else list(range(n_runs))  # the ensemble does not depend on one run's seed
        for lang in languages:
            row = {"method": name, "language": LANG_NAMES[lang], "n_runs": len(used)}
            for key, label in (("auto", "auto_share"), ("silent", "silent_error")):
                vals = [100 * results[m][i][f"{key}_{lang}"] for i in used]
                row[f"{label}_pct_mean"] = round(float(np.mean(vals)), 2)
                row[f"{label}_pct_spread"] = round(max(vals) - min(vals), 2) if len(used) > 1 else ""
            rows.append(row)
    return rows


def coverage_rows(run_dirs, data):
    per = {a: [] for a in ALPHAS}
    for run in run_dirs:
        probs, y, langs, groups = cf.load_run(run, "calibration", data)
        for a in ALPHAS:
            per[a].append(cf.calibration_only_eval(probs, y, langs, groups, a))
    rows = []
    for a in ALPHAS:
        for key, label in [("coverage", "Overall")] + [(f"cov_{k}", v) for k, v in LANG_NAMES.items()]:
            vals = [100 * r[key] for r in per[a]]
            rows.append({"alpha": a, "language": label, "target_pct": round(100 * (1 - a), 1), "n_runs": len(vals),
                         "coverage_pct_mean": round(float(np.mean(vals)), 2), "coverage_pct_spread": round(max(vals) - min(vals), 2)})
    return rows


def write_csv(path, rows):
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def chart(results, n_runs, languages, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.rcParams.update({"font.family": "DejaVu Sans", "text.color": INK, "axes.labelcolor": INK_2,
                         "xtick.color": INK_2, "ytick.color": INK_2})
    methods = cm.METHODS[:len(results)]
    fig, ax = plt.subplots(figsize=(11.5, 5.8), dpi=160, facecolor=SURFACE)
    ax.set_facecolor(SURFACE)
    width, x = 0.17, np.arange(len(methods))
    for j, lang in enumerate(languages):
        means, lows, highs = [], [], []
        for m in range(len(methods)):
            used = [0] if m == 3 else list(range(n_runs))
            vals = [100 * results[m][i][f"silent_{lang}"] for i in used]
            means.append(np.mean(vals)); lows.append(min(vals)); highs.append(max(vals))
        pos = x + (j - 1) * (width + 0.015)  # the small gap between neighbouring bars is surface colour
        ax.bar(pos, means, width, color=COLORS[lang], label=LANG_NAMES[lang], zorder=3, linewidth=0)
        err = [[m_ - l_ for m_, l_ in zip(means, lows)], [h_ - m_ for m_, h_ in zip(means, highs)]]
        ax.errorbar(pos, means, yerr=err, fmt="none", ecolor=INK_2, elinewidth=1, capsize=3, zorder=4)
        if lang == "hinglish":  # the aqua bars are below 3:1 contrast on this surface, so they carry visible value labels
            for p, m_, h_ in zip(pos, means, highs):
                ax.text(p, h_ + 0.35, f"{m_:.1f}", ha="center", va="bottom", fontsize=8, color=INK)
    ax.axhline(5, color=INK_2, linewidth=1, zorder=2)
    ax.text(-0.45, 5.25, "5% target", ha="left", va="bottom", fontsize=9, color=INK_2)
    ax.set_xticks(x)
    ax.set_xticklabels([textwrap.fill(m_, 17) for m_ in methods], fontsize=9)
    ax.set_ylabel("Silent errors, % of that language's complaints")
    ax.set_ylim(0, 17.5)
    ax.yaxis.grid(True, color=GRID, linewidth=1, zorder=0)
    ax.set_axisbelow(True)
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    ax.tick_params(axis="both", length=0)
    leg = fig.legend(loc="upper right", bbox_to_anchor=(0.98, 0.885), frameon=False, ncol=3, fontsize=10)
    for t in leg.get_texts():
        t.set_color(INK)
    fig.text(0.07, 0.965, "Silent errors by language: Hinglish is the weak spot for every routing method", fontsize=13, fontweight="bold", ha="left", va="top", color=INK)
    fig.text(0.07, 0.915, f"Calibration rows, 200 by-group half splits; bar = average over {n_runs} seeds, line = lowest to highest seed (ensemble: one result).",
             fontsize=9, ha="left", va="top", color=INK_2)
    fig.subplots_adjust(left=0.07, right=0.98, top=0.81, bottom=0.17)
    fig.savefig(path, facecolor=SURFACE)
    plt.close(fig)


def check(routing, coverage):
    """Compare with the figures quoted so far: Hinglish 11-13% vs English 2-3% silent error; alpha 0.10 coverage 92.4 / 89.2 / 81.1."""
    print("\nChecks against the quoted figures")
    for lang, lo, hi in (("English", 2, 3), ("Hinglish", 11, 13)):
        vals = {r["method"]: r["silent_error_pct_mean"] for r in routing if r["language"] == lang}
        out = {k: v for k, v in vals.items() if not (lo <= v <= hi)}
        print(f"  {lang} silent error expected {lo}-{hi}%: range {min(vals.values()):.1f}-{max(vals.values()):.1f}%"
              + (f"  MISMATCH (strictly outside {lo}-{hi}%): " + ", ".join(f"{k} {v:.1f}%" for k, v in out.items()) if out else "  OK"))
    for lang, want in (("English", 92.4), ("Hindi", 89.2), ("Hinglish", 81.1)):
        got = next(r["coverage_pct_mean"] for r in coverage if r["alpha"] == 0.10 and r["language"] == lang)
        print(f"  coverage at alpha 0.10, {lang}: expected {want}, got {got:.1f}" + ("  OK" if abs(got - want) < 0.05 else "  MISMATCH"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dirs", nargs="+")
    ap.add_argument("--data", default=os.path.join(os.path.dirname(HERE), "data", "complaints.csv"))
    ap.add_argument("--out", default=os.path.join(HERE, "results"))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    results = cm.compare(args.run_dirs, args.data)
    if len(results) != 6:
        raise SystemExit("all run folders need probs_mc_calibration.csv for method 6")
    n_runs = len(args.run_dirs)
    languages = ["en", "hi", "hinglish"]
    routing = routing_rows(results, n_runs, languages)
    coverage = coverage_rows(args.run_dirs, args.data)
    write_csv(os.path.join(args.out, "per_language_routing.csv"), routing)
    write_csv(os.path.join(args.out, "per_language_coverage.csv"), coverage)
    chart(results, n_runs, languages, os.path.join(args.out, "per_language_silent.png"))
    print("saved per_language_routing.csv, per_language_coverage.csv, per_language_silent.png in", args.out)
    for r in routing:
        print(f"  {r['method']:<32}{r['language']:<9} auto {r['auto_share_pct_mean']:5.1f} ({r['auto_share_pct_spread']})  silent {r['silent_error_pct_mean']:5.1f} ({r['silent_error_pct_spread']})")
    for r in coverage:
        print(f"  alpha {r['alpha']:.2f} {r['language']:<9} coverage {r['coverage_pct_mean']:5.1f} (spread {r['coverage_pct_spread']})  target {r['target_pct']}")
    check(routing, coverage)


if __name__ == "__main__":
    main()
