# Samadhaan.ai

**An uncertainty-aware, multilingual system for reliable civic grievance routing.**

Samadhaan.ai lets citizens report municipal problems by speaking or typing in Hindi, English or Hinglish. It transcribes the complaint, routes it to the right department with a calibrated confidence level, and asks the citizen or a human officer to decide when the system is unsure. Operators manage complaints in a department-scoped register with maps, translation and photo-verified resolution.

For the full technical description, covering architecture, servers, every API endpoint, database schema, libraries and configuration, see **[docs/PROJECT_REPORT.md](docs/PROJECT_REPORT.md)**.

---

## The problem

Complaint portals usually expect an English form and ask the citizen to pick the correct department. Many citizens cannot read the form comfortably and do not know which department handles their problem. Routing systems that guess silently send complaints to the wrong office, where they stall.

## The approach

1. **Speak or type naturally.** Speech is transcribed with Whisper, and Hindi and English are both supported.
2. **Route with calibrated confidence.** A fine-tuned MuRIL model assigns one of six departments (Water, Electricity, Roads, Sanitation, Drainage, Street Lights) or "Unclear":
   - **High confidence:** routed automatically.
   - **Medium:** the citizen picks from the two or three likely departments.
   - **Low or unclear:** sent to an officer.
   - Thresholds come from conformal prediction, set so that at most 5% of automatic routes are wrong on the calibration data.
3. **Close the loop.** Every complaint has a reference number, a deadline and a visible status. Operators resolve with an "after" photo that is checked against the citizen's photo.

---

## Features

**Citizen**
- Voice recording (Hindi or English) or typed complaint, with playback and re-record
- Map pin: "use my current location" or tap the map; the address is filled in automatically
- House, landmark, area and PIN code fields
- Optional photo of the problem
- Department choice screen when the system is unsure
- Confirmation with a reference number
- "My complaints" page: progress tracker (Submitted, With department, Resolved), expected date, search and filters

**Operator**
- Complaint register scoped to the operator's department, with stat tiles (Open, In progress, Overdue, Resolved) and tabs
- Routing filter: auto-routed, citizen chose, needs officer, awaiting citizen, out of scope
- Search by reference, text or location
- Ticket panel:
  - Complaint text with a one-click English translation
  - Map with "Open in Google Maps"
  - Before and after photos
  - Start work, and resolve with notes
- Photo verification of resolutions; rejected fixes stay open as "Flagged"
- CSV export including location columns

**Platform**
- Interface in 8 languages: English, Hindi, Bengali, Telugu, Tamil, Marathi, Spanish, French
- Email and Google sign-in with citizen and operator roles
- Asynchronous processing with progress updates, and readable errors for empty, corrupted or silent recordings

---

## Technology

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, React Router 7, i18next, Leaflet (OpenStreetMap), lucide-react, plain CSS |
| Authentication | Firebase Authentication (email/password, Google) |
| Backend | Python, FastAPI, Uvicorn, SQLAlchemy 2, Pydantic 2 |
| Speech to text | faster-whisper (CTranslate2), PyAV |
| Classification | Fine-tuned `google/muril-base-cased` (PyTorch, Transformers) with calibrated, conformal routing; Google Gemini as fallback |
| Database | PostgreSQL on Supabase (SQLite for tests and offline use) |
| Media | Cloudinary (unsigned upload from the browser) |
| Hosting | Vercel (frontend), Render (backend) |

