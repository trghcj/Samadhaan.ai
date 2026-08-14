# Samadhaan.ai 🎙️

An AI-powered civic grievance routing system. Report municipal issues simply by using your voice in your native language, and let Samadhaan.ai transcribe, analyze, and route it to the correct department instantly!

## Features
- **Voice Input**: Record grievances directly from the browser using your microphone.
- **Multi-lingual Support**: Process audio in multiple languages (Hindi, English, etc.) using Faster-Whisper.
- **AI Routing**: Uses Google's Gemini Flash API to intelligently categorize the transcript into departments (e.g., Sanitation, Public Works, Electricity).
- **Operator Dashboard**: A dynamic dashboard for city officials to review, filter (by AI confidence), and mark grievances as resolved with persistent resolution notes.
- **Full-stack Architecture**: React (Vite) frontend, FastAPI backend, Celery background workers, and PostgreSQL/SQLite database.

## Setup Instructions

### 1. Backend Setup (FastAPI & Celery)
Ensure you have Python 3.8+ installed.
```bash
cd backend
pip install -r requirements.txt
```
Set up your `.env` file in the `backend` directory:
```env
GEMINI_API_KEY=your_api_key_here
```
Run the FastAPI server:
```bash
uvicorn main:app --reload
```
Run the Celery Worker (in a separate terminal):
```bash
celery -A worker.celery_app worker --pool=solo -l info
```

### 2. Frontend Setup (React/Vite)
Ensure you have Node.js installed.
```bash
cd frontend
npm install
npm run dev
```

## Tech Stack
- **Frontend:** React, Vite, Lucide React
- **Backend:** FastAPI, Python, Celery, Redis (Message Broker)
- **AI/ML:** Faster-Whisper (Local Transcription), Gemini API (LLM Routing)
- **Database:** SQLAlchemy ORM (SQLite/PostgreSQL)
