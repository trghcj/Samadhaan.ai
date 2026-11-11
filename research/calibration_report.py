"""Honesty check and routing thresholds from MuRIL's saved probabilities.

Run from the repo root:  python research/calibration_report.py

1. Reliability table on the CALIBRATION rows: when the model says X, how often is it right?
2. Picks the High / Low confidence lines on the CALIBRATION rows only.
3. Applies those lines, unchanged, to the TEST rows and reports what happens.
4. Saves thresholds.json (for the app) and tradeoff.png (coverage vs silent errors).

Silent error = a complaint that was routed automatically AND was wrong,
as a share of ALL complaints (not only the routed ones).
"""
import csv
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "outputs", "muril")
TARGET_SILENT_ERROR = 0.05
N_BINS = 5


def load(split):
    with open(os.path.join(OUT, f"probs_{split}.csv"), encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    conf = np.array([float(r["confidence"]) for r in rows])
    correct = np.array([r["true"] == r["pred"] for r in rows])
    return conf, correct


def reliability(conf, correct, n_bins):
    """Equal-count bins, because MuRIL's confidences are bunched in a narrow range."""
    order = np.argsort(conf)
    out = []
    for idx in np.array_split(order, n_bins):
        out.append((conf[idx].min(), conf[idx].max(), conf[idx].mean(), correct[idx].mean(), len(idx)))
    ece = sum(n * abs(c - a) for _, _, c, a, n in out) / len(conf)
    return out, ece


def pick_thresholds(conf, correct):
    """t_high: lowest line whose auto-routed complaints keep silent error <= target.
    t_low: below this, the model is right <= 50% of the time, so a human should look."""
    n = len(conf)
    t_high = None
    for t in np.unique(conf):  # ascending, so the first hit has the most coverage
        routed = conf >= t
        if (routed & ~correct).sum() / n <= TARGET_SILENT_ERROR:
            t_high = float(t)
            break
    if t_high is None:
        t_high = float(conf.max()) + 1e-9  # nothing is safe to auto-route
    t_low = float(conf.min())
    for t in np.unique(conf):
        below = conf < t
        if below.sum() >= 5 and correct[below].mean() <= 0.5:
            t_low = float(t)
    return t_high, min(t_low, t_high)


def apply(conf, correct, t_high, t_low):
    n = len(conf)
    auto = conf >= t_high
    low = conf < t_low
    medium = ~auto & ~low
    return {
        "auto_share": auto.sum() / n,
        "medium_share": medium.sum() / n,
        "low_share": low.sum() / n,
        "silent_error": (auto & ~correct).sum() / n,
        "error_among_auto": (~correct[auto]).mean() if auto.any() else float("nan"),
        "accuracy_overall": correct.mean(),
    }


def show_reliability(title, conf, correct):
    bins, ece = reliability(conf, correct, N_BINS)
    print(f"\n{title}")
    print(f"{'model says':>16} | {'avg says':>8} | {'actually right':>14} | n")
    for lo, hi, c, a, n in bins:
        print(f"{lo:6.1%} - {hi:6.1%} | {c:8.1%} | {a:14.1%} | {n}")
    print(f"ECE (gap between 'says' and 'right', lower is better): {ece:.3f}")
    return ece


def main():
    cal_conf, cal_ok = load("calibration")
    test_conf, test_ok = load("test")

    ece_cal = show_reliability("CALIBRATION rows: is the confidence honest?", cal_conf, cal_ok)
    show_reliability("TEST rows (same check, rows never used to set anything)", test_conf, test_ok)

    t_high, t_low = pick_thresholds(cal_conf, cal_ok)
    print(f"\nLines chosen on calibration rows (target silent error <= {TARGET_SILENT_ERROR:.0%}):")
    print(f"  High   : confidence >= {t_high:.3f}  -> route automatically")
    print(f"  Medium : {t_low:.3f} <= confidence < {t_high:.3f}  -> ask the citizen one question")
    print(f"  Low    : confidence < {t_low:.3f}  -> send to a human with top 2-3 departments")

    for name, conf, ok in (("CALIBRATION", cal_conf, cal_ok), ("TEST", test_conf, test_ok)):
        r = apply(conf, ok, t_high, t_low)
        print(f"\nApplying the lines to {name} rows:")
        print(f"  handled automatically : {r['auto_share']:.1%}")
        print(f"  asked a question      : {r['medium_share']:.1%}")
        print(f"  sent to a human       : {r['low_share']:.1%}")
        print(f"  silent wrong routing  : {r['silent_error']:.1%} of all complaints")
        print(f"  wrong among auto-routed: {r['error_among_auto']:.1%}")
        print(f"  plain accuracy (no routing): {r['accuracy_overall']:.1%}")

    # Maps raw confidence -> "estimated chance this routing is right" (the calibration hit rate,
    # smoothed with +1/+2 so a bin that was 25/25 right is not reported as 100%).
    cal_bins, _ = reliability(cal_conf, cal_ok, N_BINS)
    score_map = [{"max_conf": float(hi), "est_accuracy": float((a * n + 1) / (n + 2))} for _, hi, _, a, n in cal_bins]

    with open(os.path.join(OUT, "thresholds.json"), "w") as f:
        json.dump({"t_high": t_high, "t_low": t_low, "target_silent_error": TARGET_SILENT_ERROR,
                   "calibrated_on": "calibration split", "ece_calibration": ece_cal,
                   "score_map": score_map}, f, indent=2)

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(6, 4))
    for name, conf, ok, style in (("calibration", cal_conf, cal_ok, "-"), ("test", test_conf, test_ok, "--")):
        ts = np.unique(conf)
        cov = [(conf >= t).mean() for t in ts]
        err = [((conf >= t) & ~ok).sum() / len(conf) for t in ts]
        ax.plot([c * 100 for c in cov], [e * 100 for e in err], style, label=name)
    ax.axhline(TARGET_SILENT_ERROR * 100, color="grey", linewidth=0.8)
    ax.set_xlabel("Complaints handled automatically (%)")
    ax.set_ylabel("Silent wrong routing (% of all complaints)")
    ax.set_title("Trade-off: automation vs silent errors")
    ax.legend()
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "tradeoff.png"), dpi=150)
    print(f"\nSaved {os.path.join(OUT, 'thresholds.json')} and tradeoff.png")


if __name__ == "__main__":
    main()
