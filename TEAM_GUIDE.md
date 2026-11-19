# CivicSense / Samadhaan.ai: guide for the team

For a teammate who works on the model and wants to understand and extend the whole project. Read this file first, then follow the reading order below.

## 1. What the project does

A citizen reports a municipal problem by voice (Hindi or English, chosen in the portal) or by typing. The system turns speech into text, classifies the complaint into 6 departments plus an "Unclear" class, and **routes it using how sure the model is**:

| step | condition | result |
|---|---|---|
| 1 Auto-route | the model's top probability is at least **0.888406** (`t_high`) | sent to the department automatically |
| 2 Ask the citizen | otherwise, the **conformal list** (every department with probability at least 1 - `qhat`, about 2.3%) has **2 or 3** departments | the citizen picks one of them (or "None of these") |
| 3 Human | anything else (list of 0, 1, or 4+) | an operator decides, with the model's top 3 guesses |

- "Unclear" is never offered as a button. A complaint the model calls Unclear with high confidence is auto-routed with the message "we couldn't match this to a department; an operator will review it". The class mixes **vague** and **out-of-scope** complaints and the model cannot tell them apart.
- `t_high` is found on the 126 calibration rows so that wrong auto-routes stay at most 5% of all rows (with a +1 safety margin: (wrong + 1) / (n + 1) <= 5%). `qhat` comes from split conformal prediction at alpha 0.10 (the correct department is kept in the list for about 90% of complaints).
- Both numbers live in `research/outputs/final_e40/router_config.json`, made by `research/make_router_config.py`.

## 2. Where things are

| part | files |
|---|---|
| Speech to text (faster-whisper) | `backend/asr.py`, `backend/ai_pipeline.py` |
| Classifier and routing rule | `backend/muril_classifier.py` (reads `router_config.json`) |
| API (upload, typed text, clarify, dashboard data) | `backend/main.py`, `backend/models.py` |
| Citizen portal and operator dashboard | `frontend/src/pages/CitizenPortal.jsx`, `OperatorDashboard.jsx` |
| Training | `research/train_muril.py` (flags `--epochs --seed --val_groups --mc_dropout --out`) |
| Routing experiments | `research/conformal.py`, `compare_methods.py`, `temperature_scaling.py`, `calibration_report.py` (old two-line design), `make_router_config.py` |
| Data (synthetic, 504 rows, 84 groups, split 252 / 126 / 126 by group) | `data/complaints.csv`, `data/README.md`, `data/LABELLING_GUIDE.md`, `data/build_dataset.py` |
| Speech evaluation | `research/eval_asr.py`, `research/mic_ab_test.html`, `backend/benchmark_whisper.py` |
| End-to-end check of the running app | `research/demo_check/` (`REPORT.md` has the results) |
| Tests | `backend/tests/`, `research/tests/` |
| Facts and numbers | `PROJECT_STATE.md`, `README_DEMO.md`, `CivicSense_Research_Proposal.docx` |

## 3. Reading order

1. This file, then `PROJECT_STATE.md` (what is built, what is faked, with numbers).
2. `data/README.md` and `data/LABELLING_GUIDE.md` (what the 7 classes mean).
3. `research/train_muril.py`, then `research/conformal.py` and `research/make_router_config.py`, then `backend/muril_classifier.py`.
4. `research/compare_methods.py` (the six routing methods compared on one protocol) and `research/demo_check/REPORT.md`.
5. `README_DEMO.md` (running the demo).

## 4. Setting up (once)

