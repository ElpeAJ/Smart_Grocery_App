import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

# Use SQLite for development (no server needed)
# Switch to PostgreSQL by setting DATABASE_URL in .env for production
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./smart_grocery.db")

# For SQLite, add `check_same_thread=False`
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
