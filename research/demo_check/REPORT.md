# Demo check (2026-11-17)

20 test sentences (made-up text, spoken by Google text-to-speech: clean synthetic speech, not a noisy laptop microphone) sent through the running app exactly as the browser does (`POST /api/upload` with the language choice, then `/api/status`), and the same sentences as typed text (`POST /api/submit-text`). Routing rule: `research/outputs/final_e40/router_config.json` (`t_high` 0.888406, conformal `qhat` 0.977175). Scripts: `make_clips.py`, `run_check.py`, `make_report.py`.

Judging rules, fixed before the first run: a transcript is correct when every key-word group in `sentences.csv` has one of its spellings in it; a route is sensible when a clear complaint is auto-routed to the right department or asked with the right department among the options, an in-between complaint is asked (at least 2 acceptable departments among the options) or sent to a human, and a vague complaint is asked or sent to a human, never auto-routed. A vague complaint that is auto-routed to the class `Unclear` counts as a failure of this rule, although the portal tells the citizen it goes to a human operator.

## Whisper size

| run | transcripts correct | routes sensible | seconds per complaint (average / slowest) | note |
|---|---|---|---|---|
| small, clean run | 15/20 | 15/20 | 2.86 / 3.32 | chosen |
| large-v3-turbo, clean run | 17/20 | 14/20 | 9.70 / 16.91 | over the 8 s limit; one hand-submitted complaint arrived during this run |
| small, first run | 15/20 | 15/20 | 3.49 / 4.25 | complaints were also being submitted by hand |
| large-v3-turbo, first run | 17/20 | 14/20 | 11.75 / 21.70 | complaints were also being submitted by hand |

Typed text: 0.30 s per complaint on average (slowest 0.32 s). Seconds run from sending the request until the status endpoint reports success (the browser polls every 2 s, so it can show up to 2 s more).

**Decision: `WHISPER_MODEL=small`.** large-v3-turbo averaged 9.70 s per spoken complaint with nothing else of mine running (9.3 s without the one slow clip), over the 8 s limit; small averaged 2.86 s. large-v3-turbo wrote 2 more transcripts correctly by my key-word rule (17/20 against 15/20), mostly Hindi spellings. The app is about 3 s slower per complaint than the stand-alone benchmark for both sizes; the cause was not investigated.

## All 20 sentences (small, clean run; typed route for comparison)

| id | transcript heard | right? | predicted | spoken route | options shown | seconds | typed route |
|---|---|---|---|---|---|---|---|
| clear_en_water | There is no water supply in our streets since morning. | yes | Water | ask | Water, Drainage | 2.43 | ask |
| clear_en_electricity | The electricity has been cut in our area for three hours. | yes | Electricity | auto |  | 2.36 | auto |
| clear_en_road | There is a big pothole in the middle of the main road. | yes | Roads | human (!) |  | 2.45 | human |
| clear_en_sanitation | The garbage is not collected from our colony for a week. | yes | Sanitation | auto |  | 2.47 | auto |
| clear_hi_water | मेरी गली में 3 दिन से पानी नहीं आही आरा है | yes | Drainage | ask | Drainage, Water, Sanitation | 3.17 | ask |
| clear_hi_electricity | हमारे हिलाके में कल राथ से बिजली नहीं आरही है | yes | Electricity | auto |  | 3.19 | auto |
| clear_hi_road | मुक्ये सड़क पर बड़ा गद्धा हो गया है | no | Roads | auto |  | 3.2 | ask |
| clear_hi_sanitation | हमारी कोलोनी मे एक अफते से कचरा नहीं उठाया गया है | yes | Sanitation | auto |  | 3.26 | auto |
| clear_hinglish_water | हमारी गली में सुबह से पानी नहीं आँ रहा है | yes | Drainage | ask | Drainage, Water, Sanitation | 3.04 | ask |
| clear_hinglish_electricity | हमारे मुहले में कल राथ से बिजली नहीं है | yes | Electricity | auto |  | 2.95 | auto |
| clear_hinglish_road | सड़क पर बहुत बड़ा गद्धा हो गया है | no | Roads | auto |  | 3.23 | ask |
| clear_hinglish_sanitation | हमारी कोलोनी में कुडा नहीं उठाया जा रहा है | no | Sanitation | auto |  | 3.26 | auto |
| between_en_dirty_water_road | Dirty water is flowing on the road near my house. | yes | Drainage | ask | Drainage, Water, Sanitation | 2.6 | ask |
| between_en_garbage_drain | garbage is blocking the drain in our lane | yes | Drainage | ask | Drainage, Water, Sanitation | 2.36 | ask |
| between_hi_pole_on_road | सद़क पर भिज्ली का खंभा गिरा हूए और तार लटक रही है | no | Electricity | auto (!) |  | 3.32 | auto |
| between_hinglish_drain_water_road | नाली का गंदा पानी सड़क पर बहर गया है | yes | Drainage | ask | Drainage, Water, Sanitation | 2.96 | ask |
| vague_en_solve | Please solve the problem in my area. | yes | Unclear | auto (!) |  | 2.37 | auto |
| vague_en_help | Something is wrong here. Please help us. | yes | Unclear | auto (!) |  | 2.43 | auto |
| vague_hi_samasya | क्रिब्या हमारे इलाके की समस्या का समाधाण की जिये | yes | Unclear | ask | Roads, Street Lights | 3.25 | auto |
| vague_hinglish_problem | मेरी प्रब्लम का सूलूँशन कीजी एं। | no | Unclear | auto (!) |  | 2.96 | auto |

