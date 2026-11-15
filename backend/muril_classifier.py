"""MuRIL classifier with High / Medium / Low routing read from router_config.json.

Used by ai_pipeline.process_audio_task when the fine-tuned model is present
(see research/train_muril.py and research/make_router_config.py). If the config or the model
files are missing, is_available() is False and the pipeline keeps using Gemini.

Routing (frozen settings in router_config.json):
  confidence >= t_high                         -> High   : route automatically
  otherwise build the conformal set (every class with probability >= 1 - qhat):
      set size 2 or 3                          -> Medium : ask the citizen to pick one of the set
      any other size                           -> Low    : send to a human with the top 3
  "Unclear" is never offered as a choice; if fewer than 2 real departments remain in the set, the complaint goes to a human.
The previous model and thresholds.json (research/outputs/muril/) are kept as a backup and are no longer read.

Needs the heavy deps in requirements-muril.txt (torch, transformers); they are
imported lazily so the normal backend (e.g. on Render) is unaffected.
"""
import json
import os

import numpy as np

# Must match research/train_muril.py exactly (the order is the class index).
LABELS = ["Water", "Electricity", "Roads", "Sanitation", "Drainage", "Street Lights", "Unclear"]
MAX_LEN = 64
SET_EPS = 1e-9  # same guard as research/conformal.py against float rounding in p >= 1 - qhat

_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.getenv("MURIL_ROUTER_CONFIG", os.path.join(_REPO, "research", "outputs", "final_e40", "router_config.json"))

_state = {"tokenizer": None, "model": None, "config": None, "failed": False}


def read_config(path=None):
    with open(path or CONFIG_PATH) as f:
        return json.load(f)


def model_dir(config):
    """MURIL_MODEL_DIR overrides; otherwise the config's model_dir (relative to the repo root)."""
    override = os.getenv("MURIL_MODEL_DIR")
    if override:
        return override
    path = config["model_dir"]
    return path if os.path.isabs(path) else os.path.join(_REPO, path)


def is_available():
    if _state["failed"] or not os.path.isfile(CONFIG_PATH):
        return False
    try:
        return os.path.isdir(model_dir(read_config()))
    except (OSError, ValueError, KeyError):
        return False


def estimated_accuracy(conf, score_map):
    """Calibration hit rate for this confidence, for display ('chance this routing is right')."""
    for entry in score_map:
        if conf <= entry["max_conf"]:
            return entry["est_accuracy"]
    return score_map[-1]["est_accuracy"]


def conformal_set(probs, qhat):
    """Class indices with probability >= 1 - qhat, most probable first."""
    members = [int(i) for i in np.where(probs >= 1.0 - qhat - SET_EPS)[0]]
    return sorted(members, key=lambda i: -probs[i])


def build_result(probs, config):
    """Pure function: class probabilities -> the dict the rest of the pipeline expects."""
    order = np.argsort(probs)[::-1]
    top = LABELS[int(order[0])]
    conf = float(probs[order[0]])
    members = conformal_set(probs, config["qhat"])
    top3 = [LABELS[int(i)] for i in order[:3]]
    # "Unclear" is not a department, so it is never offered to the citizen as a choice.
    options = [LABELS[i] for i in members if LABELS[i] != "Unclear"]

    if conf >= config["t_high"]:
        level, route = "High", "auto"
    elif len(members) in (2, 3) and len(options) >= 2:
        level, route = "Medium", "ask"
    else:
        level, route = "Low", "human"

    result = {
        "prediction_set": top,
        "confidence_level": level,
        "route": route,
        "confidence_score": estimated_accuracy(conf, config["score_map"]),
        "raw_confidence": conf,
        "priority": "Medium",  # MuRIL does not estimate priority (out of scope in the synopsis)
        "classifier": "muril",
        # Extra fields for the temporary confidence display on the citizen screen.
        "top3": [{"department": LABELS[int(i)], "probability": float(probs[i])} for i in order[:3]],
        "t_high": float(config["t_high"]),
        "qhat": float(config["qhat"]),
        "set_size": len(members),
    }
    if level == "Medium":
        result["options"] = options  # the citizen picks one of these (or "none of these")
        result["alternative_departments"] = ", ".join(options)  # stored with the grievance; the clarify endpoint checks against it
        result["clarifying_question"] = "Which department should handle your complaint? Please pick one."
    if level == "Low":
        result["alternative_departments"] = ", ".join(top3)  # for the human reviewer
    return result


def _load():
    if _state["model"] is not None:
        return
    import torch  # noqa: F401  (lazy: heavy)
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    _state["config"] = read_config()
    path = model_dir(_state["config"])
    _state["tokenizer"] = AutoTokenizer.from_pretrained(path)
    model = AutoModelForSequenceClassification.from_pretrained(path)
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
        return build_result(probs, _state["config"])
    except Exception as e:  # missing deps, bad weights, ...
        print(f"MuRIL classification unavailable, falling back: {e}")
        _state["failed"] = True
        return None
