from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

# Load backend/.env before reading DATABASE_URL (ai_pipeline.py imports this module before it loads .env itself)
load_dotenv()


def normalize_db_url(url):
    """Pin PostgreSQL URLs to the psycopg2 driver that requirements.txt installs.
    SQLAlchemy 2.1 maps a bare postgresql:// (and Heroku-style postgres://) to psycopg 3, which is not installed."""
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg2://" + url[len(prefix):]
    return url


# Using a standard PostgreSQL local connection string
# In a real setup, you would create this database via psql or pgAdmin
SQLALCHEMY_DATABASE_URL = normalize_db_url(os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost/samadhaanai"))

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
