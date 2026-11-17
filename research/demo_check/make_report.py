"""Build REPORT.md from sentences.csv and the results_*.csv files of run_check.py. Run from the repo root:
    python research/demo_check/make_report.py
"""
import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def rd(name):
    with open(os.path.join(HERE, name), encoding="utf-8-sig", newline="") as f:
        return {r["id"]: r for r in csv.DictReader(f)}


def stats(rows):
    secs = [float(r["seconds"]) for r in rows.values()]
    t = sum(r["transcript_ok"] == "True" for r in rows.values())
    ok = sum(r["route_ok"] == "True" for r in rows.values())
    routes = {k: sum(r["route"] == k for r in rows.values()) for k in ("auto", "ask", "human")}
    return t, ok, sum(secs) / len(secs), max(secs), routes


with open(os.path.join(HERE, "sentences.csv"), encoding="utf-8-sig", newline="") as f:
    sent = {r["id"]: r for r in csv.DictReader(f)}
small, turbo, small1, turbo1 = rd("results_voice_small2.csv"), rd("results_voice_turbo2.csv"), rd("results_voice_small.csv"), rd("results_voice_turbo.csv")
typed = rd("results_text_turbo.csv")

out = ["# Demo check (2026-11-17)", "",
       "20 test sentences (made-up text, spoken by Google text-to-speech: clean synthetic speech, not a noisy laptop microphone) sent through the running app "
       "exactly as the browser does (`POST /api/upload` with the language choice, then `/api/status`), and the same sentences as typed text (`POST /api/submit-text`). "
       "Routing rule: `research/outputs/final_e40/router_config.json` (`t_high` 0.888406, conformal `qhat` 0.977175). Scripts: `make_clips.py`, `run_check.py`, `make_report.py`.", "",
       "Judging rules, fixed before the first run: a transcript is correct when every key-word group in `sentences.csv` has one of its spellings in it; "
       "a route is sensible when a clear complaint is auto-routed to the right department or asked with the right department among the options, an in-between complaint is asked "
       "(at least 2 acceptable departments among the options) or sent to a human, and a vague complaint is asked or sent to a human, never auto-routed. "
       "A vague complaint that is auto-routed to the class `Unclear` counts as a failure of this rule, although the portal tells the citizen it goes to a human operator.", "",
       "## Whisper size", "",
       "| run | transcripts correct | routes sensible | seconds per complaint (average / slowest) | note |", "|---|---|---|---|---|"]
for name, rows, note in (("small, clean run", small, "chosen"), ("large-v3-turbo, clean run", turbo, "over the 8 s limit; one hand-submitted complaint arrived during this run"),
                         ("small, first run", small1, "complaints were also being submitted by hand"), ("large-v3-turbo, first run", turbo1, "complaints were also being submitted by hand")):
    t, ok, avg, worst, _ = stats(rows)
    out.append(f"| {name} | {t}/20 | {ok}/20 | {avg:.2f} / {worst:.2f} | {note} |")
tt = stats(typed)
out += ["", f"Typed text: {tt[2]:.2f} s per complaint on average (slowest {tt[3]:.2f} s). Seconds run from sending the request until the status endpoint reports success (the browser polls every 2 s, so it can show up to 2 s more).", "",
        "**Decision: `WHISPER_MODEL=small`.** large-v3-turbo averaged 9.70 s per spoken complaint with nothing else of mine running (9.3 s without the one slow clip), over the 8 s limit; "
        "small averaged 2.86 s. large-v3-turbo wrote 2 more transcripts correctly by my key-word rule (17/20 against 15/20), mostly Hindi spellings. "
        "The app is about 3 s slower per complaint than the stand-alone benchmark for both sizes; the cause was not investigated.", "",
        "## All 20 sentences (small, clean run; typed route for comparison)", "",
        "| id | transcript heard | right? | predicted | spoken route | options shown | seconds | typed route |", "|---|---|---|---|---|---|---|---|"]
