import ee
import datetime
import logging
from .logger_service import add_log

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_best_cloud_free_image(roi, target_date_str, cloud_threshold=0.60, max_cloud_pct=20):
    """
    Gets the best cloud-free image/mosaic around a target date.
    Automatically expands search up to +/- 30 days if necessary.
    """
    target_date = datetime.datetime.strptime(target_date_str, "%Y-%m-%d")
    
    # Try tight 15-day window first, then expand to 30 days
    for window_days in [15, 30]:
        start_date = (target_date - datetime.timedelta(days=window_days)).strftime("%Y-%m-%d")
        end_date = (target_date + datetime.timedelta(days=window_days)).strftime("%Y-%m-%d")
        
        add_log(f"Cloud Masking: Trying date window {start_date} to {end_date} (±{window_days} days) with max scene cloud % {max_cloud_pct}", type="info")
        
        mosaic = _try_get_mosaic(roi, start_date, end_date, cloud_threshold, max_cloud_pct)
        if mosaic is not None:
            add_log("Cloud Masking: Successfully generated cloud-free mosaic.", type="info")
            return mosaic
            
    add_log("Cloud Masking: Could not find a cloud-free image within ±30 days. Returning the best available.", type="warning")
    # Fallback to returning the best available (even if scene metadata says it's cloudy)
    start_date = (target_date - datetime.timedelta(days=30)).strftime("%Y-%m-%d")
    end_date = (target_date + datetime.timedelta(days=30)).strftime("%Y-%m-%d")
    mosaic = _try_get_mosaic(roi, start_date, end_date, cloud_threshold, max_cloud_pct=100) # Accept anything
    return mosaic

def get_cloud_free_mosaic_for_year(roi, year, cloud_threshold=0.60, max_cloud_pct=100):
    """
    Gets a cloud-free mosaic for an entire year.
    For annual mosaics, we can accept higher scene-level cloud percentage since median 
    compositing of many masked scenes will yield a clear pixel.
    """
    start_date = f"{year}-01-01"
    end_date = f"{year}-12-31"
    add_log(f"Cloud Masking: Generating annual clear-sky mosaic for {year}", type="info")
    
    mosaic = _try_get_mosaic(roi, start_date, end_date, cloud_threshold, max_cloud_pct)
    return mosaic

def _try_get_mosaic(roi, start_date, end_date, cloud_threshold, max_cloud_pct):
    """
    Core Earth Engine logic to fetch, join, mask, and composite.
    """
    # 1. Fetch Sentinel-2 Harmonized imagery
    s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
        .filterBounds(roi) \
        .filterDate(start_date, end_date)
    
    # 2. Filter by scene metadata to eliminate completely overcast scenes quickly
    if max_cloud_pct < 100:
        s2 = s2.filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', max_cloud_pct))
    
    try:
        # Check if there are any images in this query
        count = s2.size().getInfo()
        if count == 0:
            return None
    except Exception as e:
        add_log(f"Error checking collection size: {e}", type="error")
        return None
        
    try:
        # 3. Try using Google's latest Cloud Score+ dataset
        # This is a highly accurate ML dataset trained for S2 Harmonized
        cs_plus = ee.ImageCollection("GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED")
        s2_linked = s2.linkCollection(cs_plus, ['cs'])
        
        def mask_cs_plus(image):
            # 'cs' (Clear Score) ranges from 0 to 1
            mask = image.select('cs').gte(cloud_threshold)
            return image.updateMask(mask)
            
        masked_col = s2_linked.map(mask_cs_plus)
        add_log(f"Cloud Masking: Applied GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED to {count} images.", type="info")
        
    except Exception as e:
        add_log(f"Cloud Score+ failed or unavailable: {e}. Falling back to S2_CLOUD_PROBABILITY.", type="warning")
        
        # 4. Fallback to s2cloudless (Copernicus S2 Cloud Probability)
        try:
            s2c = ee.ImageCollection("COPERNICUS/S2_CLOUD_PROBABILITY")
            s2_linked = s2.linkCollection(s2c, ['probability'])
            
            # If threshold is 0.60 (clear), we tolerate up to 40% probability of cloud
            max_prob = (1.0 - cloud_threshold) * 100
            
            def mask_s2cloudless(image):
                mask = image.select('probability').lt(max_prob)
                return image.updateMask(mask)
                
            masked_col = s2_linked.map(mask_s2cloudless)
            add_log(f"Cloud Masking: Applied COPERNICUS/S2_CLOUD_PROBABILITY to {count} images.", type="info")
        except Exception as e2:
            add_log(f"Fallback cloud masking also failed: {e2}. Proceeding unmasked.", type="error")
            masked_col = s2
        
    # 5. Create a quality mosaic. Median compositing of the strictly clear pixels 
    # removes remaining artifacts (like moving vehicles or small shadows).
    # We clip it to the ROI to save bandwidth.
    return masked_col.median().clip(roi)
