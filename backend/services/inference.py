import torch
import numpy as np
import os
from PIL import Image
from ml.unet import SiameseAttentionUNet

MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "ml_models", "best_model.pt")

def load_model():
    model = SiameseAttentionUNet(in_channels=13, base_ch=96)
    if os.path.exists(MODEL_PATH):
        try:
            checkpoint = torch.load(MODEL_PATH, map_location=torch.device('cpu'))
            if "model_state" in checkpoint:
                model.load_state_dict(checkpoint["model_state"])
            else:
                model.load_state_dict(checkpoint)
            model.eval()
            print("Model loaded successfully.")
        except Exception as e:
            print(f"Failed to load weights: {e}")
    else:
        print("Warning: best_model.pt not found. Using untrained weights.")
    return model

def run_inference(img1_tensor, img2_tensor):
    """
    Takes two tensors (before and after) and returns a change mask.
    """
    model = load_model()
    
    with torch.no_grad():
        if len(img1_tensor.shape) == 3:
            img1_tensor = img1_tensor.unsqueeze(0)
            img2_tensor = img2_tensor.unsqueeze(0)
            
        output = model(img1_tensor, img2_tensor)
        
        if output is None:
            # Fallback if the user hasn't implemented their model yet
            print("Warning: Model returned None. Generating mock mask.")
            pred_mask = torch.zeros((img1_tensor.shape[2], img1_tensor.shape[3]))
            pred_mask[100:200, 100:200] = 1.0
        else:
            pred_mask = (output > 0.5).float()
            pred_mask = pred_mask.squeeze()
        
    return pred_mask.numpy()

def generate_and_save_mask(current_array, historical_array, aoi_id):
    # tifffile usually returns (H, W, C). Check if channels is last.
    if current_array.shape[-1] == 13:
        current_array = np.transpose(current_array, (2, 0, 1))
        historical_array = np.transpose(historical_array, (2, 0, 1))
        
    t1 = torch.tensor(current_array, dtype=torch.float32)
    t2 = torch.tensor(historical_array, dtype=torch.float32)
    
    mask = run_inference(t1, t2)
    
    mask_img = (mask * 255).astype(np.uint8)
    
    static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
    os.makedirs(static_dir, exist_ok=True)
    mask_path = os.path.join(static_dir, f"mask_{aoi_id}.png")
    
    Image.fromarray(mask_img).save(mask_path)
    
    return f"http://localhost:5000/static/mask_{aoi_id}.png"
