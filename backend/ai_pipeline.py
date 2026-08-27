import os
import json
from datetime import datetime, timedelta
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

def process_audio_task(audio_file_path: str, user_id: str = None, reporter_name: str = None, reporter_phone: str = None, location: str = None, extra_details: str = None, progress_callback=None, before_photo_url: str = None):
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
        transcript = "[Inaudible / Empty Audio]"

    result_dict = None
    
    # 2. Classification & Uncertainty Phase
    if not GEMINI_API_KEY or GEMINI_API_KEY == "PASTE_YOUR_API_KEY_HERE" or GEMINI_API_KEY == "":
        result_dict = {
            "prediction_set": "Water Department (Mock)",
            "confidence_level": "Medium",
            "confidence_score": 0.5,
            "error": "Gemini API key missing. Mock classification used."
        }
    else:
        prompt = f'''
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
        
        Also determine the priority level of the issue based on urgency and public safety:
        High = Urgent safety risk (e.g. live wire, major leak, huge pothole)
        Medium = Standard issue (e.g. street light out, standard pothole, garbage pile)
        Low = Minor issue (e.g. slight crack in pavement, slow drainage)
        
        CRITICAL INSTRUCTIONS BASED ON CONFIDENCE:
        - If Medium: You MUST include a "clarifying_question" field in the JSON with ONE short question to ask the citizen to clear up the confusion.
        - If Low: You MUST include an "alternative_departments" field containing a comma-separated string of the 2 or 3 most likely departments (e.g., "Water, Drainage").
        
        Transcript: "{transcript}"
        
        Return ONLY valid JSON. Do not include markdown code blocks.
        Format must be:
        {{
            "prediction_set": "Department Name",
            "confidence_level": "High/Medium/Low",
            "confidence_score": 0.95,
            "priority": "High/Medium/Low"
        }}
        '''
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
            
            if result_text.startswith("```json"):
                result_text = result_text[7:-3].strip()
            elif result_text.startswith("```"):
                result_text = result_text[3:-3].strip()
                
            result_dict = json.loads(result_text)
            
        except Exception as e:
            err_msg = str(e)
            if hasattr(e, 'response') and e.response is not None:
                try: err_msg += f" - Response: {e.response.text}"
                except: pass
            print(f"Gemini API REST Error: {err_msg}")
            result_dict = {
                "prediction_set": "Error",
                "confidence_level": "Low",
                "confidence_score": 0.0,
                "error": f"API Error: {err_msg}"
            }
            
    result_dict["transcript"] = transcript
    
    # Save the result to PostgreSQL
    if progress_callback: progress_callback("Saving grievance to database...")
    try:
        db = SessionLocal()
        
        alt_deps = result_dict.get("alternative_departments")
        if isinstance(alt_deps, list):
            alt_deps = ", ".join(str(x) for x in alt_deps)
            
        clar_q = result_dict.get("clarifying_question")
        if isinstance(clar_q, list):
            clar_q = " ".join(str(x) for x in clar_q)
            
        priority = result_dict.get("priority", "Medium")
        sla_days = 1 if priority == "High" else 7 if priority == "Medium" else 14
        sla_deadline = datetime.utcnow() + timedelta(days=sla_days)
            
        new_g = models.Grievance(
            transcript=transcript,
            prediction=result_dict.get("prediction_set", "Error"),
            confidence=result_dict.get("confidence_level", "Low"),
            confidence_score=float(result_dict.get("confidence_score", 0.0)),
            clarifying_question=clar_q,
            alternative_departments=alt_deps,
            citizen_uid=user_id,
            reporter_name=reporter_name,
            reporter_phone=reporter_phone,
            location=location,
            extra_details=extra_details,
            before_photo_url=before_photo_url,
            priority=priority,
            sla_deadline=sla_deadline,
            ai_verification_status="Pending"
        )
        db.add(new_g)
        db.commit()
        db.refresh(new_g)
        result_dict["id"] = new_g.id
        db.close()
    except Exception as db_err:
        print(f"Database save error: {db_err}")
        result_dict = {
            "prediction_set": "Error",
            "confidence_level": "Low",
            "confidence_score": 0.0,
            "transcript": transcript,
            "error": "Failed to save to database."
        }
        
    return result_dict

def verify_resolution(before_url: str, after_url: str) -> dict:
    if not before_url or not after_url:
        return {"valid": False, "reason": "Missing before or after photo for verification."}
    
    try:
        # Download images
        import requests
        before_resp = requests.get(before_url, timeout=10)
        after_resp = requests.get(after_url, timeout=10)
        
        if before_resp.status_code != 200 or after_resp.status_code != 200:
            return {"valid": False, "reason": "Failed to download one or both images for verification."}
            
        b64_before = base64.b64encode(before_resp.content).decode("utf-8")
        b64_after = base64.b64encode(after_resp.content).decode("utf-8")
        
        prompt = '''
        You are an elite fraud detection AI for a government municipal system.
        Look at Image 1 (The 'Before' photo of the civic issue).
        Look at Image 2 (The 'After' photo uploaded by the government operator claiming it is resolved).
        
        Tasks:
        1. Does Image 2 actually show the specific issue in Image 1 being repaired or fixed?
        2. Is Image 2 a genuine, raw photograph? (Look out for stock photos, AI-generated images, or completely unrelated pictures).
        
        If it is a genuine repair of the exact issue, return valid: true.
        If it is fraud, fake, AI-generated, or an unrelated photo, return valid: false and explain why in 'reason'.
        
        Output ONLY valid JSON. Example:
        {
            "valid": false,
            "reason": "The after photo appears to be a generic stock image of a road and does not match the surroundings of the before photo."
        }
        '''
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": "image/jpeg", "data": b64_before}},
                    {"inline_data": {"mime_type": "image/jpeg", "data": b64_after}}
                ]
            }]
        }
        
        res = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=30)
        res.raise_for_status()
        
        data = res.json()
        result_text = data['candidates'][0]['content']['parts'][0]['text'].strip()
        
        if result_text.startswith("```json"):
            result_text = result_text[7:-3].strip()
        elif result_text.startswith("```"):
            result_text = result_text[3:-3].strip()
            
        return json.loads(result_text)
    except Exception as e:
        print(f"AI Verification Error: {str(e)}")
        return {"valid": False, "reason": "AI Verification system temporarily unavailable."}
