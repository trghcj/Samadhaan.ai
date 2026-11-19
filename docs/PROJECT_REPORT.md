# Samadhaan.ai — Project Technical Report

**Project:** Samadhaan.ai (CivicSense) — an uncertainty-aware, multilingual system for routing civic grievances
**Repositories:** `github.com/trghcj/Samadhaan.ai` (deployed) and `github.com/Vauxhall870/CivicSense` (development); both carry the same `main` branch
**Report date:** 19 November 2026

---

## Contents

1. [Overview](#1-overview)
2. [System architecture](#2-system-architecture)
3. [Servers and hosting](#3-servers-and-hosting)
4. [Backend](#4-backend)
5. [API reference](#5-api-reference)
6. [Database](#6-database)
7. [AI and processing pipeline](#7-ai-and-processing-pipeline)
8. [Frontend](#8-frontend)
9. [External services](#9-external-services)
10. [Libraries and packages](#10-libraries-and-packages)
11. [Configuration and environment variables](#11-configuration-and-environment-variables)
12. [Running locally](#12-running-locally)
13. [Testing and quality checks](#13-testing-and-quality-checks)
14. [Research and data](#14-research-and-data)
15. [Security notes and known limitations](#15-security-notes-and-known-limitations)
16. [Repository layout](#16-repository-layout)

---

## 1. Overview

Citizens report civic problems (water supply, electricity, roads, sanitation, drainage, street lights) by speaking or typing in Hindi, English or Hinglish. The system transcribes speech, classifies the complaint into a department with a calibrated confidence level, and routes it:

| Confidence | What happens |
|---|---|
| **High** | Routed automatically to the predicted department. |
| **Medium** | The citizen is shown the two or three most likely departments and picks one (or "None of these"). |
| **Low / Unclear** | Sent to a human officer for review. |

Operators work from a department-scoped complaint register, see the location on a map, can translate Hindi complaints into English, and close complaints with an "after" photo that is checked against the citizen's "before" photo.

---

## 2. System architecture

```
                     +-------------------------------+
   Citizen /         |  Frontend (React 19 + Vite)   |      Firebase Authentication
   Operator  ----->  |  Vercel  /  localhost:5173    | <--> (email + Google sign-in)
   browser           +-------------------------------+
                        |  REST (JSON, multipart)   \
                        |                             \---> Cloudinary (photo upload, unsigned)
                        |                              \--> OpenStreetMap tiles + Nominatim (map, address)
                        v                               \-> Google Translate web endpoint (operator translation)
                     +-------------------------------+
                     |  Backend (FastAPI + Uvicorn)  |
                     |  Render  /  localhost:8000    |
                     |                               |
                     |  faster-whisper (speech)      |
                     |  MuRIL classifier (routing)   |----> Google Gemini (fallback classifier,
                     |  BackgroundTasks + polling    |      before/after photo verification)
                     +-------------------------------+
                        |  SQLAlchemy
                        v
                     +-------------------------------+
                     |  PostgreSQL (Supabase)        |
                     |  SQLite for tests / offline   |
                     +-------------------------------+
```

**Request flow for a spoken complaint**

1. The browser records audio with `MediaRecorder` (WebM/Opus) and uploads the optional photo to Cloudinary directly.
2. It posts the recording and form fields to `POST /api/upload` and receives a `task_id` immediately.
3. A FastAPI background task decodes the audio, transcribes it with Whisper, classifies it with MuRIL, computes the SLA deadline and saves the row.
4. The browser polls `GET /api/status/{task_id}` every 2 seconds and shows the result (routed, choose a department, or sent to an officer).
5. For a Medium result, the citizen's choice is sent with `PATCH /api/grievances/{id}/clarify`.

Typed complaints follow the same path through `POST /api/submit-text`, without the speech stage.

---

## 3. Servers and hosting

| Component | Production | Local development |
|---|---|---|
| Frontend | Vercel (static build of `frontend/`), connected to `trghcj/Samadhaan.ai` `main` | Vite dev server, `http://localhost:5173` |
| Backend | Render Web Service, `https://samadhaan-ai.onrender.com`, connected to `trghcj/Samadhaan.ai` `main` | Uvicorn, `http://127.0.0.1:8000` |
| Database | Supabase PostgreSQL (session pooler, port 5432) | Same Supabase database, or SQLite (`sqlite:///demo.db`) |
| Authentication | Firebase Authentication | Same Firebase project |
| Images | Cloudinary (cloud `gd6ovrz6`, unsigned preset `samadhaan_uploads`) | Same |
| Demo tunnel | — | `cloudflared` quick tunnel (`start_demo.ps1` without `-Local`) |

**Deployment.** Both Vercel and Render redeploy automatically when `main` of `trghcj/Samadhaan.ai` changes. The development repository `Vauxhall870/CivicSense` is kept in sync by pushing the same commits.

**Production caveat.** The Render free instance has 512 MB of memory, too little for PyTorch and the MuRIL model, so the deployed backend runs without MuRIL. It then uses Gemini if `GEMINI_API_KEY` is set, otherwise a mock result ("Water Department (Mock)"). Full routing is demonstrated on a laptop (`start_demo.ps1 -Local`).

**Vercel configuration.**
- Root `vercel.json` sets `Cross-Origin-Opener-Policy: same-origin-allow-popups` so the Google sign-in popup works.
- `frontend/vercel.json` rewrites every path to `/` for client-side routing.

---

## 4. Backend

**Stack:** Python 3.13 (3.11+ supported), FastAPI, Uvicorn, SQLAlchemy 2, Pydantic 2.

| File | Responsibility |
|---|---|
| `main.py` | FastAPI app, CORS, all HTTP endpoints, background task dispatch, in-memory task tracker, model preloading at startup |
| `ai_pipeline.py` | Spoken/typed processing, classification (MuRIL, Gemini fallback, mock), SLA calculation, database save, Gemini before/after photo verification |
| `asr.py` | Audio decoding and validation (empty, corrupted, too short, silent), Whisper language choice (Hindi/English), transcription settings |
| `muril_classifier.py` | Loads the fine-tuned MuRIL model and `router_config.json`; returns department, confidence level, conformal set and options |
| `location.py` | Validation of map pin and address lines (`parse_place`) |
| `schema_sync.py` | Adds new model columns to an existing table at startup (`create_all` never alters tables) |
| `models.py` | SQLAlchemy models `Grievance` and `User` |
| `database.py` | Engine and session from `DATABASE_URL` (loads `backend/.env`) |
| `benchmark_whisper.py` | Speed comparison of Whisper model sizes |
| `init_db.py`, `migrate_db.py` | Legacy helpers: reset with mock data / add two old columns (not used by the app) |
| `debug_gemini.py`, `test_model.py` | Manual Gemini connectivity checks |

**Startup sequence.**
1. Load `.env`.
2. `create_all` creates missing tables.
3. `add_missing_columns` adds any new `grievances` columns.
4. A background thread preloads Whisper and MuRIL and runs one dummy prediction (skip with `PRELOAD_MODELS=0`).

**Asynchronous processing.**
- Long work runs in FastAPI `BackgroundTasks`; there is no queue server (no Celery or Redis).
- Progress and results live in an in-process dictionary (`task_tracker`), read by `GET /api/status/{task_id}`.
- Progress steps reported to the client: "Transcribing audio...", "Classifying with MuRIL...", "Saving grievance to database...", and "Downloading and loading audio model..." on the first run.

**SLA rule.** Priority High gives 1 day, Medium 7 days, Low 14 days. MuRIL does not estimate priority and always returns Medium (7 days); the Gemini path estimates priority.

**CORS.** All origins, methods and headers are allowed.

---

## 5. API reference

Base URL: `https://samadhaan-ai.onrender.com` (production) or `http://localhost:8000` (local). Interactive documentation is generated by FastAPI at `/docs` (Swagger UI) and `/redoc`. No endpoint requires authentication (see section 15).

### Summary

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Health check and model readiness |
| POST | `/api/upload` | Submit a spoken complaint (audio file) |
| POST | `/api/submit-text` | Submit a typed complaint |
| GET | `/api/status/{task_id}` | Poll the result of a submission |
| PATCH | `/api/grievances/{g_id}/clarify` | Citizen picks a department for a Medium-confidence complaint |
| GET | `/api/grievances` | Complaint list for the operator register (department-scoped) |
| GET | `/api/grievances/me/{uid}` | A citizen's own complaints |
| PATCH | `/api/grievances/{g_id}/resolve` | Operator resolves a complaint (optional photo verification) |
| DELETE | `/api/grievances/{g_id}` | Delete a complaint |
| POST | `/api/users/sync` | Create or update the user record after Firebase sign-in |
| GET | `/api/reset-db` | Drop and recreate all tables (maintenance only; destructive) |

### Details

**`GET /`**
Response: `{"message": "...", "status": "ok", "models_ready": {"speech": bool, "classifier": bool}}`

**`POST /api/upload`** — `multipart/form-data`

| Field | Required | Notes |
|---|---|---|
| `file` | yes | Audio (`.webm`, `.wav`, `.mp3`, `.m4a`, `.ogg`, `.mp4`, `.flac`); the client filename is never used as a path |
| `language` | no | `hi`, `en` or `auto` (default) |
| `user_id` | no | Firebase UID of a signed-in citizen |
| `reporter_name`, `reporter_phone` | no | For anonymous reports |
| `location` | no | Area / village |
| `extra_details` | no | Free text |
| `before_photo_url` | no | Cloudinary URL |
| `latitude`, `longitude` | no | Both or neither; −90..90 and −180..180 |
| `address_line`, `landmark` | no | Trimmed, at most 200 characters |
| `pincode` | no | Exactly 6 digits |

Response: `{"task_id": "<uuid>", "status": "processing"}`. Invalid language or location fields return HTTP 400.

**`POST /api/submit-text`** — `multipart/form-data`; the same fields as `/api/upload`, with `text` (required, at most 1000 characters) in place of `file` and `language`. Response as above. An empty or over-long text returns 400.

**`GET /api/status/{task_id}`**
- While working: `{"status": "processing", "step": "Transcribing audio..."}`
- On success: `{"status": "success", "ai_result": {...}}`, where `ai_result` contains:
  - `id`, `prediction_set`, `confidence_level` (`High` / `Medium` / `Low`), `confidence_score`
  - for Medium: `options` and `clarifying_question`
  - `transcript`, `input` and diagnostic fields
- On failure: `{"status": "error", "error": "<readable reason>"}`

**`PATCH /api/grievances/{g_id}/clarify`** — JSON `{"choice": "<department>" | "none_of_these"}`
- A department: sets `prediction` to the choice and `confidence` to `Confirmed by citizen`. Response `{"status": "success", "outcome": "confirmed", "prediction": "..."}`.
- `none_of_these`: sets `confidence` to `Low`. Response `{"status": "success", "outcome": "human_review"}`.
- In both cases a line `[Citizen Clarification]: ...` is appended to the stored transcript.
- Errors: 404 unknown id, 409 not awaiting clarification, 400 a choice that was not offered.

**`GET /api/grievances?uid=<firebase uid>`**
- Returns all grievance rows, newest first.
- If `uid` belongs to an operator whose department is not `All Departments`, only that department's rows are returned.

**`GET /api/grievances/me/{uid}`** — the grievances whose `citizen_uid` equals `uid`, newest first.

**`PATCH /api/grievances/{g_id}/resolve`** — JSON `{"resolution_notes": str, "after_photo_url": str | null}`
- With a photo URL, Gemini compares the before and after photos.
  - If rejected: `ai_verification_status = "Rejected"`, response `{"status": "error", "message": "...", "reason": "..."}`, and the complaint stays open.
  - Otherwise: the row is marked resolved with `resolved_at`, response `{"status": "success", "ai_verification": "..."}`.

**`DELETE /api/grievances/{g_id}`** — `{"status": "success"}`, or `{"error": "Not found", "status": 404}`.

**`POST /api/users/sync`** — JSON `{"uid", "email", "display_name", "role": "citizen" | "operator", "department"}`
- Creates the user on first sign-in. On later sign-ins it updates email, name and last login but never changes role or department.
- Response `{"status": "success", "role": "...", "department": "..."}`.

**`GET /api/reset-db`** — drops and recreates every table. Kept from early development; must not be called against the shared database.

---

## 6. Database

**Engine.** PostgreSQL on Supabase in production, reached through `DATABASE_URL` (`postgresql://...`) with the `psycopg2-binary` driver. Any SQLAlchemy URL works, and tests use a temporary SQLite file.

**Schema management.**
- `Base.metadata.create_all` creates missing tables at startup.
- `schema_sync.add_missing_columns` then issues `ALTER TABLE ... ADD COLUMN` for model columns that the live table lacks.
- New columns are nullable, so older deployments keep working against the same database.

### Table `grievances`

| Column | Type | Meaning |
|---|---|---|
| `id` | Integer, PK | Shown to users as `#000123` |
| `transcript` | String | Complaint text as spoken or typed (never translated); a citizen clarification line may be appended |
| `prediction` | String | Department (`Water`, `Electricity`, `Roads`, `Sanitation`, `Drainage`, `Street Lights`) or `Unclear` |
| `confidence` | String | `High`, `Medium`, `Low` or `Confirmed by citizen` |
| `confidence_score` | Float | Calibrated estimate that the routing is right |
| `clarifying_question` | String, null | Set while waiting for the citizen's department choice |
| `alternative_departments` | String, null | Comma-separated departments offered to the citizen |
| `citizen_uid` | String, null, indexed | Firebase UID of the reporter |
| `reporter_name`, `reporter_phone` | String, null | Anonymous reporter details |
| `location` | String, null | Area / village |
| `extra_details` | String, null | Additional notes |
| `latitude`, `longitude` | Float, null | Map pin (WGS84) |
| `address_line`, `landmark`, `pincode` | String, null | Address lines |
| `before_photo_url`, `after_photo_url` | String, null | Cloudinary URLs |
| `priority` | String | `High`, `Medium` or `Low` |
| `sla_deadline` | DateTime, null | Due date (UTC) |
| `ai_verification_status` | String | `Pending`, `Verified` or `Rejected` |
| `ai_verification_notes` | String, null | Reason from photo verification |
| `is_resolved` | Boolean | Closed by an operator |
| `resolution_notes` | String, null | Officer's note to the citizen |
| `resolved_at` | DateTime, null | Closing time |
| `created_at` | DateTime | Submission time (UTC) |

### Table `users`

| Column | Type | Meaning |
|---|---|---|
| `uid` | String, PK | Firebase UID |
| `email` | String, unique | |
| `display_name` | String, null | |
| `role` | String | `citizen` or `operator` |
| `department` | String, null | Operator's department, or `All Departments` |
| `created_at`, `last_login` | DateTime | |

**Connection settings.** `backend/database.py` creates the engine from `DATABASE_URL` and loads `backend/.env` first. For Supabase, use the session pooler connection string on port 5432 and URL-encode special characters in the password.

---

## 7. AI and processing pipeline

### Speech to text (`asr.py`)

- **Engine:** `faster-whisper` 1.2.1 on CPU, model set by `WHISPER_MODEL`.
  - The code default is `tiny`, suited to a small server.
  - The local demo uses `small` with `int8` and 4 threads: about 3 s per complaint.
- **Audio validation:** the recording is decoded to 16 kHz mono. Empty, corrupted, too short or silent recordings are rejected with a readable message.
- **Language:** the citizen's choice (Hindi or English) is used when given. Otherwise Whisper's own detection chooses between Hindi and English.
- **Decoding:** beam size 5 and a voice-activity filter. The transcript is stored exactly as recognised.
- **Version pin:** PyAV is kept below 19, because PyAV 19 removed an argument that faster-whisper 1.2.1 passes.

### Department classification (`muril_classifier.py`)

- **Model:** `google/muril-base-cased`, fine-tuned on the project dataset (40 epochs) into 7 classes: the six departments plus `Unclear`. Inference takes about 0.06 s per complaint on a laptop CPU after a 6 s model load.
- **Routing settings:** read from `research/outputs/final_e40/router_config.json`, with threshold `t_high = 0.888` and conformal quantile `qhat = 0.977` at `alpha = 0.1`. The threshold was chosen so that at most 5% of automatic routes are wrong on the calibration set.
  - **High:** top probability at or above `t_high`. Routed automatically.
  - **Medium:** the conformal set holds 2 or 3 departments. The citizen chooses; `Unclear` is never offered as a choice.
  - **Low:** any other case. Sent to an officer, with the top three departments recorded.
- **Unclear with High confidence** is shown as "Out of scope": the complaint fits none of the departments.
- **Model weights:** about 950 MB, not stored in git. Place them locally and point `MURIL_MODEL_DIR` at the folder.

### Fallbacks

- `CLASSIFIER=gemini`, or no MuRIL weights available: Google Gemini (`gemini-flash-latest`) classifies the complaint, estimates priority and writes a clarifying question.
- No `GEMINI_API_KEY` either: a mock result is returned so the pipeline still completes.

### Photo verification

When an operator resolves a complaint with an "after" photo, Gemini compares it with the citizen's "before" photo. A rejection keeps the complaint open and moves it to the operator's "Flagged" tab.

---

## 8. Frontend

**Stack:** React 19, Vite 8, React Router 7, plain CSS (design tokens in `index.css`), lucide-react icons. No UI framework.

### Routes

| Path | Page | Access |
|---|---|---|
| `/` | Citizen portal (record or type a complaint) | Everyone; operators are redirected to `/operator` |
| `/auth` | Sign in / sign up (email and Google) | Everyone |
| `/dashboard` | My complaints (citizen) | Signed-in citizens |
| `/operator` | Complaint register (operator) | Signed-in operators |

### Main modules

| File | Responsibility |
|---|---|
| `App.jsx` | Router, protected routes, header (logo, navigation, language menu, account menu) |
| `contexts/AuthContext.jsx` | Firebase session; syncs the user to `/api/users/sync` and exposes role and department |
| `api.js` | Backend base URL: `?api=` override (localhost or `*.trycloudflare.com` only), then `VITE_API_URL`, then the Render URL |
| `pages/CitizenPortal.jsx` | Recording, language choice, typed input, details form with map pin and address, photo upload, polling, department choice screen, confirmation with reference number |
| `pages/CitizenDashboard.jsx` | Stat tiles, search, filter, sort, complaint cards with progress tracker (Submitted, With department, Resolved), details modal, delete |
| `pages/OperatorDashboard.jsx` | Complaint register: stat tiles, tabs (Open, In progress, Flagged, Resolved), routing filter, search, table sorted by deadline, ticket panel with map, translation, start work and resolve with photo, CSV export |
| `pages/AuthPage.jsx` | Email/password and Google sign-in; role and department chosen at sign-up |
| `components/LocationPicker.jsx` | Editable map: "Use my current location", draggable pin, tap to place, address lookup |
| `components/LocationView.jsx` | Read-only map, address block, "Open in Google Maps" |
| `components/TranslateBox.jsx` | "Translate to English" for operators |
| `components/PageLayout.jsx` | Shared page header and stat tiles |
| `components/Logo.jsx` | SVG logo (also `public/logo.svg` favicon) |
| `utils/grievance.js` | Department icons and colours, reference format, transcript and clarification parsing, routing labels, SLA texts |
| `utils/geo.js` | Map constants, Google Maps link, Nominatim reverse geocoding |
| `utils/translate.js` | Google Translate request |
| `i18n.js`, `locales/*.js` | Translations |

### Internationalisation

- **Languages:** 8 — English, Hindi, Bengali, Telugu, Tamil, Marathi, Spanish and French, with 236 strings each.
- **Keys:** the English text. Missing entries fall back to English.
- **Persistence:** the chosen language is kept in local storage, and `<html lang>` follows it.
- **Check:** `npm run check:i18n` lists strings used in the code that a language lacks.
- **Complaint text is not translated:** it stays as entered. Operators can request an English translation per complaint.

### State kept in the browser

- **"In progress" marks** on the operator register are stored in local storage, so they are per browser rather than shared between operators.
- **Language choice** and the optional **backend override** are stored the same way.

---

## 9. External services

| Service | Used for | Where configured | Key needed |
|---|---|---|---|
| Firebase Authentication | Email/password and Google sign-in | `frontend/.env.local` (`VITE_FIREBASE_*`) | Firebase web config |
| Supabase PostgreSQL | Main database | `backend/.env` `DATABASE_URL` | Database password |
| Cloudinary | Before/after photo storage (unsigned upload from the browser) | Cloud name and preset in `CitizenPortal.jsx` and `OperatorDashboard.jsx` | No secret (unsigned preset) |
| Google Gemini | Fallback classification and photo verification | `backend/.env` `GEMINI_API_KEY` | API key |
| OpenStreetMap tiles | Map display (Leaflet) | `utils/geo.js` | No |
| Nominatim (OpenStreetMap) | Address from map pin | `utils/geo.js` | No (fair-use limit, about 1 request/s) |
| Google Translate web endpoint | Operator "Translate to English" | `utils/translate.js` | No (unofficial endpoint) |
| Google Maps | "Open in Google Maps" directions link | `utils/geo.js` | No |
| Hugging Face Hub | First download of Whisper models | Automatic | No (optional `HF_TOKEN`) |

---

## 10. Libraries and packages

### Backend — `backend/requirements.txt` (production)

| Package | Version in use | Purpose |
|---|---|---|
| fastapi | 0.165.0 | Web framework and API |
| uvicorn | 0.54.0 | ASGI server |
| sqlalchemy | 2.1.9 | ORM and database access |
| psycopg2-binary | 2.9.13 | PostgreSQL driver |
| pydantic | 2.14.3 | Request and response models |
| python-multipart | 0.0.34 | Multipart form parsing (audio uploads) |
| faster-whisper | 1.2.1 | Speech recognition (CTranslate2 Whisper) |
| av | 18.1.0 (pinned `<19`) | Audio decoding (PyAV / FFmpeg) |
| requests | 2.34.2 | HTTP calls to Gemini and image downloads |
| python-dotenv | 1.2.4 | Loads `backend/.env` |

Installed with them (selected): ctranslate2 4.9.0, onnxruntime 1.32, tokenizers 0.23, huggingface-hub 2.4, numpy 2.5.5, starlette 1.10.

### Backend — `backend/requirements-muril.txt` (local MuRIL classifier)

| Package | Version in use | Purpose |
|---|---|---|
| torch | 2.15.0 (CPU build) | Model inference |
| transformers | 5.23.0 | MuRIL model and tokenizer |
| sentencepiece | 0.2.3 | Tokenizer support |
| numpy | 2.5.5 | Probability and conformal-set computation |

### Backend — `backend/requirements-dev.txt`

| Package | Version in use | Purpose |
|---|---|---|
| pytest | 9.2.0 | Test runner |
| httpx | 0.28.1 | Required by FastAPI's `TestClient` |

### Frontend — `frontend/package.json`

| Package | Version in use | Purpose |
|---|---|---|
| react, react-dom | 19.2.8 | UI library |
| react-router-dom | 7.18.2 | Client-side routing |
| firebase | 12.17.1 | Authentication |
| i18next | 26.4.0 | Translation engine |
| react-i18next | 17.0.12 | React bindings for i18next |
| i18next-browser-languagedetector | 8.2.1 | Remembers and detects the language |
| leaflet | 1.9.4 | Maps |
| react-leaflet | 5.0.0 | React bindings for Leaflet |
| lucide-react | 1.31.0 | Icons |
| vite (dev) | 8.2.1 | Dev server and build |
| @vitejs/plugin-react (dev) | 6.0.5 | React support for Vite |
| oxlint (dev) | 1.78.0 | Linting |
| @types/react, @types/react-dom (dev) | 19.x | Editor type hints |

### Research — `research/requirements.txt`

Used only by the training and evaluation scripts (see section 14): torch, transformers, scikit-learn (metrics), numpy, sentencepiece, jiwer (speech-recognition word error rate) and faster-whisper.

### Tooling

| Tool | Purpose |
|---|---|
| Node.js 22 / npm 11 | Frontend build |
| Python 3.11+ (3.13 used locally) | Backend |
| PowerShell (`start_demo.ps1`) | One-command local demo |
| cloudflared (optional) | Public tunnel to a laptop backend |

---

## 11. Configuration and environment variables

### `backend/.env` (git-ignored; template in `backend/.env.example`)

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost/samadhaanai` | SQLAlchemy URL; Supabase in production, `sqlite:///demo.db` for offline use |
| `GEMINI_API_KEY` | empty | Enables the Gemini fallback classifier and photo verification |
| `WHISPER_MODEL` | `tiny` | Whisper size (`tiny`, `small`, `medium`, `large-v3-turbo`) |
| `WHISPER_COMPUTE` | `default` | CTranslate2 compute type (`int8` recommended on CPU) |
| `WHISPER_THREADS` | `1` | CPU threads for Whisper |
| `WHISPER_LANGUAGE` | `auto` | Force `hi` or `en`, or let Whisper choose |
| `WHISPER_LANGUAGES` | `hi,en` | Languages Whisper may choose between |
| `WHISPER_VAD` | `1` | Voice-activity filter on/off |
| `WHISPER_PROMPT` | empty | Optional vocabulary hint |
| `CLASSIFIER` | `muril` | `muril` or `gemini` |
| `MURIL_MODEL_DIR` | from `router_config.json` | Folder with the MuRIL weights |
| `MURIL_ROUTER_CONFIG` | `research/outputs/final_e40/router_config.json` | Routing thresholds |
| `PRELOAD_MODELS` | `1` | Load models at startup (`0` loads on first use) |
| `KEEP_AUDIO` | unset | `1` keeps uploaded recordings in `backend/temp_audio` |

### `frontend/.env.local` (git-ignored)

| Variable | Meaning |
|---|---|
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID` | Firebase web configuration |
| `VITE_API_URL` | Backend URL (`http://localhost:8000` locally; defaults to the Render URL) |

On Vercel, set the `VITE_FIREBASE_*` variables in the project settings. Add the Vercel domain to Firebase Authentication's authorised domains.

---

## 12. Running locally

**Requirements:** Python 3.11+, Node.js 20+, Git. Optional: the MuRIL weights folder and `cloudflared`.

```powershell
# Backend
python -m venv backend\venv
backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
# For MuRIL routing (CPU build of PyTorch first keeps the download small)
backend\venv\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cpu
backend\venv\Scripts\python.exe -m pip install -r backend\requirements-muril.txt
copy backend\.env.example backend\.env      # then edit DATABASE_URL etc.

# Frontend
cd frontend
npm install
# create frontend\.env.local with the Firebase values and VITE_API_URL=http://localhost:8000
cd ..

# Start both (opens the site on localhost)
.\start_demo.ps1 -Local
```

Manual start: run `uvicorn main:app --reload` in `backend` (port 8000) and `npm run dev` in `frontend` (port 5173).

The first start downloads the Whisper model (about 460 MB for `small`). The browser asks for microphone and location permission once.

---

## 13. Testing and quality checks

| Check | Command | Covers |
|---|---|---|
| Backend tests | `backend\venv\Scripts\python.exe -m pytest backend/tests -q` | Upload errors and paths, ASR validation, routing rules, location validation and storage, startup column sync. Current result: 64 passed, 1 skipped (the skip needs the MuRIL weights at the path in `router_config.json`) |
| Frontend build | `npm run build` (in `frontend`) | Compiles the production bundle |
| Lint | `npm run lint` | oxlint rules |
| Translations | `npm run check:i18n` | Every UI string present in all 8 languages |

Tests never touch the shared database. `tests/conftest.py` points `DATABASE_URL` at a temporary SQLite file and disables model preloading.

---

## 14. Research and data

| Path | Content |
|---|---|
| `data/complaints.csv` | 504 labelled complaints (Hindi, English, Hinglish) with department, language, source and train/calibration/test split |
| `data/build_dataset.py`, `data/LABELLING_GUIDE.md` | Dataset generation and labelling rules |
| `research/train_muril.py` | Fine-tuning `google/muril-base-cased` |
| `research/temperature_scaling.py`, `calibration_report.py` | Probability calibration |
| `research/conformal.py`, `make_router_config.py` | Conformal prediction sets and the frozen routing thresholds |
| `research/compare_methods.py`, `eval_asr.py` | Method comparison and speech-recognition evaluation |
| `research/demo_check/` | End-to-end check of 20 spoken and typed sentences, with report |
| `research/outputs/` | Metrics, probabilities and `router_config.json` (model weights excluded from git) |

The submitted research proposal is `CivicSense_Research_Proposal.docx`.

---

## 15. Security notes and known limitations

| Area | Current state | Recommendation |
|---|---|---|
| API authentication | No endpoint checks a token; the operator department filter trusts the `uid` query parameter | Verify Firebase ID tokens on the backend and derive role and department from the token |
| `GET /api/reset-db` | Unauthenticated and drops all tables | Remove it, or restrict it to local development |
| Personal data | `GET /api/grievances` returns names, phone numbers and map coordinates to any caller | Require operator authentication; limit fields |
| CORS | All origins allowed | Restrict to the Vercel domain and localhost |
| Task tracking | In-memory; lost on restart; single process only | A persistent job table or queue if scaled |
| "In progress" status | Stored per browser | Add a status column in the database |
| Translation | Unofficial Google endpoint; complaint text is sent to Google | Official translation API, or an on-premise model |
| Production routing | Render free tier cannot run MuRIL | A larger instance or a hosted model endpoint |
| Translations | Non-Hindi UI strings are machine-quality | Review by native speakers |
| Priority | MuRIL path always uses Medium priority (7-day SLA) | Add a priority model or rules |

---

## 16. Repository layout

```
samadhaan.ai/
  backend/            FastAPI app, AI pipeline, models, tests
    tests/            pytest suite (SQLite)
    requirements*.txt production, MuRIL and development dependencies
    .env.example      configuration template
  frontend/           React + Vite app
    src/pages/        Citizen portal, citizen dashboard, operator register, auth
    src/components/   Map picker/view, translate box, page layout, logo
    src/utils/        Grievance, geo and translation helpers
    src/locales/      UI strings for 8 languages
    scripts/          check-i18n.mjs
    public/           logo.svg, Samadhaan.ai.png
  research/           MuRIL training, calibration, conformal routing, evaluation
  data/               Labelled complaint dataset
  docs/               This report and design documents
  start_demo.ps1      One-command local demo (backend + frontend, optional tunnel)
  README_DEMO.md      Demo-day guide
  TEAM_GUIDE.md       Team setup notes
  PROJECT_STATE.md    Detailed project state and decisions
  vercel.json         Response headers for the deployed frontend
```
