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

class Operator(Base):
    __tablename__ = "operators"

    uid = Column(String, primary_key=True, index=True)
    email = Column(String, index=True)
    display_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, default=datetime.utcnow)
