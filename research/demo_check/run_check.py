"""Send the demo check sentences through the REAL running app, as the browser does, and judge the answers.

Run from the repo root with the app running (start_demo.ps1 -Local):
    python research/demo_check/run_check.py voice --tag turbo      # clips/*.webm -> POST /api/upload (+ language) -> poll /api/status
    python research/demo_check/run_check.py text  --tag turbo      # the same sentences -> POST /api/submit-text
    python research/demo_check/run_check.py clarify                # one clarify flow end to end (needs a voice or text run first)
    python research/demo_check/run_check.py cleanup                # delete every test complaint and kept audio file it created

Every test complaint has location DEMO_CHECK; created ids and task ids are in created.json so that cleanup removes only those.
Seconds = from sending the request until the status endpoint reports success (polled every 0.25 s; the browser polls every
2 s, which can add up to 2 s). Judging rules, fixed before running:
  transcript correct : every key-word group in sentences.csv has at least one of its variants in the transcript (voice only)
  route sensible     : clear   -> auto and the right department, or ask with the right department among the options
                       between -> ask with at least 2 acceptable departments among the options, or human
                       vague   -> ask or human (never auto)
"""
import argparse
import csv
import json
import os
import sys
import time

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.getenv("API_BASE", "http://127.0.0.1:8000")
CREATED = os.path.join(HERE, "created.json")
FORM = {"location": "DEMO_CHECK", "reporter_name": "Demo Check", "reporter_phone": "0000000000"}


def sentences():
    with open(os.path.join(HERE, "sentences.csv"), encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def remember(kind, value):
    data = json.load(open(CREATED)) if os.path.exists(CREATED) else {"grievance_ids": [], "task_ids": []}
    data[kind].append(value)
    json.dump(data, open(CREATED, "w"))


def wait(task_id, timeout=120):
    t_end = time.time() + timeout
    while time.time() < t_end:
        s = requests.get(f"{BASE}/api/status/{task_id}", timeout=10).json()
        if s["status"] != "processing":
            return s
        time.sleep(0.25)
    return {"status": "error", "error": "timed out"}


def submit(row, mode):
    started = time.time()
    if mode == "voice":
        with open(os.path.join(HERE, "clips", f"{row['id']}.webm"), "rb") as f:
            r = requests.post(f"{BASE}/api/upload", files={"file": ("recording.webm", f, "audio/webm")},
                              data={**FORM, "language": row["portal_language"]}, timeout=30)
    else:
        r = requests.post(f"{BASE}/api/submit-text", data={**FORM, "text": row["sentence"]}, timeout=30)
    r.raise_for_status()
    task_id = r.json()["task_id"]
    remember("task_ids", task_id)
    s = wait(task_id)
    secs = time.time() - started
    res = s.get("ai_result", {})
    if "id" in res:
        remember("grievance_ids", res["id"])
    return {"id": row["id"], "category": row["category"], "status": s["status"], "error": s.get("error", ""),
            "transcript": res.get("transcript", ""), "predicted": res.get("prediction_set", ""),
            "level": res.get("confidence_level", ""), "route": res.get("route", ""),
            "options": ", ".join(res.get("options", [])) if res.get("options") else "",
            "raw_confidence": round(res.get("raw_confidence", 0), 3), "seconds": round(secs, 2), "grievance_id": res.get("id", "")}


def transcript_correct(row, transcript):
    text = transcript.lower()
    return all(any(v.lower() in text for v in group.split("|")) for group in row["key_words"].split(";"))


def route_sensible(row, out):
    options = [o for o in out["options"].split(", ") if o]
    acceptable = row["acceptable_departments"].split("|")
    if row["category"] == "clear":
        return (out["route"] == "auto" and out["predicted"] == row["expected_department"]) or \
               (out["route"] == "ask" and row["expected_department"] in options)
    if row["category"] == "between":
        return (out["route"] == "ask" and sum(o in acceptable for o in options) >= 2) or out["route"] == "human"
    return out["route"] in ("ask", "human")


def run(mode, tag):
    rows = sentences()
    outs = []
    for row in rows:
        out = submit(row, mode)
        out["transcript_ok"] = transcript_correct(row, out["transcript"]) if mode == "voice" and out["status"] == "success" else ""
        out["route_ok"] = route_sensible(row, out) if out["status"] == "success" else False
        outs.append(out)
        print(f"{out['id']:<34}{out['seconds']:6.2f}s  {out['route']:<6} {out['predicted']:<13} {out['options']}", flush=True)
    path = os.path.join(HERE, f"results_{mode}_{tag}.csv")
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(outs[0].keys()))
        w.writeheader()
        w.writerows(outs)
    secs = [o["seconds"] for o in outs]
    ok_t = sum(o["transcript_ok"] is True for o in outs)
    ok_r = sum(o["route_ok"] for o in outs)
    print(f"\n{mode} / {tag}: transcripts correct {ok_t}/20" if mode == "voice" else f"\n{mode} / {tag}:", f"routes sensible {ok_r}/20",
          f"| seconds per complaint: average {sum(secs) / len(secs):.2f}, slowest {max(secs):.2f}",
          f"| routes: " + ", ".join(f"{k} {sum(o['route'] == k for o in outs)}" for k in ("auto", "ask", "human")))
    print("saved", path)


