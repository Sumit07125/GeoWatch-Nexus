import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "Academic", "SEM-VII", "Major_Project", "Code", "backend"))

from services.gdrive_service import get_gdrive_service

def delete_all():
    service = get_gdrive_service()
    results = service.files().list(spaces='drive', fields='files(id, name)').execute()
    for item in results.get('files', []):
        try:
            service.files().delete(fileId=item['id']).execute()
            print(f"Deleted {item['name']}")
        except Exception as e:
            print(f"Failed to delete {item['name']}: {e}")

if __name__ == '__main__':
    delete_all()
