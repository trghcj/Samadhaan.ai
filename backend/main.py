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

@app.get("/api/grievances")
def get_grievances(db: Session = Depends(get_db)):
    """Fetch all grievances for the Operator Dashboard"""
    grievances = db.query(models.Grievance).order_by(models.Grievance.created_at.desc()).all()
    return grievances

from pydantic import BaseModel
class ResolveRequest(BaseModel):
    notes: str

@app.patch("/api/grievances/{g_id}/resolve")
def resolve_grievance(g_id: int, req: ResolveRequest, db: Session = Depends(get_db)):
    grievance = db.query(models.Grievance).filter(models.Grievance.id == g_id).first()
    if not grievance:
        return {"error": "Not found"}
    grievance.is_resolved = True
    grievance.resolution_notes = req.notes
    db.commit()
    return {"status": "success"}

@app.post("/api/upload")
async def upload_audio(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
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
    def run_ai_task(tid, fp):
        try:
            result = process_audio_task(fp)
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
    background_tasks.add_task(run_ai_task, task_id, file_path)
    
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
