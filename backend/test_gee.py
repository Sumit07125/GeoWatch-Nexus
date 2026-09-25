import ee
import requests
ee.Initialize(project='satellite-based')
img = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(ee.Geometry.Point([78.67, 22.34])).filterDate('2024-01-01', '2024-03-01').median().select(['B4','B3','B2'])
aoi = ee.Geometry.Point([78.67, 22.34]).buffer(500).bounds()
url = img.getDownloadURL({'region': aoi, 'scale': 10, 'format': 'GEO_TIFF'})
r = requests.get(url)
print('Content-Type:', r.headers.get('Content-Type'))
print('First 10 bytes:', r.content[:10])
