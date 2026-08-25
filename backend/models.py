from sqlalchemy import Column, Integer, String, DateTime, Float, Boolean
from datetime import datetime
from database import Base

class Grievance(Base):
    __tablename__ = "grievances"

    id = Column(Integer, primary_key=True, index=True)
    transcript = Column(String, index=True)
    prediction = Column(String)
    confidence = Column(String)
    confidence_score = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolution_notes = Column(String, nullable=True)
    citizen_uid = Column(String, nullable=True, index=True)
    resolved_at = Column(DateTime, nullable=True)
    is_resolved = Column(Boolean, default=False)
    
    # Uncertainty-Aware Routing Fields
    clarifying_question = Column(String, nullable=True)
    alternative_departments = Column(String, nullable=True)
    
    # New Fields for Anonymous/Detailed Reporting
    reporter_name = Column(String, nullable=True)
    reporter_phone = Column(String, nullable=True)
    location = Column(String, nullable=True)
    extra_details = Column(String, nullable=True)
    
    before_photo_url = Column(String, nullable=True)
    after_photo_url = Column(String, nullable=True)

    # SLA & Priority
    priority = Column(String, default="Medium") # High, Medium, Low
    sla_deadline = Column(DateTime, nullable=True)
    
    # Verification
    ai_verification_status = Column(String, default="Pending") # Pending, Verified, Rejected
    ai_verification_notes = Column(String, nullable=True)

class User(Base):
    __tablename__ = "users"

    uid = Column(String, primary_key=True, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    display_name = Column(String, nullable=True)
    role = Column(String, default="citizen")
    department = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, default=datetime.utcnow)