def clarify(tag):
    """Pick a complaint that got buttons, answer through the clarify endpoint, and read it back as the operator side does."""
    asked = None
    for mode in ("voice", "text"):
        p = os.path.join(HERE, f"results_{mode}_{tag}.csv")
        if os.path.exists(p):
            for r in csv.DictReader(open(p, encoding="utf-8-sig")):
                if r["route"] == "ask" and r["options"]:
                    asked = r
                    break
        if asked:
            break
    if not asked:
        raise SystemExit("no complaint with options found in the results files")
    options = asked["options"].split(", ")
    choice = options[-1]  # not the model's first guess, so the change is visible
    gid = asked["grievance_id"]
    before = next(g for g in requests.get(f"{BASE}/api/grievances").json() if g["id"] == int(gid))
    r = requests.patch(f"{BASE}/api/grievances/{gid}/clarify", json={"choice": choice})
    after = next(g for g in requests.get(f"{BASE}/api/grievances").json() if g["id"] == int(gid))
    again = requests.patch(f"{BASE}/api/grievances/{gid}/clarify", json={"choice": choice})
    print(f"complaint {gid} ({asked['id']}), options shown: {options}, citizen picked: {choice}")
    print(f"  before: prediction={before['prediction']!r} confidence={before['confidence']!r} question_pending={bool(before['clarifying_question'])}")
    print(f"  clarify endpoint: HTTP {r.status_code} {r.json()}")
    print(f"  operator list (GET /api/grievances): prediction={after['prediction']!r} confidence={after['confidence']!r} question_pending={bool(after['clarifying_question'])}")
    print(f"  second answer to the same complaint: HTTP {again.status_code} (expected 409)")
    assert r.status_code == 200 and after["confidence"] == "Confirmed by citizen" and after["prediction"] == choice


def cleanup():
    data = json.load(open(CREATED)) if os.path.exists(CREATED) else {"grievance_ids": [], "task_ids": []}
    for gid in data["grievance_ids"]:
        requests.delete(f"{BASE}/api/grievances/{gid}", timeout=10)
    audio_dir = os.path.join(os.path.dirname(os.path.dirname(HERE)), "backend", "temp_audio")
    removed = 0
    for tid in data["task_ids"]:
        for ext in (".webm", ".wav", ".mp3", ".m4a", ".ogg", ".mp4", ".flac"):
            p = os.path.join(audio_dir, tid + ext)
            if os.path.exists(p):
                os.remove(p)
                removed += 1
    left = [g for g in requests.get(f"{BASE}/api/grievances").json() if g.get("location") == "DEMO_CHECK"]
    print(f"deleted {len(data['grievance_ids'])} test complaints and {removed} kept audio files; DEMO_CHECK complaints left: {len(left)}")
    os.remove(CREATED) if os.path.exists(CREATED) else None


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["voice", "text", "clarify", "cleanup"])
    ap.add_argument("--tag", default="turbo")
    a = ap.parse_args()
    {"voice": lambda: run("voice", a.tag), "text": lambda: run("text", a.tag), "clarify": lambda: clarify(a.tag), "cleanup": cleanup}[a.what]()