## Which sentences auto-route, ask, or go to a human (current rule)

Typed text is exact; the spoken route can differ when the transcript differs.

### Auto-routed

- **clear_en_electricity** (Electricity, confidence 0.898): The electricity has been cut in our area for three hours.
- **clear_en_sanitation** (Sanitation, confidence 0.898): The garbage is not collected from our colony for a week.
- **clear_hi_electricity** (Electricity, confidence 0.898): हमारे इलाके में कल रात से बिजली नहीं आ रही है।
- **clear_hi_sanitation** (Sanitation, confidence 0.898): हमारी कॉलोनी में एक हफ्ते से कचरा नहीं उठाया गया है।
- **clear_hinglish_electricity** (Electricity, confidence 0.898): Hamare mohalle mein kal raat se bijli nahi hai.
- **clear_hinglish_sanitation** (Sanitation, confidence 0.896): Hamari colony mein kooda nahi uthaya ja raha hai.
- **between_hi_pole_on_road** (Electricity, confidence 0.898): सड़क पर बिजली का खंभा गिरा हुआ है और तार लटक रहे हैं।
- **vague_en_solve** (Unclear, confidence 0.904): Please solve the problem in my area.
- **vague_en_help** (Unclear, confidence 0.904): Something is wrong here. Please help us.
- **vague_hi_samasya** (Unclear, confidence 0.904) (spoken: ask): कृपया हमारे इलाके की समस्या का समाधान कीजिए।
- **vague_hinglish_problem** (Unclear, confidence 0.904): Meri problem ka solution kijiye.

### Asked (the citizen gets buttons)

- **clear_en_water** (Water, confidence 0.856) -> options: Water, Drainage: There is no water supply in our street since morning.
- **clear_hi_water** (Water, confidence 0.623) -> options: Water, Drainage: मेरी गली में तीन दिन से पानी नहीं आ रहा है।
- **clear_hi_road** (Roads, confidence 0.888) -> options: Roads, Street Lights (spoken: auto): मुख्य सड़क पर बहुत बड़ा गड्ढा हो गया है।
- **clear_hinglish_water** (Water, confidence 0.734) -> options: Water, Drainage: Humari gali mein subah se paani nahi aa raha hai.
- **clear_hinglish_road** (Roads, confidence 0.888) -> options: Roads, Street Lights (spoken: auto): Sadak par bahut bada gaddha ho gaya hai.
- **between_en_dirty_water_road** (Drainage, confidence 0.848) -> options: Drainage, Water, Sanitation: Dirty water is flowing on the road near my house.
- **between_en_garbage_drain** (Drainage, confidence 0.848) -> options: Drainage, Water, Sanitation: Garbage is blocking the drain in our lane.
- **between_hinglish_drain_water_road** (Water, confidence 0.863) -> options: Water, Drainage: Nali ka gandha paani sadak par bhar gaya hai.

### Sent to a human

- **clear_en_road** (Roads, confidence 0.456): There is a big pothole in the middle of the main road.

## Suggested opening sentences

1. **Auto**: "The electricity has been cut in our area for three hours." (`clear_en_electricity`): right transcript, auto to Electricity, confidence 0.898, same in both Whisper sizes and typed.
2. **Auto, Hindi**: "हमारी कॉलोनी में एक हफ्ते से कचरा नहीं उठाया गया है।" (`clear_hi_sanitation`): auto to Sanitation; small spells two words wrongly but the meaning survives.
3. **Ask**: "Garbage is blocking the drain in our lane." (`between_en_garbage_drain`): the buttons offered are Drainage, Water and Sanitation, so the citizen picks. Same typed.
4. **Human**: "There is a big pothole in the middle of the main road." (`clear_en_road`): transcribed right, but confidence 0.456 so it goes to a human; it shows the human route, and it is a clear complaint that the model is unsure about, so present it as 'the system admits it is unsure'.
5. **Vague**: "Please solve the problem in my area." (`vague_en_solve`): classed `Unclear`; the portal says it is sent to a human operator.

Avoid for an opening: the two road-with-a-pothole sentences in Hindi and Hinglish (confidence about 0.888, right on the line, they flip between auto and ask), and `between_hi_pole_on_road`, which is auto-routed to Electricity although it is about a pole on a road.

## Clarify flow, end to end

`clear_en_water` (asked, options Water and Drainage): the citizen picked Drainage through `PATCH /api/grievances/{id}/clarify`. The operator list (`GET /api/grievances`) then showed prediction Drainage with confidence `Confirmed by citizen` and no pending question; a second answer was refused with HTTP 409. The login screens are disabled in this local setup, so the operator dashboard itself was not opened; the check used the same list the dashboard reads.

## Limits

- The clips are clean synthetic speech; real laptop-microphone speech is harder (see `backend/benchmark_whisper.py` and `PROJECT_STATE.md`).
- 20 sentences is a small sample, and the key-word judging is mine. Of the 5 transcripts that small missed, 4 are spelling variants of the right word (गद्धा for गड्ढा twice, कुडा for कूड़ा, प्रब्लम for प्राब्लम) and 1 is a real garble (the pole sentence). In the first large-v3-turbo run one transcript was a real error ("गधा", donkey, for गड्ढा).
- The initial prompt stays off (`WHISPER_PROMPT` unset); it made Whisper much slower on real recordings.
