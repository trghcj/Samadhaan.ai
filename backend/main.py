from fastapi import FastAPI, File, UploadFile, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from ai_pipeline import process_audio_task, process_text_task
from location import parse_place
import muril_classifier
import shutil
import os
import uuid
import threading
import time

# In-memory dictionary to track background task status
task_tracker = {}

app = FastAPI(title="CivicSense API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure temp directory exists
os.makedirs("temp_audio", exist_ok=True)

from database import SessionLocal, engine
import models
from sqlalchemy.orm import Session
from fastapi import Depends

# Create tables if they don't exist, then add columns that newer code introduced (create_all never alters a table)
models.Base.metadata.create_all(bind=engine)
from schema_sync import add_missing_columns
_added = add_missing_columns(engine, models.Grievance)
if _added:
    print(f"Added columns to grievances: {_added}")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

models_ready = {"speech": False, "classifier": False}


def preload_models():
    """Load Whisper and MuRIL now (and run one dummy prediction), so the first complaint is not slow."""
    import ai_pipeline

    started = time.time()
    models_ready["speech"] = ai_pipeline.get_whisper_model() is not None
    if os.getenv("CLASSIFIER", "muril").lower() == "muril" and muril_classifier.is_available():
        models_ready["classifier"] = muril_classifier.warm_up()
    print(f"Models preloaded in {time.time() - started:.1f}s: {models_ready}")


@app.on_event("startup")
async def start_preload():
    # In a thread, so the server accepts requests at once; a request that arrives while loading simply waits for the
    # load to finish (both loaders are locked). Set PRELOAD_MODELS=0 to load lazily on first use instead (e.g. on a tiny host).
    if os.getenv("PRELOAD_MODELS", "1") != "0":
        threading.Thread(target=preload_models, daemon=True, name="preload-models").start()


@app.get("/")
async def root():
    return {"message": "Samadhaan.ai Backend is running", "status": "ok", "models_ready": models_ready}

@app.get("/api/reset-db")
def reset_database():
    """Temporary endpoint to fix missing columns in whatever database Render is using"""
    try:
        models.Base.metadata.drop_all(bind=engine)
        models.Base.metadata.create_all(bind=engine)
        return {"status": "success", "message": "Database schema forcefully reset."}
    except Exception as e:
        return {"error": str(e), "status": 500}

@app.get("/api/grievances")
def get_grievances(uid: str | None = None, db: Session = Depends(get_db)):
    """Fetch grievances for the Operator Dashboard with RBAC"""
    try:
        query = db.query(models.Grievance)
        
        # Enforce RBAC if uid is provided
        if uid:
            user = db.query(models.User).filter(models.User.uid == uid).first()
            if user and user.role == "operator" and user.department and user.department != "All Departments":
                query = query.filter(models.Grievance.prediction == user.department)
                
        grievances = query.order_by(models.Grievance.created_at.desc()).all()
        return grievances
    except Exception as e:
        return {"error": str(e), "status": 500}

from pydantic import BaseModel
class ResolveRequest(BaseModel):
    resolution_notes: str
    after_photo_url: str | None = None

@app.patch("/api/grievances/{g_id}/resolve")
def resolve_grievance(g_id: int, req: ResolveRequest, db: Session = Depends(get_db)):
    grievance = db.query(models.Grievance).filter(models.Grievance.id == g_id).first()
    if not grievance:
        return {"error": "Not found"}
        
    from datetime import datetime
    import ai_pipeline
    
    if req.after_photo_url:
        verification = ai_pipeline.verify_resolution(grievance.before_photo_url, req.after_photo_url)
        
        if not verification.get("valid", False):
            # Fraud or invalid resolution detected
            grievance.ai_verification_status = "Rejected"
            grievance.ai_verification_notes = verification.get("reason", "Unknown AI rejection.")
            db.commit()
            return {"status": "error", "message": "Resolution Rejected by AI", "reason": grievance.ai_verification_notes}
        else:
            grievance.ai_verification_status = "Verified"
            grievance.ai_verification_notes = "AI Confirmed Issue Repaired"

    grievance.is_resolved = True
    grievance.resolution_notes = req.resolution_notes
    grievance.after_photo_url = req.after_photo_url
    grievance.resolved_at = datetime.utcnow()
    db.commit()
    return {"status": "success", "ai_verification": grievance.ai_verification_status}

@app.delete("/api/grievances/{g_id}")
def delete_grievance(g_id: int, db: Session = Depends(get_db)):
    grievance = db.query(models.Grievance).filter(models.Grievance.id == g_id).first()
    if not grievance:
        return {"error": "Not found", "status": 404}
    
    db.delete(grievance)
    db.commit()
    return {"status": "success"}

NONE_OF_THESE = "none_of_these"
FALLBACK_DEPARTMENTS = [d for d in muril_classifier.LABELS if d != "Unclear"]  # used when no options were stored (Gemini path)


class ClarifyRequest(BaseModel):
    choice: str  # one of the departments that were offered, or "none_of_these"


@app.patch("/api/grievances/{g_id}/clarify")
def clarify_grievance(g_id: int, req: ClarifyRequest, db: Session = Depends(get_db)):
    grievance = db.query(models.Grievance).filter(models.Grievance.id == g_id).first()
    if not grievance:
        raise HTTPException(status_code=404, detail="Grievance not found")
    if not grievance.clarifying_question:
        raise HTTPException(status_code=409, detail="This complaint is not waiting for a clarification")

    offered = [d.strip() for d in (grievance.alternative_departments or "").split(",") if d.strip()] or FALLBACK_DEPARTMENTS
    choice = req.choice.strip()

    if choice == NONE_OF_THESE:
        # No offered department fits: a person decides. The model's guess stays on the record, confidence is Low.
        grievance.transcript = f"{grievance.transcript}\n\n[Citizen Clarification]: none of the offered departments ({', '.join(offered)})"
        grievance.confidence = "Low"
        grievance.clarifying_question = None
        db.commit()
        return {"status": "success", "outcome": "human_review"}

    if choice not in offered:
        raise HTTPException(status_code=400, detail=f"Pick one of: {', '.join(offered)}, or {NONE_OF_THESE}")

    # The citizen's pick becomes the prediction; it is marked as confirmed by the citizen, not as model confidence.
    grievance.transcript = f"{grievance.transcript}\n\n[Citizen Clarification]: chose {choice} (offered: {', '.join(offered)})"
    grievance.prediction = choice
    grievance.confidence = "Confirmed by citizen"
    grievance.clarifying_question = None
    db.commit()
    return {"status": "success", "outcome": "confirmed", "prediction": choice}


class UserSyncRequest(BaseModel):
    uid: str
    email: str
    display_name: str | None = None
    role: str = "citizen"
    department: str | None = None

@app.post("/api/users/sync")
def sync_user(req: UserSyncRequest, db: Session = Depends(get_db)):
    from datetime import datetime
    user = db.query(models.User).filter(models.User.uid == req.uid).first()
    if not user:
        user = models.User(
            uid=req.uid,
            email=req.email,
            display_name=req.display_name,
            role=req.role,
            department=req.department
        )
        db.add(user)
    else:
        # Update existing user on fresh login (don't overwrite role/department)
        user.email = req.email
        user.display_name = req.display_name
        user.last_login = datetime.utcnow()
    
    db.commit()
    return {"status": "success", "role": user.role, "department": user.department}

@app.get("/api/grievances/me/{uid}")
def get_my_grievances(uid: str, db: Session = Depends(get_db)):
    """Fetch grievances for a specific citizen"""
    try:
        grievances = db.query(models.Grievance).filter(models.Grievance.citizen_uid == uid).order_by(models.Grievance.created_at.desc()).all()
        return grievances
    except Exception as e:
        return {"error": str(e), "status": 500}


from typing import Optional
from fastapi import Form

@app.post("/api/upload")
async def upload_audio(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...),
    user_id: Optional[str] = Form(None),
    reporter_name: Optional[str] = Form(None),
    reporter_phone: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    extra_details: Optional[str] = Form(None),
    before_photo_url: Optional[str] = Form(None),
    language: Optional[str] = Form(None),
    latitude: Optional[str] = Form(None),
    longitude: Optional[str] = Form(None),
    address_line: Optional[str] = Form(None),
    landmark: Optional[str] = Form(None),
    pincode: Optional[str] = Form(None),
):
    """
    Accepts audio, saves it locally, and queues the ML task in FastAPI BackgroundTasks.
    Returns immediately with a task_id so the frontend doesn't hang.
    `language` is the citizen's choice ("hi" or "en"); "auto" or nothing lets Whisper choose between Hindi and English.
    """
    language = check_language(language)
    place = check_place(latitude, longitude, address_line, landmark, pincode)
    # Never use the client's filename as a path: two uploads would overwrite each other mid-processing,
    # and a name like "../x" could write outside temp_audio. Keep only a known audio extension.
    ext = os.path.splitext(os.path.basename(file.filename or ""))[1].lower()
    if ext not in {".webm", ".wav", ".mp3", ".m4a", ".ogg", ".mp4", ".flac"}:
        ext = ".webm"
    task_id = str(uuid.uuid4())
    file_path = f"temp_audio/{task_id}{ext}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    task_tracker[task_id] = {"status": "processing"}
    
    # Define the background worker function
    def run_ai_task(tid, fp, c_uid, r_name, r_phone, loc, extra, b_photo, lang):
        def update_progress(msg):
            task_tracker[tid] = {"status": "processing", "step": msg}
            print(f"Task {tid} progress: {msg}")

        try:
            result = process_audio_task(fp, c_uid, r_name, r_phone, loc, extra, progress_callback=update_progress, before_photo_url=b_photo, language=lang, place=place)
            task_tracker[tid] = {
                "status": "success",
                "ai_result": result
            }
        except Exception as e:
            task_tracker[tid] = {
                "status": "error",
                "error": str(e)
            }
        finally:
            # Raw complaint audio is not kept unless KEEP_AUDIO=1 (useful when collecting recordings for evaluation).
            if os.getenv("KEEP_AUDIO") != "1":
                try:
                    os.remove(fp)
                except OSError:
                    pass

    # Dispatch native FastAPI background task
    background_tasks.add_task(run_ai_task, task_id, file_path, user_id, reporter_name, reporter_phone, location, extra_details, before_photo_url, language)
    
    return {"task_id": task_id, "status": "processing"}


