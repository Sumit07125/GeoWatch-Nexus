import requests, json, time

pair_id = '64e2bec0-ea80-43a1-afda-edd96fa377d6'
BASE = 'http://localhost:5000/api'

# Wait for server
for _ in range(10):
    try:
        r = requests.get(f'{BASE}/aoi', timeout=2)
        if r.status_code == 200:
            print("Backend up.")
            break
    except Exception:
        time.sleep(1)

print("=== TEST 1: binary-mask ===")
r1 = requests.get(f'{BASE}/images/{pair_id}/binary-mask')
ct = r1.headers.get('Content-Type', '?')
print(f"HTTP {r1.status_code}  content-type: {ct}  bytes: {len(r1.content)}")
assert r1.status_code == 200 and 'image/png' in ct

print("\n=== TEST 2: threshold=0.28 ===")
for attempt in range(3):
    try:
        r2 = requests.post(f'{BASE}/images/{pair_id}/threshold', json={'threshold': 0.28}, timeout=30)
        break
    except requests.exceptions.ConnectionError:
        print(f"  Attempt {attempt+1} failed (model loading?), retrying...")
        time.sleep(3)

print(f"HTTP {r2.status_code}")
assert r2.status_code == 200
d2 = r2.json()
print(f"  threshold: {d2['model']['threshold']}")
print(f"  changed %: {d2['binary_detection']['changed_percent_before_display_typing']:.4f}")
pct_028 = d2['binary_detection']['changed_percent_before_display_typing']

print("\n=== TEST 3: threshold=0.40 (more conservative) ===")
r3 = requests.post(f'{BASE}/images/{pair_id}/threshold', json={'threshold': 0.40})
print(f"HTTP {r3.status_code}")
assert r3.status_code == 200
d3 = r3.json()
print(f"  threshold: {d3['model']['threshold']}")
print(f"  changed %: {d3['binary_detection']['changed_percent_before_display_typing']:.4f}")
pct_040 = d3['binary_detection']['changed_percent_before_display_typing']
print(f"  pct@0.40 <= pct@0.28: {pct_040 <= pct_028}")

print("\n=== TEST 4: threshold=0.10 (more sensitive) ===")
r4 = requests.post(f'{BASE}/images/{pair_id}/threshold', json={'threshold': 0.10})
print(f"HTTP {r4.status_code}")
assert r4.status_code == 200
d4 = r4.json()
print(f"  threshold: {d4['model']['threshold']}")
print(f"  changed %: {d4['binary_detection']['changed_percent_before_display_typing']:.4f}")
pct_010 = d4['binary_detection']['changed_percent_before_display_typing']
print(f"  pct@0.10 >= pct@0.28: {pct_010 >= pct_028}")

print("\n=== TEST 5: threshold=1.5 invalid (expect 400) ===")
r5 = requests.post(f'{BASE}/images/{pair_id}/threshold', json={'threshold': 1.5})
print(f"HTTP {r5.status_code}  error: {r5.json().get('error','')[:80]}")
assert r5.status_code == 400

print("\n=== TEST 6: threshold=0 invalid (expect 400) ===")
r6 = requests.post(f'{BASE}/images/{pair_id}/threshold', json={'threshold': 0})
print(f"HTTP {r6.status_code}  error: {r6.json().get('error','')[:80]}")
assert r6.status_code == 400

print("\n=== RESET to 0.28 ===")
rr = requests.post(f'{BASE}/images/{pair_id}/threshold', json={'threshold': 0.28})
print(f"HTTP {rr.status_code}  threshold: {rr.json().get('model',{}).get('threshold')}")

print("\n=== ALL TESTS PASSED ===")
