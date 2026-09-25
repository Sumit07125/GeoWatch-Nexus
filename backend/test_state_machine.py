import requests, time

payload_tamia = {'name': 'Tamia4', 'shape_type': 'point', 'coordinates': [[22.34432, 78.66718]]}
payload_delhi = {'name': 'Delhi4', 'shape_type': 'point', 'coordinates': [[28.6139, 77.2090]]}

r1 = requests.post('http://localhost:5000/api/aoi', json=payload_tamia)
t_aoi_id = r1.json()['aoi']['id']
r1f = requests.post(f'http://localhost:5000/api/aoi/{t_aoi_id}/fetch-images')
t_pid = r1f.json()['pair']['id']

r2 = requests.post('http://localhost:5000/api/aoi', json=payload_delhi)
d_aoi_id = r2.json()['aoi']['id']
r2f = requests.post(f'http://localhost:5000/api/aoi/{d_aoi_id}/fetch-images')
d_pid = r2f.json()['pair']['id']

print('Tamia4 PID:', t_pid)
print('Delhi4 PID:', d_pid)

def wait_for_terminal(pid, name):
    print(f'Monitoring {name} ({pid})...', flush=True)
    while True:
        try:
            r = requests.get(f'http://localhost:5000/api/images/{pid}/progress')
            d = r.json()
            status = d.get('status')
            if status in ['done', 'error']:
                print(f'{name} terminal state: {status}', flush=True)
                print('Progress:', d, flush=True)
                if status == 'done':
                    rb = requests.get(f'http://localhost:5000/api/images/{pid}/before')
                    ra = requests.get(f'http://localhost:5000/api/images/{pid}/after')
                    print(f'{name} PNG checks:', rb.status_code, ra.status_code, flush=True)
                break
            else:
                print(f'{name} status:', status, '|', d.get('message'), flush=True)
        except Exception as e:
            print('Error checking progress:', e, flush=True)
        time.sleep(10)

wait_for_terminal(t_pid, 'Tamia4')
wait_for_terminal(d_pid, 'Delhi4')
