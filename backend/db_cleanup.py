from models.database import get_db
from models.aoi import AOI, AOIImage, AOIAnalysis

def cleanup():
    db = next(get_db())
    try:
        # Delete all images (cascade will not delete projects, it's just deleting the rows)
        num_images = db.query(AOIImage).delete()
        # Delete all analysis data
        num_analysis = db.query(AOIAnalysis).delete()
        
        # Set all projects to stopped
        aois = db.query(AOI).all()
        for aoi in aois:
            aoi.status = "stopped"
            
        db.commit()
        print(f"Successfully deleted {num_images} images and {num_analysis} analyses.")
        print(f"Successfully stopped {len(aois)} projects.")
    except Exception as e:
        db.rollback()
        print(f"Error during cleanup: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    cleanup()