MAX_TEXT_CHARS = 1000


def check_place(latitude, longitude, address_line, landmark, pincode):
    try:
        return parse_place(latitude, longitude, address_line, landmark, pincode)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


def check_language(language):
    lang = (language or "auto").strip().lower()
    if lang not in ("hi", "en", "auto"):
        raise HTTPException(status_code=400, detail="language must be 'hi', 'en' or 'auto'")
    return None if lang == "auto" else lang


@app.post("/api/submit-text")
async def submit_text(
    background_tasks: BackgroundTasks,
    text: str = Form(...),
    user_id: Optional[str] = Form(None),
    reporter_name: Optional[str] = Form(None),
    reporter_phone: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    extra_details: Optional[str] = Form(None),
    before_photo_url: Optional[str] = Form(None),
    latitude: Optional[str] = Form(None),
    longitude: Optional[str] = Form(None),
    address_line: Optional[str] = Form(None),
    landmark: Optional[str] = Form(None),
    pincode: Optional[str] = Form(None),
):
    """A typed complaint: same classifier, routing and database save as a spoken one, without the speech stage.
    Poll /api/status/{task_id} exactly as for an upload."""
    place = check_place(latitude, longitude, address_line, landmark, pincode)
    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="The complaint text is empty. Please type your complaint.")
    if len(text) > MAX_TEXT_CHARS:
        raise HTTPException(status_code=400, detail=f"The complaint is too long (limit {MAX_TEXT_CHARS} characters).")
    task_id = str(uuid.uuid4())
    task_tracker[task_id] = {"status": "processing"}

    def run_text_task(tid):
        def update_progress(msg):
            task_tracker[tid] = {"status": "processing", "step": msg}

        try:
            result = process_text_task(text, user_id, reporter_name, reporter_phone, location, extra_details,
                                       progress_callback=update_progress, before_photo_url=before_photo_url, place=place)
            task_tracker[tid] = {"status": "success", "ai_result": result}
        except Exception as e:
            task_tracker[tid] = {"status": "error", "error": str(e)}

    background_tasks.add_task(run_text_task, task_id)
    return {"task_id": task_id, "status": "processing"}

@app.get("/api/status/{task_id}")
async def get_status(task_id: str):
    """
    Endpoint for the frontend to poll the task status.
    """
    task_info = task_tracker.get(task_id)
    if not task_info:
        return {"status": "error", "error": "Task not found in memory"}
        
    return task_info
