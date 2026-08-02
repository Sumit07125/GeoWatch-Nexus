import os
import sys

# Add the current directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from models.database import engine
from sqlalchemy import text

def add_columns():
    with engine.connect() as conn:
        try:
            # Check if status column exists
            result = conn.execute(text("SHOW COLUMNS FROM aois LIKE 'status'")).fetchone()
            if result:
                print("Column 'status' already exists.")
            else:
                conn.execute(text("ALTER TABLE aois ADD COLUMN status VARCHAR(50) DEFAULT 'stopped'"))
                print("Successfully added 'status' column to 'aois' table.")
                
            # Check if start_time column exists
            result2 = conn.execute(text("SHOW COLUMNS FROM aois LIKE 'start_time'")).fetchone()
            if result2:
                print("Column 'start_time' already exists.")
            else:
                conn.execute(text("ALTER TABLE aois ADD COLUMN start_time DATETIME NULL"))
                print("Successfully added 'start_time' column to 'aois' table.")
        except Exception as e:
            print(f"Error executing migration: {e}")

if __name__ == "__main__":
    add_columns()