for k, r in small.items():
    flag = "" if r["route_ok"] == "True" else " (!)"
    out.append(f"| {k} | {r['transcript'][:60]} | {'yes' if r['transcript_ok'] == 'True' else 'no'} | {r['predicted']} | {r['route']}{flag} | {r['options']} | {r['seconds']} | {typed[k]['route']} |")

out += ["", "## Which sentences auto-route, ask, or go to a human (current rule)", "",
        "Typed text is exact; the spoken route can differ when the transcript differs.", ""]
for route, title in (("auto", "Auto-routed"), ("ask", "Asked (the citizen gets buttons)"), ("human", "Sent to a human")):
    out.append(f"### {title}")
    out.append("")
    for k, r in typed.items():
        if r["route"] == route:
            sp = small[k]["route"]
            extra = "" if sp == route else f" (spoken: {sp})"
            opt = f" -> options: {r['options']}" if r["options"] else ""
            out.append(f"- **{k}** ({r['predicted']}, confidence {r['raw_confidence']}){opt}{extra}: {sent[k]['sentence']}")
    out.append("")

out += ["## Suggested opening sentences", "",
        "1. **Auto**: \"The electricity has been cut in our area for three hours.\" (`clear_en_electricity`): right transcript, auto to Electricity, confidence 0.898, same in both Whisper sizes and typed.",
        "2. **Auto, Hindi**: \"हमारी कॉलोनी में एक हफ्ते से कचरा नहीं उठाया गया है।\" (`clear_hi_sanitation`): auto to Sanitation; small spells two words wrongly but the meaning survives.",
        "3. **Ask**: \"Garbage is blocking the drain in our lane.\" (`between_en_garbage_drain`): the buttons offered are Drainage, Water and Sanitation, so the citizen picks. Same typed.",
        "4. **Human**: \"There is a big pothole in the middle of the main road.\" (`clear_en_road`): transcribed right, but confidence 0.456 so it goes to a human; it shows the human route, "
        "and it is a clear complaint that the model is unsure about, so present it as 'the system admits it is unsure'.",
        "5. **Vague**: \"Please solve the problem in my area.\" (`vague_en_solve`): classed `Unclear`; the portal says it is sent to a human operator.", "",
        "Avoid for an opening: the two road-with-a-pothole sentences in Hindi and Hinglish (confidence about 0.888, right on the line, they flip between auto and ask), "
        "and `between_hi_pole_on_road`, which is auto-routed to Electricity although it is about a pole on a road.", "",
        "## Clarify flow, end to end", "",
        "`clear_en_water` (asked, options Water and Drainage): the citizen picked Drainage through `PATCH /api/grievances/{id}/clarify`. "
        "The operator list (`GET /api/grievances`) then showed prediction Drainage with confidence `Confirmed by citizen` and no pending question; a second answer was refused with HTTP 409. "
        "The login screens are disabled in this local setup, so the operator dashboard itself was not opened; the check used the same list the dashboard reads.", "",
        "## Limits", "",
        "- The clips are clean synthetic speech; real laptop-microphone speech is harder (see `backend/benchmark_whisper.py` and `PROJECT_STATE.md`).",
        "- 20 sentences is a small sample, and the key-word judging is mine. Of the 5 transcripts that small missed, 4 are spelling variants of the right word (गद्धा for गड्ढा twice, कुडा for कूड़ा, प्रब्लम for प्राब्लम) and 1 is a real garble (the pole sentence). In the first large-v3-turbo run one transcript was a real error (\"गधा\", donkey, for गड्ढा).",
        "- The initial prompt stays off (`WHISPER_PROMPT` unset); it made Whisper much slower on real recordings.", ""]
open(os.path.join(HERE, "REPORT.md"), "w", encoding="utf-8").write("\n".join(out))
print("REPORT.md written,", len(out), "lines")