Package versions and the purpose of each library are listed in the [project report](docs/PROJECT_REPORT.md#10-libraries-and-packages).

---

## Architecture

```
Browser (React, Vercel)  --REST-->  FastAPI (Render / localhost:8000)  --SQLAlchemy-->  PostgreSQL (Supabase)
   |  Firebase Auth                   |  faster-whisper -> MuRIL -> routing
   |  Cloudinary (photos)             |  Gemini (fallback, photo check)
   |  OpenStreetMap / Nominatim       |  BackgroundTasks + status polling
```

A spoken complaint is uploaded to `POST /api/upload` and processed in the background. The browser polls `GET /api/status/{task_id}` until the result is ready.

### API at a glance

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Health and model readiness |
| POST | `/api/upload` | Submit a spoken complaint |
| POST | `/api/submit-text` | Submit a typed complaint |
| GET | `/api/status/{task_id}` | Poll processing result |
| PATCH | `/api/grievances/{id}/clarify` | Citizen chooses a department |
| GET | `/api/grievances` | Operator register (department-scoped) |
| GET | `/api/grievances/me/{uid}` | A citizen's complaints |
| PATCH | `/api/grievances/{id}/resolve` | Resolve, with optional photo verification |
| DELETE | `/api/grievances/{id}` | Delete a complaint |
| POST | `/api/users/sync` | Create or update the signed-in user |

Request and response details: [API reference](docs/PROJECT_REPORT.md#5-api-reference). Interactive documentation is served by the backend at `/docs`.

---

## Getting started

### Prerequisites

- Python 3.11 or newer
- Node.js 20 or newer
- A Firebase project (web app config) and a PostgreSQL database, or SQLite for offline use
- Optional: the fine-tuned MuRIL weights (about 950 MB, not stored in git) for full routing

### 1. Clone

```bash
git clone https://github.com/trghcj/Samadhaan.ai.git
cd Samadhaan.ai
```

### 2. Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate            # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt

# Optional, for MuRIL routing (CPU build of PyTorch keeps the download small)
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements-muril.txt

copy .env.example .env           # macOS/Linux: cp .env.example .env
uvicorn main:app --reload        # http://localhost:8000
```

Main settings in `backend/.env`:

| Variable | Example | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/postgres` or `sqlite:///demo.db` | Database |
| `WHISPER_MODEL` | `small` | Speech model size |
| `WHISPER_COMPUTE` / `WHISPER_THREADS` | `int8` / `4` | CPU performance |
| `MURIL_MODEL_DIR` | `research/outputs/final_e40/model` | MuRIL weights folder |
| `GEMINI_API_KEY` | | Optional fallback classifier and photo verification |

The full list is in the [configuration section](docs/PROJECT_REPORT.md#11-configuration-and-environment-variables) of the report.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                      # http://localhost:5173
```

Create `frontend/.env.local`:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
VITE_API_URL=http://localhost:8000
```

### One-command demo (Windows)

```powershell
.\start_demo.ps1 -Local
```

This starts the backend and frontend together. Without `-Local`, the script exposes the laptop backend through a Cloudflare tunnel for the deployed site. See [README_DEMO.md](README_DEMO.md).

---

## Testing

```bash
# Backend (uses a temporary SQLite database, never the shared one)
pip install -r backend/requirements-dev.txt
python -m pytest backend/tests -q

# Frontend
cd frontend
npm run build
npm run lint
npm run check:i18n               # every UI string translated in all 8 languages
```

---

## Deployment

| Part | Host | Notes |
|---|---|---|
| Frontend | Vercel | Builds `frontend/`; `vercel.json` sets the header Google sign-in needs; add the Vercel domain to Firebase authorised domains |
| Backend | Render | `uvicorn main:app --host 0.0.0.0 --port $PORT` from `backend/`; set `DATABASE_URL` (and optionally `GEMINI_API_KEY`) |
| Database | Supabase PostgreSQL | Session pooler connection string; new columns are added automatically at startup |

Both hosts redeploy when `main` of `trghcj/Samadhaan.ai` changes. The Render free tier cannot load the MuRIL model, so full routing is demonstrated locally. Details are in the [servers and hosting](docs/PROJECT_REPORT.md#3-servers-and-hosting) section of the report.

---

## Project structure

```
backend/     FastAPI application, speech and classification pipeline, tests
frontend/    React application (citizen portal, dashboards, operator register)
research/    MuRIL training, calibration, conformal routing, evaluation
data/        Labelled complaint dataset (504 complaints)
docs/        Project report and design documents
```

---

## Known limitations

- **No token checks on the API.** Securing the API with Firebase ID tokens and removing the maintenance endpoint `/api/reset-db` are the first steps before public use.
- **In-progress marks and the task tracker are not persistent.** "In progress" marks are stored per browser, and the task tracker lives in server memory.
- **Unreviewed translations.** The interface in languages other than English and Hindi is machine-quality and should be reviewed by native speakers.

The full list, with recommendations, is in [section 15](docs/PROJECT_REPORT.md#15-security-notes-and-known-limitations) of the report.

---

## Documentation

| Document | Content |
|---|---|
| [docs/PROJECT_REPORT.md](docs/PROJECT_REPORT.md) | Complete technical report |
| [README_DEMO.md](README_DEMO.md) | Running the live demo |
| [TEAM_GUIDE.md](TEAM_GUIDE.md) | Team setup notes |
| [PROJECT_STATE.md](PROJECT_STATE.md) | Project state and design decisions |
| [data/README.md](data/README.md) | Dataset description |
| `CivicSense_Research_Proposal.docx` | Research proposal |
