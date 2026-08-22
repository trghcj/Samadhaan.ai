import os
import json
from faster_whisper import WhisperModel
from dotenv import load_dotenv
from database import SessionLocal
import models

import requests

# Use REST API to prevent Render OOM crashes and dependency conflicts
genai = None

# Load environment variables
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Initialize Whisper model lazily to prevent blocking Uvicorn startup
whisper_model = None

def get_whisper_model(progress_callback=None):
    global whisper_model
    if whisper_model is None:
        if progress_callback: progress_callback("Downloading and loading audio model (first run only, takes ~30s)...")
        print("Loading Whisper Model (this may take a moment on first run)...")
        try:
            # Using 'tiny' with 'default' compute_type and cpu_threads=1 to prevent Render CPU thrashing
            whisper_model = WhisperModel("tiny", device="cpu", compute_type="default", cpu_threads=1)
            print("Whisper Model loaded successfully.")
        except Exception as e:
            print(f"Error loading whisper: {e}")
    return whisper_model

def process_audio_task(audio_file_path: str, user_id: str = None, reporter_name: str = None, reporter_phone: str = None, location: str = None, extra_details: str = None, progress_callback=None):
    # 1. Transcription Phase
    transcript = ""
    model = get_whisper_model(progress_callback)
    if model:
        if progress_callback: progress_callback("Transcribing audio...")
        try:
            segments, info = model.transcribe(audio_file_path, beam_size=5)
            transcript = " ".join([segment.text for segment in segments]).strip()
        except Exception as e:
            print(f"Transcription error: {e}")
            
    if not transcript:
        return {
            "prediction_set": "Unknown (Empty Audio)",
            "confidence_level": "Low",
            "confidence_score": 0.0,
            "transcript": ""
        }

    # 2. Classification & Uncertainty Phase
    if not GEMINI_API_KEY or GEMINI_API_KEY == "PASTE_YOUR_API_KEY_HERE":
        return {
            "prediction_set": "Water Department (Mock)",
            "confidence_level": "Medium",
            "confidence_score": 0.5,
            "transcript": transcript,
            "error": "Gemini API key missing. Mock classification used."
        }
        
    if GEMINI_API_KEY == "":
        return {
            "prediction_set": "Error",
            "confidence_level": "Low",
            "confidence_score": 0.0,
            "transcript": transcript,
            "error": "Missing GEMINI_API_KEY"
        }

    try:
        prompt = f"""
        You are the router for CivicSense, a municipal grievance system.
        Classify the following citizen grievance transcript into ONE of these specific departments:
        - Water
        - Electricity
        - Roads
        - Sanitation
        - Drainage
        - Street Lights
        - Unclear (if the problem doesn't fit any of the above)
        
        Provide a confidence score from 0.0 to 1.0.
        Assign a confidence level:
        High = 0.8 to 1.0 (Very clear)
        Medium = 0.5 to 0.79 (Ambiguous, might need clarification)
        Low = 0.0 to 0.49 (Unclear, noisy, or irrelevant)
        
        CRITICAL INSTRUCTIONS BASED ON CONFIDENCE:
        - If Medium: You MUST include a "clarifying_question" field in the JSON with ONE short question to ask the citizen to clear up the confusion.
        - If Low: You MUST include an "alternative_departments" field containing a comma-separated string of the 2 or 3 most likely departments (e.g., "Water, Drainage").
        
        Transcript: "{transcript}"
        
        Output ONLY valid JSON with no markdown blocks like ```json.
        Example High:
        {{
            "prediction_set": "Water",
            "confidence_level": "High",
            "confidence_score": 0.95
        }}
        
        Example Medium:
        {{
            "prediction_set": "Roads",
            "confidence_level": "Medium",
            "confidence_score": 0.65,
            "clarifying_question": "Is the issue a pothole on the main road, or a broken sidewalk?"
        }}
        
        Example Low:
        {{
            "prediction_set": "Unclear",
            "confidence_level": "Low",
            "confidence_score": 0.30,
            "alternative_departments": "Water, Drainage"
        }}
        """
        # Use REST API instead of heavy SDK to avoid gRPC OOM crashes
        if progress_callback: progress_callback("Analyzing transcript with AI...")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={GEMINI_API_KEY}"
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }]
        }
        
        try:
            response = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=60)
            response.raise_for_status()
            data = response.json()
            result_text = data['candidates'][0]['content']['parts'][0]['text'].strip()
        except Exception as e:
            err_msg = str(e)
            if hasattr(e, 'response') and e.response is not None:
                try: err_msg += f" - Response: {e.response.text}"
                except: pass
            print(f"Gemini API REST Error: {err_msg}")
            return {
                "prediction_set": "Error",
                "confidence_level": "Low",
                "confidence_score": 0.0,
                "transcript": transcript,
                "error": f"API Error: {err_msg}"
            }
            
        if result_text.startswith("```json"):
            result_text = result_text[7:-3].strip()
        elif result_text.startswith("```"):
            result_text = result_text[3:-3].strip()
            
        result_dict = json.loads(result_text)
        result_dict["transcript"] = transcript
        
        # Save the result to PostgreSQL
        if progress_callback: progress_callback("Saving grievance to database...")
        try:
            db = SessionLocal()
            new_g = models.Grievance(
                transcript=transcript,
                prediction=result_dict.get("prediction_set", "Error"),
                confidence=result_dict.get("confidence_level", "Low"),
                confidence_score=float(result_dict.get("confidence_score", 0.0)),
                clarifying_question=result_dict.get("clarifying_question"),
                alternative_departments=result_dict.get("alternative_departments"),
                citizen_uid=user_id,
                reporter_name=reporter_name,
                reporter_phone=reporter_phone,
                location=location,
                extra_details=extra_details
            )
            db.add(new_g)
            db.commit()
            db.refresh(new_g)
            result_dict["id"] = new_g.id
            db.close()
        except Exception as db_err:
            print(f"Database save error: {db_err}")
        
        if os.path.exists(audio_file_path):
            os.remove(audio_file_path)
            
        return result_dict
        
    except Exception as e:
        return {
            "prediction_set": "Error",
            "confidence_level": "Low",
            "confidence_score": 0.0,
            "transcript": transcript,
            "error": str(e)
        }
