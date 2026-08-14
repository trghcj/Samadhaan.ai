from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from celery.result import AsyncResult
from ai_pipeline import process_audio_task
import shutil
import os

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
async def upload_audio(file: UploadFile = File(...)):
    """
    Accepts audio, saves it locally, and queues the ML task in Celery.
    Returns immediately with a task_id so the frontend doesn't hang.
    """
    file_path = f"temp_audio/{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Dispatch Celery task
    task = process_audio_task.delay(file_path)
    
    return {"task_id": task.id, "status": "processing"}

@app.get("/api/status/{task_id}")
async def get_status(task_id: str):
    """
    Endpoint for the frontend to poll the task status.
    """
    task_result = AsyncResult(task_id)
    
    if task_result.ready():
        return {
            "status": "success",
            "ai_result": task_result.get()
        }
    return {"status": "processing"}
