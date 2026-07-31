import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.exc import OperationalError

# Database configuration
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASS", "sumit")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_NAME = os.getenv("DB_NAME", "geowatch")

# URL for creating the database (no DB selected)
BASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}/"
# Full URL including the target DB
SQLALCHEMY_DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}/{DB_NAME}"

# Attempt to create the database if it doesn't exist
try:
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    with engine.connect() as conn:
        pass # successfully connected
except OperationalError:
    print(f"Database '{DB_NAME}' not found. Attempting to create it...")
    try:
        base_engine = create_engine(BASE_URL)
        with base_engine.connect() as conn:
            conn.execute(text(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}"))
            conn.commit()
        engine = create_engine(SQLALCHEMY_DATABASE_URL)
    except Exception as e:
        print(f"Failed to create database automatically: {e}")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
