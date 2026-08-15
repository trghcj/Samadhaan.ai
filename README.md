# Samadhaan.ai 🎙️🏛️

**Samadhaan.ai** is an AI-powered municipal grievance routing system designed to bridge the gap between citizens and local government. By simply speaking into their device, citizens can report issues (like potholes, water leaks, or broken streetlights). Our AI pipeline automatically transcribes the audio, analyzes the context, and routes the issue to the correct municipal department with a confidence score.

---

## ✨ Features

*   **🗣️ Voice-First Citizen Portal:** Citizens report issues naturally using their voice. No complex forms to fill out.
*   **🤖 AI-Powered Analysis:**
    *   **Transcription:** Uses `faster-whisper` for fast, offline, and accurate speech-to-text.
    *   **Classification:** Uses Google Gemini AI to analyze the transcript and route the grievance to the correct municipal department (e.g., "Roads & Highways", "Water Supply", "Sanitation").
*   **👮 Operator Dashboard:** A secure portal for municipal operators to review incoming grievances, see AI confidence scores, read transcripts, and mark issues as resolved.
*   **🔐 Secure Authentication:** Powered by Firebase Authentication (Email/Password & Google OAuth).
*   **💰 100% Free Deployment Architecture:** Engineered to run entirely on free tiers (Vercel + Render + Supabase) using native FastAPI Background Tasks instead of expensive message brokers.

## 🛠️ Tech Stack

**Frontend:**
*   React.js (Vite)
*   React Router DOM
*   Firebase Authentication
*   Vanilla CSS (Modern glassmorphism & gradients)
*   Hosted on [Vercel](https://vercel.com)

**Backend & AI:**
*   Python / FastAPI
*   `faster-whisper` (Speech-to-Text)
*   Google Generative AI (Gemini API)
*   SQLAlchemy & PostgreSQL
*   Hosted on [Render](https://render.com) (Free Web Service)

**Database:**
*   PostgreSQL hosted on [Supabase](https://supabase.com)

---

## 🚀 Getting Started (Local Development)

### 1. Clone the repository
```bash
git clone https://github.com/trghcj/Samadhaan.ai.git
cd Samadhaan.ai
```

### 2. Backend Setup
```bash
cd backend

# Create a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`

# Install dependencies
pip install -r requirements.txt

# Set up Environment Variables (.env)
# Create a .env file in the backend directory and add:
# GEMINI_API_KEY=your_gemini_api_key
# DATABASE_URL=postgresql://user:password@db.supabase.co:5432/postgres

# Run the FastAPI server
uvicorn main:app --reload
```
*The backend runs on `http://localhost:8000`. On first run, it will automatically build your database tables.*

### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Set up Environment Variables (.env)
# Create a .env file in the frontend directory and add your Firebase config variables (VITE_FIREBASE_API_KEY, etc.)

# Start the development server
npm run dev
```
*The frontend runs on `http://localhost:5173`.*

---

## 🌍 Deployment Notes

This project is optimized for cost-free cloud hosting:
*   **Frontend (Vercel):** Ensure you add `samadhaan-ai.vercel.app` to your Firebase Authentication Authorized Domains. The `vercel.json` file handles React routing fallbacks and COOP/COEP security headers for Google OAuth popups.
*   **Backend (Render):** Uses FastAPI's `BackgroundTasks` instead of Celery/Redis to allow long-running AI models (like `faster-whisper`) to run without blocking the main server thread on a single free instance. Note: Render free instances sleep after 15 minutes of inactivity, resulting in a 60-90 second "cold start" delay for the first audio uploaded.
