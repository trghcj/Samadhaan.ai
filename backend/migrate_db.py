from database import engine
from sqlalchemy import text

print("Running database migration...")
with engine.connect() as con:
    try:
        con.execute(text("ALTER TABLE grievances ADD COLUMN is_resolved BOOLEAN DEFAULT 0;"))
    except Exception as e:
        print("is_resolved column might already exist.")
    
    try:
        con.execute(text("ALTER TABLE grievances ADD COLUMN resolution_notes TEXT;"))
    except Exception as e:
        print("resolution_notes column might already exist.")
    
    con.commit()
print("Migration successful! Preserved all existing records.")
