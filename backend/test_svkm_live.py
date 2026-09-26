import requests, time, sys

BASE = "http://localhost:5000"
AOI_ID = "0ebec038-1537-4206-b84c-22e5f7f42359"

# Check for existing done pair first
pairs_r = requests.get(f"{BASE}/api/aoi/{AOI_ID}/images")
pairs_r.raise_for_status()
pairs = pairs_r.json().get("pairs", [])
done_pairs = [p for p in pairs if p.get("status") == "done"]
if done_pairs:
    pair_id = done_pairs[-1]["id"]
    print(f"Found existing DONE pair: {pair_id}")
    fetch_needed = False
else:
    fetch_needed = True

if fetch_needed:
    resp = requests.post(f"{BASE}/api/aoi/{AOI_ID}/fetch-images")
    print(f"POST fetch-images: HTTP {resp.status_code}")
    body = resp.json()
    print("Body:", body)
    pair_id = body.get("pair_id") or body.get("id")
    print(f"pair_id: {pair_id}")

    print("Polling (up to 35 min)...")
    deadline = time.time() + 2100
    interval = 15
    prev_msg = ""
    while time.time() < deadline:
        time.sleep(interval)
        pr = requests.get(f"{BASE}/api/images/{pair_id}/progress")
        if pr.status_code == 200:
            d = pr.json()
            state = d.get("state", "?")
            msg = d.get("message", "")
            if msg != prev_msg:
                print(f"  [{state}] {msg}")
                prev_msg = msg
            if state == "done":
                print("\nSVKM acquisition: DONE")
                break
            if state == "error":
                print(f"\nSVKM acquisition: ERROR\n  {msg}")
                sys.exit(1)
        interval = min(30, interval + 5)
    else:
        print("TIMEOUT")
        sys.exit(1)

# Verify endpoints
print("\nVerifying endpoints...")
for endpoint in ["before", "after", "acquisition"]:
    r2 = requests.get(f"{BASE}/api/images/{pair_id}/{endpoint}")
    ok = "OK" if r2.status_code == 200 else "FAIL"
    print(f"  GET /{endpoint}: HTTP {r2.status_code} [{ok}]")
    if r2.status_code != 200:
        sys.exit(1)

# Run analysis
print("\nRunning analysis...")
ar = requests.post(f"{BASE}/api/images/{pair_id}/analyze", json={}, timeout=300)
print(f"POST /analyze: HTTP {ar.status_code}")
if ar.status_code != 200:
    print("Error:", ar.text[:400])
    sys.exit(1)

data = ar.json()
acq = data.get("acquisition", {})
print("\n=== SVKM FULL TEST PASSED ===")
print(f"  Selected orbit : {acq.get('common_orbit')}")
print(f"  S1 T1 count    : {acq.get('s1_count_t1')}")
print(f"  S1 T2 count    : {acq.get('s1_count_t2')}")
print(f"  Analysis status: {data.get('status')}")
print(f"  Model device   : {data.get('model', {}).get('device')}")
