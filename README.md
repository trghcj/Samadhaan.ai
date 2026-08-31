# Samadhaan.ai 🎙️🏛️
*(Project Title: Samadhaan.ai: An Uncertainty-Aware Multilingual System for Reliable Civic Grievance Routing)*

**Samadhaan.ai** is an AI-powered municipal grievance routing system designed to bridge the gap between citizens and local government. 

### 🚨 The Problem
When a citizen has a civic complaint such as a broken water pipe, a broken street light, or uncollected garbage, they are typically expected to fill out a complex online form. These forms are usually in English, and ask the citizen to manually determine the correct government department. Many people in India cannot do this—they may not read English well, may not know which department handles which problem, and may not be comfortable navigating formal government websites.

### 💡 Our Solution
A more natural approach is to let citizens simply speak their complaints in their own language. Samadhaan.ai uses speech-to-text to capture the issue, but goes a step further: it tackles the **uncertainty** of vague complaints, enforces **Service Level Agreements (SLAs)**, and uses **AI Vision to prevent operator fraud**.

---

## ✨ Key Features

*   **🗣️ Voice-First Citizen Portal:** Citizens report issues naturally using their voice or by uploading audio. No complex drop-downs or forms.
*   **📊 Modern Citizen Dashboard:** A polished, SaaS-style dashboard for citizens to track their reported issues, filter by status, search past reports, and view detailed timelines of their resolution.
*   **🧠 Uncertainty-Aware AI Routing:**
    *   Uses Google Gemini AI to analyze the transcript and route the grievance to the correct municipal department (e.g., "Water", "Roads", "Sanitation").
    *   Generates a **Confidence Score** (High/Medium/Low). If the audio is vague (Low Confidence), the AI suggests multiple alternative departments and flags it for human review.
*   **⏱️ Dynamic SLA Tracking:** The AI determines the **Priority Level** of the civic issue (e.g., High for live wires, Low for minor cracks) and automatically calculates a strict SLA deadline (1 day, 7 days, or 14 days).
*   **🛡️ AI Anti-Fraud Photo Verification:** 
    *   Operators cannot simply click "Resolved" to close a ticket. They must upload an "After" photo of the repaired site.
    *   Our **AI Vision pipeline** compares the citizen's original "Before" photo with the operator's "After" photo. If the operator uploads a fake, unrelated, or stock image, the AI rejects the resolution and flags it as Fraud.
*   **📋 Operator Kanban Board:** A dedicated workspace where municipal operators (strictly isolated to their own departments) can drag and drop issues from *To Do* → *Pending AI Verification* → *Resolved*.
*   **🔍 Stackable Dashboard Filters:** Operators can filter complaints by "High Priority", "High Confidence", or "Fraud Alert" using inclusive OR-logic, instantly updating the global dashboard analytics.
*   **🌍 Multi-Language UI (i18n):** Native support for 8 languages (English, Hindi, Bengali, Telugu, Tamil, Marathi, Spanish, French) using `react-i18next` with a seamless dropdown switcher to bridge the digital divide.
*   **📱 Custom UI Components:** Replaced abrasive browser alerts with accessible, state-driven React modals for destructive actions (like deleting reports) to ensure a modern SaaS-like user experience.
*   **☁️ Fault-Tolerant Architecture:** Gracefully handles empty audio blobs, missing microphone permissions, strict Vercel COOP (Cross-Origin-Opener-Policy) OAuth popup restrictions, and cloud API rate-limits without silently failing.

## 🛠️ Tech Stack

**Frontend:**
*   React.js (Vite)
*   React Router DOM
*   `react-i18next` (Internationalization Engine)
*   Firebase Authentication (Role-based access control for Citizens vs. Operators)
*   Vanilla CSS (Clean, accessible, SaaS-style civic tech UI)
*   Hosted on [Vercel](https://vercel.com) (with custom `vercel.json` headers for secure OAuth)

**Backend & AI:**
*   Python / FastAPI
*   `faster-whisper` (Speech-to-Text)
*   Google Generative AI (Gemini 1.5 Flash & Vision API)
*   Cloudinary (Image hosting for Evidence Photos)
*   Hosted on [Render](https://render.com) (Free Web Service)

**Database:**
*   PostgreSQL & SQLAlchemy (Hosted on [Supabase](https://supabase.com))

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
*The backend runs on `http://localhost:8000`. If you make changes to `models.py`, use the `/api/reset-db` endpoint to rebuild the schema.*

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
*   **Frontend (Vercel):** Ensure you add `samadhaan-ai.vercel.app` to your Firebase Authentication Authorized Domains. The `vercel.json` file handles React routing fallbacks.
*   **Backend (Render):** Uses FastAPI's `BackgroundTasks` instead of Celery/Redis to allow long-running AI models (like `faster-whisper` and Gemini Vision) to run without blocking the main server thread on a single free instance. 
*   **Image Handling:** Evidence photos are routed directly to Cloudinary via unsigned upload presets to save backend bandwidth, with only the Secure URLs saved to the PostgreSQL database.
