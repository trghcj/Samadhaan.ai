"""MuRIL-based classifier with calibrated High / Medium / Low routing.

Used by ai_pipeline.process_audio_task when the fine-tuned model is present
(see research/train_muril.py and research/calibration_report.py). If the model
files are missing, is_available() is False and the pipeline keeps using Gemini.

Needs the heavy deps in requirements-muril.txt (torch, transformers); they are
imported lazily so the normal backend (e.g. on Render) is unaffected.
"""
import json
import os

import numpy as np

# Must match research/train_muril.py exactly (the order is the class index).
LABELS = ["Water", "Electricity", "Roads", "Sanitation", "Drainage", "Street Lights", "Unclear"]
MAX_LEN = 64

_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_OUT = os.path.join(_REPO, "research", "outputs", "muril")
MODEL_DIR = os.getenv("MURIL_MODEL_DIR", os.path.join(_OUT, "model"))
THRESHOLDS_PATH = os.getenv("MURIL_THRESHOLDS", os.path.join(_OUT, "thresholds.json"))

_state = {"tokenizer": None, "model": None, "thresholds": None, "failed": False}


def is_available():
    return (not _state["failed"]) and os.path.isdir(MODEL_DIR) and os.path.isfile(THRESHOLDS_PATH)


def level_for(conf, t_high, t_low):
    if conf >= t_high:
        return "High"
    if conf >= t_low:
        return "Medium"
    return "Low"


def estimated_accuracy(conf, score_map):
    """Calibration hit rate for this confidence, for display ('chance this routing is right')."""
    for entry in score_map:
        if conf <= entry["max_conf"]:
            return entry["est_accuracy"]
    return score_map[-1]["est_accuracy"]


def build_result(probs, thresholds):
    """Pure function: class probabilities -> the dict the rest of the pipeline expects."""
    order = np.argsort(probs)[::-1]
    top = LABELS[int(order[0])]
    conf = float(probs[order[0]])
    level = level_for(conf, thresholds["t_high"], thresholds["t_low"])

    result = {
        "prediction_set": top,
        "confidence_level": level,
        "confidence_score": estimated_accuracy(conf, thresholds["score_map"]),
        "raw_confidence": conf,
        "priority": "Medium",  # MuRIL does not estimate priority (out of scope in the synopsis)
        "classifier": "muril",
        # Extra fields for the temporary confidence display on the citizen screen.
        "top3": [{"department": LABELS[int(i)], "probability": float(probs[i])} for i in order[:3]],
        "t_high": float(thresholds["t_high"]),
        "t_low": float(thresholds["t_low"]),
    }
    if level == "Medium":
        second = LABELS[int(order[1])]
        result["clarifying_question"] = (
            f"Is your complaint about {top} or {second}? Please add a few more details about the problem."
        )
    if level == "Low":
        result["alternative_departments"] = ", ".join(LABELS[int(i)] for i in order[:3])
    return result


def _load():
    if _state["model"] is not None:
        return
    import torch  # noqa: F401  (lazy: heavy)
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    with open(THRESHOLDS_PATH) as f:
        _state["thresholds"] = json.load(f)
    _state["tokenizer"] = AutoTokenizer.from_pretrained(MODEL_DIR)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
    model.eval()
    _state["model"] = model


def classify(text):
    """Returns a result dict, or None if MuRIL cannot be used (caller falls back to Gemini)."""
    if not is_available():
        return None
    try:
        import torch

        _load()
        enc = _state["tokenizer"](text, truncation=True, max_length=MAX_LEN, return_tensors="pt")
        with torch.no_grad():
            logits = _state["model"](**enc).logits[0]
        probs = torch.softmax(logits, dim=-1).numpy()
        return build_result(probs, _state["thresholds"])
    except Exception as e:  # missing deps, bad weights, ...
        print(f"MuRIL classification unavailable, falling back: {e}")
        _state["failed"] = True
        return None
