import os
import io
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaIoBaseDownload

SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'satellite-based-428549d148ef.json')
SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive']

def get_drive_service():
    if not os.path.exists(SERVICE_ACCOUNT_FILE):
        raise FileNotFoundError(f"Service account file not found at {SERVICE_ACCOUNT_FILE}")
    creds = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES)
    return build('drive', 'v3', credentials=creds)

def get_or_create_folder(service, folder_name, parent_id=None):
    query = f"mimeType='application/vnd.google-apps.folder' and name='{folder_name}' and trashed=false"
    if parent_id:
        query += f" and '{parent_id}' in parents"
    else:
        query += " and 'root' in parents"
        
    response = service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
    files = response.get('files', [])
    
    if not files:
        file_metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder'
        }
        if parent_id:
            file_metadata['parents'] = [parent_id]
        folder = service.files().create(body=file_metadata, fields='id').execute()
        return folder.get('id')
    return files[0].get('id')

def upload_image(project_name, date_str, file_data, file_name, is_bytes=False):
    try:
        service = get_drive_service()
        root_id = get_or_create_folder(service, 'GeoWatch_Data')
        project_id = get_or_create_folder(service, project_name, root_id)
        date_id = get_or_create_folder(service, date_str, project_id)
        
        query = f"name='{file_name}' and '{date_id}' in parents and trashed=false"
        response = service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
        if response.get('files', []):
            return True
            
        file_metadata = {
            'name': file_name,
            'parents': [date_id]
        }
        
        if is_bytes:
            media = MediaIoBaseUpload(io.BytesIO(file_data), mimetype='image/png', resumable=True)
        else:
            from googleapiclient.http import MediaFileUpload
            media = MediaFileUpload(file_data, mimetype='image/png', resumable=True)
            
        service.files().create(body=file_metadata, media_body=media, fields='id').execute()
        print(f"Uploaded to GDrive: {project_name}/{date_str}/{file_name}")
        return True
    except Exception as e:
        print(f"GDrive Upload Error: {e}")
        return False

def list_project_images(project_name):
    try:
        service = get_drive_service()
        response = service.files().list(q="mimeType='application/vnd.google-apps.folder' and name='GeoWatch_Data' and trashed=false", spaces='drive', fields='files(id)').execute()
        if not response.get('files'): return []
        root_id = response.get('files')[0]['id']
        
        response = service.files().list(q=f"mimeType='application/vnd.google-apps.folder' and name='{project_name}' and '{root_id}' in parents and trashed=false", spaces='drive', fields='files(id)').execute()
        if not response.get('files'): return []
        project_id = response.get('files')[0]['id']
        
        response = service.files().list(q=f"mimeType='application/vnd.google-apps.folder' and '{project_id}' in parents and trashed=false", spaces='drive', fields='files(id, name)').execute()
        date_folders = response.get('files', [])
        date_folders.sort(key=lambda x: x['name'], reverse=True)
        
        result = []
        for d in date_folders:
            date_id = d['id']
            date_str = d['name']
            
            response = service.files().list(q=f"'{date_id}' in parents and trashed=false", spaces='drive', fields='files(id, name)').execute()
            files = response.get('files', [])
            
            images = {}
            for f in files:
                images[f['name']] = f['id']
                
            result.append({
                "date": date_str,
                "images": images
            })
            
        return result
    except Exception as e:
        print(f"Error reading GDrive: {e}")
        return []

def download_file_binary(file_id):
    try:
        service = get_drive_service()
        request = service.files().get_media(fileId=file_id)
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while done is False:
            status, done = downloader.next_chunk()
        return fh.getvalue()
    except Exception as e:
        print(f"Error downloading GDrive file: {e}")
        raise e
