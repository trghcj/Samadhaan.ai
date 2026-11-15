# PROJECT_STATE

State of the repository at commit `ccdc4e7` (branch `calibrated-routing-and-speech-stage`, 2026-11-12).
Only facts taken from the code and files. Numbers were read from the saved result files or recomputed from them
with the project's own functions. Nothing here is a plan.

Project names in use: the synopsis and proposal say **CivicSense**; the README, UI and repo say **Samadhaan.ai**.

---

## 1. Folder tree

Omitted: `data/` contents, model weights (`research/outputs/muril/model/`), virtual environments, `node_modules/`, caches.

```
Minor_Project/
├── README.md                    original project README (Samadhaan.ai)
├── README_DEMO.md               how to run the local demo; speech settings table
├── PROJECT_STATE.md             this file
├── CivicSense_Research_Proposal.docx
├── start_demo.ps1               starts backend + frontend (or backend + tunnel)
├── vercel.json
├── .gitignore
├── backend/
│   ├── main.py                  FastAPI app and all HTTP endpoints
│   ├── ai_pipeline.py           upload -> speech -> classify -> save pipeline; Gemini fallback; photo verification
│   ├── asr.py                   speech-to-text stage (faster-whisper)
│   ├── muril_classifier.py      runtime MuRIL classifier + High/Medium/Low logic
│   ├── database.py              SQLAlchemy engine from DATABASE_URL
│   ├── models.py                Grievance and User tables
│   ├── init_db.py               drops all tables, inserts 4 mock rows
│   ├── migrate_db.py            adds two columns to grievances
│   ├── debug_gemini.py          lists Gemini models available to the key
│   ├── test_model.py            script (not a test) that tries generating with several Gemini model names
│   ├── requirements.txt / requirements-muril.txt / requirements-dev.txt
│   ├── pytest.ini
│   └── tests/
│       ├── conftest.py          points tests at a temporary SQLite file
│       ├── test_asr.py          21 tests
│       ├── test_api.py          4 tests
│       └── fixtures/            3 synthetic text-to-speech clips (WebM/Opus)
├── data/                        (omitted) build_dataset.py, complaints.csv, README.md, LABELLING_GUIDE.md
├── research/
│   ├── train_muril.py           fine-tunes MuRIL, saves probabilities (optional validation mode)
│   ├── calibration_report.py    reliability table, thresholds, trade-off graph
│   ├── eval_asr.py              WER/CER evaluation of speech recognition
│   ├── mic_ab_test.html         page for recording the same sentence under 4 microphone settings
│   ├── requirements.txt
│   └── outputs/muril/
│       ├── metrics.json, thresholds.json, tradeoff.png
│       ├── probs_calibration.csv, probs_test.csv
│       └── model/               (omitted, about 950 MB, not in git)
└── frontend/                    React 19 app built with Vite
    ├── package.json, vite.config.js, vercel.json, index.html
    └── src/
        ├── main.jsx, App.jsx, api.js, firebase.js, i18n.js, index.css, App.css
        ├── contexts/AuthContext.jsx
        └── pages/ AuthPage.jsx, CitizenPortal.jsx, CitizenDashboard.jsx, OperatorDashboard.jsx
```

Also present: `research/outputs/final_e40/` (probabilities and metrics of a 40-epoch default-mode run, seed 42, no weights), `research/outputs/tradeoff_20_vs_60.png` (trade-off curves for the 20- and 60-epoch runs on calibration rows) and `research/colab_runs/` (Colab result zips, git-ignored). The committed `research/outputs/muril/metrics.json` predates the `train_loss` field and does not contain it.

## 2. What each script does