1. Get added as a collaborator on the GitHub repo, then clone it.
2. Follow "One-time setup" in `README_DEMO.md` (virtual environment **outside OneDrive**; the global Python on Siddharth's laptop has a broken torch). For training and research scripts also run `pip install -r research/requirements.txt`.
3. Copy `backend/.env.example` to `backend/.env`.
4. Ask Siddharth for the **files that are not in git** (section 5) and put them at the same paths.
5. Run the demo: `powershell -ExecutionPolicy Bypass -File start_demo.ps1 -Local`, then open http://localhost:5173. Login is disabled without Firebase values, which is fine for model work.
6. Run the tests: `cd backend && python -m pytest -q` (49 tests) and `python research/tests/test_conformal.py`, `test_compare_methods.py`, `test_temperature_scaling.py`.

## 5. Files that are NOT in git (Siddharth shares them)

| what | path | size | needed for |
|---|---|---|---|
| Fine-tuned 40-epoch model: `config.json`, `model.safetensors`, `tokenizer.json`, `tokenizer_config.json` | `research/outputs/final_e40/model/` | about 0.95 GB | running the app, the classifier test |
| Result zips of the seed runs (probabilities only): `default_runs_e20_e40.zip` (epochs 20 and 40, seeds 42-46), `mc_runs_e40.zip` (epoch 40, seeds 42-46, with MC dropout), `final_e40_results.zip`, `results (2).zip` (20 vs 60 epochs) | `research/colab_runs/` (unzip next to the zips) | under 1 MB | re-running `compare_methods.py` on the five seeds |
| Firebase values (only if you need login or the operator dashboard) | `frontend/.env.local` | tiny | login; share privately, never commit |

Downloaded automatically on first use: Whisper `small` (0.5 GB) from Hugging Face, and `google/muril-base-cased` when you train.

## 6. Doing model work

**Training runs on Colab (free T4 GPU), not on the laptop.**
1. Runtime > Change runtime type > T4 GPU. Check `import torch; torch.cuda.is_available()` prints `True`.
2. Upload `research/train_muril.py` to `/content/proj/research/` and `data/complaints.csv` to `/content/proj/data/`; `pip install -q sentencepiece`.
3. `cd /content/proj && python research/train_muril.py --epochs 40 --seed 42 --out research/outputs/<name>`
4. Zip the small files (`probs_*.csv`, `metrics.json`) without the `model/` folder and download them. Colab loses everything if the session expires, so download as you go.

**Rules we agreed on (please keep them):**
- Decide with calibration rows or `--val_groups` validation, **never with test rows**. Write the decision rule down before looking at results.
- The test rows of seed 42 have already been seen several times, so they are not a clean test any more. A fresh held-out set is needed before claiming final numbers.
- The main model is the 40-epoch one (chosen by validation loss). 20 and 60 epochs are ablations.
- Never edit `router_config.json` by hand; rebuild it with `python research/make_router_config.py <run_dir> --force` and commit both.
- Report averages **and spread over seeds**; one seed is not enough (one seed made 20 epochs look better routed than 40, five seeds showed no difference).

## 7. Honest status

- Accuracy about 0.80 (five seeds), ECE about 0.11 for the 40-epoch model; silent errors on held-out halves are about 6-7%, so the 5% target is **not** reliably met. Hinglish is the weakest language (about 13% silent errors against about 3% for English).
- Seed 42, test rows: auto 39.7%, asked 43.7%, human 16.7%, silent error 0.8% (1 of 126; not a fresh result).
- Speech: `small` answers in about 3 s per complaint, `large-v3-turbo` in about 10 s (too slow for the live demo). Hindi word error rate on real speech is not measured.
- The data is synthetic (written by Claude and generated by `data/build_dataset.py`).

## 8. Where you can pick up

1. **Real data and a fresh test set.** The biggest gap. Collect real complaints (`KEEP_AUDIO=1` keeps recordings), label them with `data/LABELLING_GUIDE.md`, hold a test set aside.
2. **Hinglish.** More Hinglish data, noisy/ASR-error variants in training, or a per-language threshold.
3. **Split "Unclear"** into "vague" and "out of scope": relabel, retrain, update the portal message and the operator label.
4. **Silent errors.** More calibration data; the seed ensemble and MC dropout were the best methods but cost 5x and 20x compute.
5. **Speech evaluation.** Run `research/mic_ab_test.html`, measure Hindi word error rate on real recordings with `research/eval_asr.py`, try Bhashini or IndicBERT-based options.

## 9. Git rules

- Work on a branch from `main` and open a pull request. Siddharth reviews.
- Never commit `backend/.env`, `frontend/.env.local`, model weights, `research/colab_runs/`, or `backend/temp_audio/` (real recordings).
- Run the backend and research tests before pushing.
- Machine notes: C: is nearly full on Siddharth's laptop (do not download large models casually); the project is inside OneDrive, so keep virtual environments outside it.
