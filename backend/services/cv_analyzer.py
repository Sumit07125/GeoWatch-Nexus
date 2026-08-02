import cv2
import numpy as np
import os
import base64

def analyze_change(idx1_data, idx2_data, session_id):
    if isinstance(idx1_data, str):
        img1 = cv2.imread(idx1_data, cv2.IMREAD_GRAYSCALE)
    else:
        img1 = cv2.imdecode(np.frombuffer(idx1_data, np.uint8), cv2.IMREAD_GRAYSCALE)
        
    if isinstance(idx2_data, str):
        img2 = cv2.imread(idx2_data, cv2.IMREAD_GRAYSCALE)
    else:
        img2 = cv2.imdecode(np.frombuffer(idx2_data, np.uint8), cv2.IMREAD_GRAYSCALE)
    
    if img1 is None or img2 is None:
        raise ValueError("Failed to load index images for CV processing.")
        
    # Absolute difference
    diff = cv2.absdiff(img1, img2)
    
    # Thresholding (adjust this value based on sensitivity needs)
    # A difference of 30 out of 255 represents an ~11% change in index value
    _, mask = cv2.threshold(diff, 30, 255, cv2.THRESH_BINARY)
    
    # Instead of saving mask to disk, encode it as a base64 Data URL
    _, buffer = cv2.imencode('.png', mask)
    mask_b64 = base64.b64encode(buffer).decode('utf-8')
    mask_url = f"data:image/png;base64,{mask_b64}"
    
    # Calculate statistics
    changed_pixels = np.count_nonzero(mask)
    total_pixels = img1.shape[0] * img1.shape[1]
    
    percentage_changed = (changed_pixels / total_pixels) * 100
    
    # Each pixel is 10m x 10m = 100 sq meters. 1,000,000 sq meters in a sq km.
    area_km2 = (changed_pixels * 100) / 1000000.0
    
    return {
        "mask_url": mask_url,
        "percentage_changed": round(percentage_changed, 2),
        "area_km2": round(area_km2, 2)
    }