**backend/**
- `main.py`: endpoints `GET /`, `GET /api/reset-db`, `GET /api/grievances`, `PATCH /api/grievances/{id}/resolve`, `DELETE /api/grievances/{id}`, `PATCH /api/grievances/{id}/clarify`, `POST /api/users/sync`, `GET /api/grievances/me/{uid}`, `POST /api/upload`, `GET /api/status/{task_id}`. Upload saves the audio under a UUID name, runs the pipeline in a background task, keeps task status in an in-memory dict, deletes the audio afterwards unless `KEEP_AUDIO=1`.
- `ai_pipeline.py`: `process_audio_task` loads and decodes the audio, runs Whisper, classifies (MuRIL if available and `CLASSIFIER` is not `gemini`, else Gemini over REST, else a mock result), computes an SLA deadline from priority (High 1 day, Medium 7, Low 14), saves a `Grievance` row, returns the result dict including an `asr` block. `verify_resolution` sends before/after photos to Gemini and returns `{valid, reason}`.
- `asr.py`: `load_audio` (decode to 16 kHz mono; raises `AudioError` for empty, unreadable, shorter than 0.5 s, or silent audio), `pick_language` (chooses between Hindi and English from Whisper's language probabilities), `transcribe` (voice-activity filter on by default; returns the raw text plus language, average log-probability, no-speech probability, duration, peak, rms, estimated SNR). It does not modify the text.
- `muril_classifier.py`: loads `research/outputs/final_e40/router_config.json` and the 40-epoch model it points to; softmax over 7 labels; confidence >= `t_high` -> High (automatic); otherwise the conformal set (probability >= 1 - `qhat`): size 2 or 3 -> Medium (the citizen picks one of the set, stored in `alternative_departments`), any other size -> Low (human, top 3).
- `models.py`: `Grievance` (transcript, prediction, confidence, confidence_score, clarifying_question, alternative_departments, reporter fields, location, photo URLs, priority, sla_deadline, ai_verification_status/notes, resolution fields) and `User` (uid, email, display_name, role, department).
- `init_db.py`, `migrate_db.py`, `debug_gemini.py`, `test_model.py`: one-off maintenance and debugging scripts.

**data/**
- `build_dataset.py`: builds `complaints.csv` from complaint sentences written into the script (see section 3).

**research/**
- `train_muril.py`: fine-tunes MuRIL on `split == "train"`, writes softmax probabilities for the calibration and test rows, `metrics.json` (now also a per-epoch `train_loss` list), and the model. Optional `--val_groups N` (default 0) switches to validation mode: N whole groups per class are held out of the train split, validation loss and accuracy are logged per epoch, only `metrics.json` is written (no probabilities, no model), and calibration and test rows are never used.
- `calibration_report.py`: prints a reliability table, picks `t_high` and `t_low` on the calibration rows only, applies them to the test rows, writes `thresholds.json` and `tradeoff.png`.
- `eval_asr.py`: runs recordings listed in a manifest CSV through `asr.transcribe`, reports WER and CER (jiwer) after identical normalisation of reference and output, optionally degrades audio with white noise at set SNR values and re-encodes it as WebM/Opus first.
- `mic_ab_test.html`: browser page that records under four `getUserMedia` constraint sets and downloads each clip.

**frontend/**
- `CitizenPortal.jsx`: records audio with `MediaRecorder`, collects name/phone/location/details/optional photo (photo uploaded to Cloudinary from the browser), posts to `/api/upload`, polls `/api/status`, shows routed / needs-clarification screens, plus a temporary "Confidence details" box.
- `CitizenDashboard.jsx`: lists the logged-in citizen's grievances with search, filter, sort, delete, and a status timeline.
- `OperatorDashboard.jsx`: Kanban board (drag and drop), filters (High Priority, High Confidence, Fraud Alert), CSV export, resolution form with an after-photo.
- `AuthPage.jsx`, `AuthContext.jsx`, `firebase.js`: Firebase email and Google sign-in; role and department are chosen on the sign-up form and sent to the backend.
- `i18n.js`: hand-written translation dictionaries for 8 UI languages (en, hi, bn, te, ta, mr, es, fr).
- `api.js`: backend address; default `https://samadhaan-ai.onrender.com`; `?api=` override accepted only for localhost and `*.trycloudflare.com`.

## 3. Dataset (`data/complaints.csv`)

- **Source:** synthetic. Complaint sentences are written inside `data/build_dataset.py` (the data README says they were written by Claude). Every row has `source = synthetic`. No real complaints.
- **Size:** 504 rows = 7 classes x 12 base complaints x 3 languages x 2 versions (the base sentence and the same sentence with one appended suffix sentence). 84 groups.
- **Languages:** English 168, Hinglish (Roman script) 168, Hindi (Devanagari) 168.
- **Classes (7):** Water, Electricity, Roads, Sanitation, Drainage, Street Lights, Unclear. 72 rows each. "Unclear" holds vague complaints and out-of-scope ones (police, ration card, pension, internet, bus service, noise, illegal construction).
- **Split:** train 252, calibration 126, test 126. Per class: 36 / 18 / 18. Per language: 84 / 42 / 42. Decided per (class, base-complaint number) with a seeded shuffle (seed 42): 6 / 3 / 3 base complaints per class. The three language versions and the longer variant of one complaint always share a split; 0 of 84 groups span more than one split.
- **Labels:** the generator's intent. No second labeller, no agreement score (stated in `data/README.md`).
- `data/README.md` says not to report results from this file as project findings.

## 4. Model

- **Checkpoint:** `google/muril-base-cased` (BERT, 12 layers, hidden size 768, vocabulary 197,285), loaded with `AutoModelForSequenceClassification`, 7 labels in this order: Water, Electricity, Roads, Sanitation, Drainage, Street Lights, Unclear.
- **Training (`research/train_muril.py`, defaults, as recorded in `metrics.json`):** 20 epochs, learning rate 5e-5, seed 42, batch size 16, max length 64 (padded to max length), AdamW with weight decay 0.01, linear schedule with 10% warm-up, gradient clipping 1.0, fixed epoch count (no early stopping, no validation set used during training). Trained on the 252 train rows only.
- **Not recorded in any file:** where it was run (the script docstring mentions Colab/Kaggle), GPU used, training loss. The saved config shows `transformers_version` 5.18.0.
- **Confidence:** the top softmax probability. Lines from `thresholds.json`: Low below 0.324515, Medium from 0.324515 to below 0.354948, High at 0.354948 or above. `confidence_score` shown to users is the calibration hit rate of the matching confidence bin, smoothed as (right x n + 1) / (n + 2), from `score_map`.
- **Speech:** faster-whisper. Code default model `tiny`; `backend/.env` (local, not in git) sets `small`, `int8`, 4 threads, language `auto`. Default settings in `asr.py`: Hindi/English choice from Whisper probabilities, voice-activity filter on, beam size 5, no vocabulary prompt.

## 5. Results so far (exact, with source)

**Classifier accuracy** (`research/outputs/muril/metrics.json`)

| | n | accuracy | macro F1 |
|---|---|---|---|
| calibration rows | 126 | 0.8492 | 0.8452 |
| test rows | 126 | 0.8175 | 0.8135 |

**Confidence honesty** (`probs_calibration.csv`, `probs_test.csv` via `calibration_report.py` functions; ECE for calibration is also in `thresholds.json`)
- Top softmax probability ranges only from 0.2178 to 0.4241 (calibration) and 0.2489 to 0.4235 (test).
- ECE: 0.4813 (calibration), 0.4599 (test).
- Equal-count bins, calibration rows: says 0.317 / right 0.731; 0.355 / 0.760; 0.375 / 0.840; 0.386 / 0.920; 0.409 / 1.000 (n = 26, 25, 25, 25, 25).
- Same bins, test rows: says 0.295 / right 0.308; 0.341 / 0.920; 0.365 / 0.960; 0.386 / 0.920; 0.405 / 1.000.

**Routing with the saved thresholds** (`thresholds.json` applied by `calibration_report.apply`)

| | auto (High) | asked a question (Medium) | to a human (Low) | silent errors, share of all | wrong among auto |
|---|---|---|---|---|---|
| calibration | 73.02% | 15.87% | 11.11% | 4.76% | 6.52% |
| test | 55.56% | 26.98% | 17.46% | 1.59% | 2.86% |

The thresholds were chosen on the 126 calibration rows (target silent error 0.05). Graph: `research/outputs/muril/tradeoff.png`.

**Accuracy by language** (`probs_*.csv`): calibration en 0.905, hinglish 0.738, hi 0.905; test en 0.786, hinglish 0.810, hi 0.857.
**Accuracy by class, test:** Street Lights 1.000, Drainage 1.000, Electricity 0.889, Sanitation 0.889, Roads 0.778, Water 0.667, Unclear 0.500.

**20 versus 60 epochs** (from `research/colab_runs/results (2).zip`, trained on Colab; the 20-epoch probability files are byte-identical to `research/outputs/muril/probs_*.csv`)
- 60 epochs: accuracy 0.7698 (calibration) and 0.7937 (test); top softmax probability 0.605 to 0.977 (calibration) and 0.498 to 0.977 (test); mean confidence 0.957 / 0.951; ECE 0.1966 / 0.1671.
- Applying the current `thresholds.json` to the 60-epoch run routes 100% automatically with 23.0% (calibration) and 20.6% (test) silent errors.
- Largest automatic share with silent errors at or below 5% on calibration rows: 73.0% for 20 epochs, 51.6% for 60 epochs (`tradeoff_20_vs_60.png`).
- 40 epochs (`research/outputs/final_e40/metrics.json`, trained on all 252 train rows): accuracy 0.7937 (calibration) and 0.8095 (test), macro F1 0.7844 and 0.8027, final train loss 0.1363; top softmax probability 0.444 to 0.904 (calibration) and 0.552 to 0.904 (test); ECE 0.1073 and 0.1224.
- The app now loads `research/outputs/final_e40/model` and `router_config.json` (made by `research/make_router_config.py` from all 126 calibration rows: `t_high` 0.888406 by the risk-corrected rule, conformal `qhat` 0.977175 at alpha 0.10). `research/outputs/muril/` (20-epoch model, `thresholds.json`) is kept unchanged as a backup and is no longer read. The weights are git-ignored.
- The weights of the 60-epoch run were not downloaded to this computer; `thresholds.json` still belongs to the 20-epoch model.

**Tests:** 25 tests in `backend/tests` (21 in `test_asr.py`, 4 in `test_api.py`). All 25 passed on the last run in this session. They cover audio validation, language choice, raw-transcript handling, error reporting, routing levels, Whisper on synthetic clips, and the upload endpoint on a temporary SQLite database. They do not cover the frontend.

**Speech-recognition results:** no result files are committed. The word error rates quoted in `CivicSense_Research_Proposal.docx` (section 7.3) came from runs of `research/eval_asr.py` on text-to-speech clips and one real recording; the output files of those runs are not in the repository.

## 6. Finished, half-done, not started

**Finished (code exists and was run)**
- Synthetic dataset builder and `complaints.csv`.
- MuRIL fine-tuning script, trained model, saved probabilities, metrics.
- Calibration report: reliability table, thresholds, trade-off graph.
- MuRIL runtime classifier and High/Medium/Low routing.
- Speech stage (`asr.py`), its tests, and `eval_asr.py`.
- Backend API, database models, Firebase login, citizen portal, citizen dashboard, operator Kanban dashboard, 8-language UI text (all implemented; not covered by automated tests).

**Half-done**
- Medium: the citizen is shown the conformal set as buttons plus "None of these". A pick becomes the prediction with confidence `"Confirmed by citizen"`; "none of these" sets confidence `"Low"` for human review. The complaint is not classified again.
- Confidence methods: only raw softmax exists, and it is badly calibrated (ECE above).
- Priority/SLA: Gemini returns a priority; MuRIL does not, so MuRIL-routed complaints always get `Medium` and a 7-day SLA.
- Microphone-settings comparison: the page exists, no recordings from it have been analysed.
- Whisper model size: `small` in the local `.env`; `tiny` is the code default (used on a host with no `.env`); no committed comparison of sizes.
- Gemini fallback path and photo verification: coded; not exercised in this session, and the local `backend/.env` has no Gemini key.
- Proposal document: drafted; team and mentor names are placeholders.

**Not started (no code in the repository)**
- Real complaint data, two-labeller labelling, agreement score.
- Monte Carlo Dropout, Deep Ensembles, conformal prediction.
- IndicBERT; any large-language-model classification comparison (Gemini is used only as a fallback router, not evaluated).
- Bhashini integration.
- Public speech datasets (AI4Bharat, Common Voice) in any evaluation.
- Error-propagation experiment (tool for degrading audio exists; experiment not run).
- Use of the speech recogniser's confidence in the routing decision.
- Severity estimation, location extraction, incident detection (out of scope in the synopsis).

## 7. Hard-coded, faked, or dummy

**Data and results**
- The whole training/calibration/test set is synthetic, written by one author; labels are generator intent.
- Longer "variant" rows are the base sentence plus one fixed suffix, so near-duplicates.
- `tests/fixtures/*.webm` are text-to-speech (gTTS) clips, not human speech.
- The thresholds, `score_map` and the "estimated chance this is right" come from 126 synthetic calibration rows.

**Backend**
- `ai_pipeline.py`: if no Gemini key is set and MuRIL is unavailable, the result is a fake `"Water Department (Mock)"`, Medium, 0.5.
- `muril_classifier.py`: priority is the constant `"Medium"`; the clarifying question is a fixed template ("Is your complaint about X or Y? ...").
- `muril_classifier.py` Medium question text is a fixed sentence ("Which department should handle your complaint? ..."); the options come from the conformal set without the class `Unclear`; if fewer than 2 real departments remain the complaint goes to a human.
- `verify_resolution`: any Gemini failure (including a missing key) returns `valid: False`, so an after-photo resolution is rejected in that case.
- `init_db.py`: drops all tables and inserts 4 mock rows, including a prediction `"Public Works"` and `"Water, Electricity"` that are not among the 7 classes.
- Constants in code: `LABELS` is duplicated in `train_muril.py` and `muril_classifier.py` and must match by hand; `MAX_LEN = 64`; `TARGET_SILENT_ERROR = 0.05`; `N_BINS = 5`; seed 42; SLA of 1/7/14 days; Gemini model name `gemini-flash-latest` (the README says "Gemini 1.5 Flash").

**Access control**
- Role and department are chosen on the sign-up form and the backend stores what the client sends (`/api/users/sync`); any visitor can register as an operator for any department.
- `/api/reset-db` is a public GET endpoint that drops and recreates all tables.
- Most endpoints take no authentication; operator filtering depends on an optional `uid` query parameter.
- Task status lives in an in-memory dict and is lost on restart.

**Frontend**
- Cloudinary cloud name `gd6ovrz6` and upload preset `samadhaan_uploads` are written into `CitizenPortal.jsx` and `OperatorDashboard.jsx`.
- Default backend URL `https://samadhaan-ai.onrender.com` is written into `api.js`.
- `CitizenPortal.jsx` contains a component marked TEMPORARY that shows raw confidence, thresholds and top-3 probabilities (`README_DEMO.md` lists it, and the `?api=` override, for removal after the mentor review).
- The sign-up department list is fixed to six departments (no "Unclear").

**Documentation mismatches**
- `README.md` describes routing by Gemini; the code default is MuRIL when its files are present.
- `README.md` says Supabase PostgreSQL; the code reads `DATABASE_URL` and tests use SQLite.

**Local-only, not in the repository:** `backend/.env` (keys: `DATABASE_URL`, `WHISPER_MODEL`, `WHISPER_COMPUTE`, `WHISPER_THREADS`, `WHISPER_LANGUAGE`, `KEEP_AUDIO`; there is no `GEMINI_API_KEY` in it, so on this machine the Gemini fallback and Gemini photo verification cannot work), `frontend/.env.local`, the MuRIL weights, `backend/demo.db`, `backend/temp_audio/`.

## Router config and first application to the test rows (2026-11-15)

- `router_config.json` (in `research/outputs/final_e40/`): `t_high` 0.888406 (5 wrong among 47.6% auto-routed calibration rows; (5+1)/(126+1) <= 0.05), `qhat` 0.977175.
- Applied to the 126 test rows of `final_e40` (seed 42) through `backend/muril_classifier.build_result`, in two versions of the rule. The test rows of this seed had already been seen earlier (training reports, temperature scaling, the conformal `--final_test` run), so neither is a fresh held-out result.

| | auto | asked | human | silent error (share of all rows) | true department among the offered options |
|---|---|---|---|---|---|
| Version 1: the options are the whole conformal set (can include `Unclear`) | 39.7% (50) | 43.7% (55) | 16.7% (21) | 0.8% (1/126; 2.0% of auto-routed) | 53 of 55 (96.4%) |
| Version 2 (current): `Unclear` removed from the options, fewer than 2 real departments -> human | 39.7% (50) | 43.7% (55) | 16.7% (21) | 0.8% (1/126; 2.0% of auto-routed) | 50 of 55 (90.9%) |

- Why the rule changed: for a design reason (`Unclear` is not a department, so it should not be a button), decided before the second application to the test rows and not because of any test result. Auto share and silent error cannot be affected by it: High is decided by `t_high` alone, before the options are built. Here the asked and human shares did not move either, because every asked test row still had at least 2 real departments. The only number that changed is the last column: in 3 of the 55 asked rows the true class was `Unclear`, which the citizen can no longer pick (they would press "None of these", which goes to a human).
- This second application used the test rows a second time; no further use is planned for this seed.
