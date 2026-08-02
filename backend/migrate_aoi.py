import os
import sys

# Add the current directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from models.database import engine
from sqlalchemy import text

def add_settings_column():
    with engine.connect() as conn:
        try:
            # Check if column exists
            result = conn.execute(text("SHOW COLUMNS FROM aois LIKE 'settings_json'")).fetchone()
            if result:
                print("Column 'settings_json' already exists.")
            else:
                conn.execute(text("ALTER TABLE aois ADD COLUMN settings_json TEXT"))
                print("Successfully added 'settings_json' column to 'aois' table.")
        except Exception as e:
            print(f"Error executing migration: {e}")

if __name__ == "__main__":
    add_settings_column()
