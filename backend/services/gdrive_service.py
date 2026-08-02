import os
import shutil

# We will store everything locally instead of Google Drive to bypass all logins!
LOCAL_DRIVE_PATH = os.path.join(os.path.dirname(__file__), '..', 'local_drive')

def ensure_dir(path):
    if not os.path.exists(path):
        os.makedirs(path)

def upload_image(project_name, date_str, file_path, file_name):
    """Saves the image locally instead of Google Drive."""
    try:
        project_dir = os.path.join(LOCAL_DRIVE_PATH, project_name)
        date_dir = os.path.join(project_dir, date_str)
        ensure_dir(date_dir)
        
        destination = os.path.join(date_dir, file_name)
        
        # Don't overwrite if it exists
        if os.path.exists(destination):
            return True
            
        shutil.copy2(file_path, destination)
        print(f"Saved locally: {project_name}/{date_str}/{file_name}")
        return True
    except Exception as e:
        print(f"Local Save Error: {e}")
        return False

def list_project_images(project_name):
    """Reads the local directory structure and returns available images."""
    try:
        project_dir = os.path.join(LOCAL_DRIVE_PATH, project_name)
        if not os.path.exists(project_dir):
            return []
            
        result = []
        # Sort dates descending (newest first)
        date_folders = sorted(os.listdir(project_dir), reverse=True)
        
        for date_str in date_folders:
            date_dir = os.path.join(project_dir, date_str)
            if not os.path.isdir(date_dir):
                continue
                
            files = os.listdir(date_dir)
            images = {}
            for f in files:
                # The file_id is just the relative path
                # e.g. "Amazon hotspot/2023-01-01/rgb.png"
                # but we will URL encode the path in the route, so just construct the relative path
                rel_path = f"{project_name}/{date_str}/{f}"
                images[f] = rel_path
                
            result.append({
                "date": date_str,
                "images": images
            })
            
        return result
    except Exception as e:
        print(f"Error reading local drive: {e}")
        return []

def download_file_binary(file_id):
    """Reads binary data from local storage."""
    try:
        # file_id is actually the relative path here
        target_path = os.path.join(LOCAL_DRIVE_PATH, file_id)
        if not os.path.exists(target_path):
            raise Exception(f"File not found locally: {target_path}")
            
        with open(target_path, 'rb') as f:
            return f.read()
    except Exception as e:
        print(f"Error downloading local file: {e}")
        raise e
