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
        
    # 1. Calculate Loss (Deforestation)
    # diff where img1 > img2 (meaning vegetation decreased)
    loss_diff = cv2.subtract(img1, img2)
    _, loss_mask = cv2.threshold(loss_diff, 30, 255, cv2.THRESH_BINARY)
    
    # 2. Calculate Recovery (Reforestation)
    # diff where img2 > img1 (meaning vegetation increased)
    recovery_diff = cv2.subtract(img2, img1)
    _, recovery_mask = cv2.threshold(recovery_diff, 30, 255, cv2.THRESH_BINARY)
    
    # We'll save the loss mask for the map visualization
    _, buffer = cv2.imencode('.png', loss_mask)
    mask_bytes = buffer.tobytes()
    
    # Calculate statistics
    total_pixels = img1.shape[0] * img1.shape[1]
    
    loss_pixels = np.count_nonzero(loss_mask)
    recovery_pixels = np.count_nonzero(recovery_mask)
    
    percentage_changed = (loss_pixels / total_pixels) * 100
    
    # Each pixel is 10m x 10m = 100 sq meters. 1,000,000 sq meters in a sq km.
    area_km2 = (loss_pixels * 100) / 1000000.0
    recovery_area_km2 = (recovery_pixels * 100) / 1000000.0
    
    # Mean index of target image
    mean_index = float(np.mean(img2))
    
    # Density Breakdown for target image (approximate for NDVI scaled 0-255)
    barren_pixels = np.count_nonzero(img2 <= 100)
    sparse_pixels = np.count_nonzero((img2 > 100) & (img2 <= 160))
    dense_pixels = np.count_nonzero(img2 > 160)
    
    barren_percent = (barren_pixels / total_pixels) * 100
    sparse_percent = (sparse_pixels / total_pixels) * 100
    dense_percent = (dense_pixels / total_pixels) * 100
    
    return {
        "mask_bytes": mask_bytes,
        "percentage_changed": round(percentage_changed, 2),
        "area_km2": round(area_km2, 2),
        "recovery_area_km2": round(recovery_area_km2, 2),
        "mean_index": round(mean_index, 2),
        "barren_percent": round(barren_percent, 2),
        "sparse_percent": round(sparse_percent, 2),
        "dense_percent": round(dense_percent, 2)
    }
