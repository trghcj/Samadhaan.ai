from fastapi import FastAPI, File, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from ai_pipeline import process_audio_task
import shutil
import os
import uuid

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

# Create tables if they don't exist
models.Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/")
async def root():
    return {"message": "Samadhaan.ai Backend is running", "status": "ok"}

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
    grievance.is_resolved = True
    grievance.resolution_notes = req.resolution_notes
    grievance.after_photo_url = req.after_photo_url
    grievance.resolved_at = datetime.utcnow()
    db.commit()
    return {"status": "success"}

@app.delete("/api/grievances/{g_id}")
def delete_grievance(g_id: int, db: Session = Depends(get_db)):
    grievance = db.query(models.Grievance).filter(models.Grievance.id == g_id).first()
    if not grievance:
        return {"error": "Not found", "status": 404}
    
    db.delete(grievance)
    db.commit()
    return {"status": "success"}

class ClarifyRequest(BaseModel):
    answer: str

@app.patch("/api/grievances/{g_id}/clarify")
def clarify_grievance(g_id: int, req: ClarifyRequest, db: Session = Depends(get_db)):
    grievance = db.query(models.Grievance).filter(models.Grievance.id == g_id).first()
    if not grievance:
        return {"error": "Not found"}
    
    # Append the citizen's clarification to the main transcript so operators can see it
    grievance.transcript = f"{grievance.transcript}\n\n[Citizen Clarification]: {req.answer}"
    # Clear the question so it doesn't prompt again
    grievance.clarifying_question = None 
    # Bump confidence up since they clarified
    grievance.confidence = "High"
    
    db.commit()
    return {"status": "success"}
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
    before_photo_url: Optional[str] = Form(None)
):
    """
    Accepts audio, saves it locally, and queues the ML task in FastAPI BackgroundTasks.
    Returns immediately with a task_id so the frontend doesn't hang.
    """
    file_path = f"temp_audio/{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Generate unique task ID
    task_id = str(uuid.uuid4())
    task_tracker[task_id] = {"status": "processing"}
    
    # Define the background worker function
    def run_ai_task(tid, fp, c_uid, r_name, r_phone, loc, extra, b_photo):
        def update_progress(msg):
            task_tracker[tid] = {"status": "processing", "step": msg}
            print(f"Task {tid} progress: {msg}")
            
        try:
            result = process_audio_task(fp, c_uid, r_name, r_phone, loc, extra, progress_callback=update_progress, before_photo_url=b_photo)
            task_tracker[tid] = {
                "status": "success",
                "ai_result": result
            }
        except Exception as e:
            task_tracker[tid] = {
                "status": "error",
                "error": str(e)
            }
            
    # Dispatch native FastAPI background task
    background_tasks.add_task(run_ai_task, task_id, file_path, user_id, reporter_name, reporter_phone, location, extra_details, before_photo_url)
    
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
