import os
import json
from faster_whisper import WhisperModel
from dotenv import load_dotenv
from database import SessionLocal
import models

# Use the stable SDK to prevent Render crashes
try:
    import google.generativeai as genai
except ImportError:
    genai = None

# Load environment variables
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Initialize Whisper model globally so it stays in memory across tasks
print("Loading Whisper Model (this may take a moment on first run)...")
try:
    whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
    print("Whisper Model loaded successfully.")
except Exception as e:
    print(f"Error loading whisper: {e}")
    whisper_model = None

def process_audio_task(audio_file_path: str, user_id: str = None, reporter_name: str = None, reporter_phone: str = None, location: str = None, extra_details: str = None):
    # 1. Transcription Phase
    transcript = ""
    if whisper_model:
        try:
            segments, info = whisper_model.transcribe(audio_file_path, beam_size=5)
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
        
    if genai is None:
        return {
            "prediction_set": "Error",
            "confidence_level": "Low",
            "confidence_score": 0.0,
            "transcript": transcript,
            "error": "Please run: pip install google-genai"
        }

    try:
        prompt = f"""
        You are the router for CivicSense, a municipal grievance system.
        Classify the following citizen grievance transcript into one of these departments:
        - Water
        - Electricity
        - Sanitation
        - Public Works
        
        If it's ambiguous or spans multiple departments, return a comma-separated list of departments.
        Provide a confidence score from 0.0 to 1.0.
        Assign a confidence level:
        High = 0.8 to 1.0 (Very clear)
        Medium = 0.5 to 0.79 (Ambiguous, might need clarification)
        Low = 0.0 to 0.49 (Unclear, noisy, or irrelevant)
        
        Transcript: "{transcript}"
        
        Output ONLY valid JSON with no markdown blocks like ```json.
        {{
            "prediction_set": "Water, Electricity",
            "confidence_level": "Medium",
            "confidence_score": 0.65
        }}
        """
        genai.configure(api_key=GEMINI_API_KEY)
        
        selected_model = 'gemini-pro'
        print(f"Using Gemini model: {selected_model}")
        
        try:
            model = genai.GenerativeModel(selected_model)
            response = model.generate_content(prompt)
        except Exception as e:
            print(f"Gemini API Error: {e}")
            return {
                "prediction_set": "Error",
                "confidence_level": "Low",
                "confidence_score": 0.0,
                "transcript": transcript
            }
            
        result_text = response.text.strip()
        if result_text.startswith("```json"):
            result_text = result_text[7:-3].strip()
        elif result_text.startswith("```"):
            result_text = result_text[3:-3].strip()
            
        result_dict = json.loads(result_text)
        result_dict["transcript"] = transcript
        
        # Save the result to PostgreSQL
        try:
            db = SessionLocal()
            new_g = models.Grievance(
                transcript=transcript,
                prediction=result_dict.get("prediction_set", "Error"),
                confidence=result_dict.get("confidence_level", "Low"),
                confidence_score=float(result_dict.get("confidence_score", 0.0)),
                citizen_uid=user_id,
                reporter_name=reporter_name,
                reporter_phone=reporter_phone,
                location=location,
                extra_details=extra_details
            )
            db.add(new_g)
            db.commit()
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
