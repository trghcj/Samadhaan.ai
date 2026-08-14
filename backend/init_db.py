import os
from database import engine, Base, SessionLocal
import models

print("Creating database tables...")
# Drop and recreate tables to ensure clean slate
Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)

print("Populating mock data for Operator Dashboard...")
db = SessionLocal()

mock_data = [
    models.Grievance(
        transcript="Paani aa raha hai par light nahi hai motor ke liye", 
        prediction="Water, Electricity", 
        confidence="Medium", 
        confidence_score=0.65
    ),
    models.Grievance(
        transcript="meter is completely burnt outside the house", 
        prediction="Electricity", 
        confidence="High", 
        confidence_score=0.92
    ),
    models.Grievance(
        transcript="road is broken near the main school junction", 
        prediction="Public Works", 
        confidence="High", 
        confidence_score=0.88
    ),
    models.Grievance(
        transcript="[noisy audio] kachra... bohot... badbu...", 
        prediction="Sanitation", 
        confidence="Low", 
        confidence_score=0.30
    )
]

db.add_all(mock_data)
db.commit()
print("Database successfully populated with Samadhaan.ai mock data!")
db.close()
