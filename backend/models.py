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
    is_resolved = Column(Boolean, default=False)
    resolution_notes = Column(String, nullable=True)
    citizen_uid = Column(String, nullable=True, index=True)
    resolved_at = Column(DateTime, nullable=True)

class User(Base):
    __tablename__ = "users"

    uid = Column(String, primary_key=True, index=True)
    email = Column(String, index=True)
    display_name = Column(String, nullable=True)
    role = Column(String, default="citizen") # 'citizen' or 'operator'
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, default=datetime.utcnow)
