import requests

tamia_id = 'ecf79446-cdc0-4463-99cc-300e0b14a428'
delhi_id = '1fd28e8e-c4b1-490e-9d01-4f684019a689'

def get_latest_pair(aoi_id):
    r = requests.get(f'http://localhost:5000/api/aoi/{aoi_id}/images')
    pairs = r.json().get('pairs', [])
    if pairs:
        pairs.sort(key=lambda p: p.get('created_at', ''))
        return pairs[-1]
    return None

tamia_pair = get_latest_pair(tamia_id)
delhi_pair = get_latest_pair(delhi_id)

if tamia_pair:
    pid = tamia_pair['id']
    print('Tamia:', requests.get(f'http://localhost:5000/api/images/{pid}/progress').json())

if delhi_pair:
    pid = delhi_pair['id']
    print('Delhi:', requests.get(f'http://localhost:5000/api/images/{pid}/progress').json())
