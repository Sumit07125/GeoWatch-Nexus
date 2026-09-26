"""
GeoWatch-Nexus — End-to-End Inference Test Suite
=================================================
Run from: backend/

    python test_inference_e2e.py

Tests:
  - Navi Mumbai (1x1 grid, direct TIFF)
  - Atal Setu (2x2 grid, direct TIFF)

Per-pair assertions:
  - analyze_pair() returns without exception
  - 17-channel tensors have correct shape
  - probability: float32, same H/W as input, finite, in [0, 1]
  - binary mask: uint8, same H/W
  - type mask: uint8, same H/W
  - artifacts on disk: change_mask.png, change_mask_binary.png, t2_mask_overlay.png,
    change_probability.npy, change_mask_binary.npy, change_type_mask.npy
  - Threshold 0.28 (default), 0.10 and 0.40 via apply_threshold()

Scientific contract constants (must not change):
  - THRESHOLD = 0.28
  - INPUT_CHANNELS = 17
  - PAIR_PATCH = 128
  - RESOLUTION_M = 10
  - INFERENCE_STRIDE = 128
"""

from __future__ import annotations

import sys
import os
from pathlib import Path

# Ensure backend package is importable when run from within backend/
_BACKEND = Path(__file__).resolve().parent
sys.path.insert(0, str(_BACKEND))

import numpy as np

# ---------------------------------------------------------------------------
# Constants — must match the production contract
# ---------------------------------------------------------------------------
EXPECTED_THRESHOLD = 0.28
EXPECTED_CHANNELS  = 17
EXPECTED_PATCH     = 128
EXPECTED_RESOLUTION = 10
EXPECTED_STRIDE    = 128

# ---------------------------------------------------------------------------
# Known pair IDs
# ---------------------------------------------------------------------------
PAIRS = [
    {
        "name":   "Navi Mumbai (1x1)",
        "pair_id": "25482c4e-3ab4-441c-a3b4-bdae4a148a30",
        "expected_h": 128,
        "expected_w": 128,
    },
    {
        "name":   "Atal Setu (2x2)",
        "pair_id": "382c95cf-50fe-4deb-b0f3-1ad98492ce6f",
        "expected_h": 256,
        "expected_w": 256,
    },
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _pair_dir(pair_id: str) -> Path:
    data_root = _BACKEND / "data"
    return data_root / pair_id


def run_pair(spec: dict) -> None:
    name    = spec["name"]
    pair_id = spec["pair_id"]
    exp_h   = spec["expected_h"]
    exp_w   = spec["expected_w"]

    print(f"\n{'='*60}")
    print(f"  {name}  [{pair_id}]")
    print(f"{'='*60}")

    # 1 ── Import & contract checks ────────────────────────────────
    from services.inference_service import (
        analyze_pair, apply_threshold,
        THRESHOLD, INPUT_CHANNELS, PAIR_PATCH, RESOLUTION_M, INFERENCE_STRIDE,
    )
    assert THRESHOLD         == EXPECTED_THRESHOLD, \
        f"THRESHOLD changed! expected {EXPECTED_THRESHOLD}, got {THRESHOLD}"
    assert INPUT_CHANNELS    == EXPECTED_CHANNELS,  \
        f"INPUT_CHANNELS changed! expected {EXPECTED_CHANNELS}, got {INPUT_CHANNELS}"
    assert PAIR_PATCH        == EXPECTED_PATCH,      \
        f"PAIR_PATCH changed! expected {EXPECTED_PATCH}, got {PAIR_PATCH}"
    assert RESOLUTION_M      == EXPECTED_RESOLUTION, \
        f"RESOLUTION_M changed! expected {EXPECTED_RESOLUTION}, got {RESOLUTION_M}"
    assert INFERENCE_STRIDE  == EXPECTED_STRIDE,     \
        f"INFERENCE_STRIDE changed! expected {EXPECTED_STRIDE}, got {INFERENCE_STRIDE}"
    print("  [PASS] Scientific contract constants unchanged")

    # 2 ── Run inference ───────────────────────────────────────────
    result = analyze_pair(pair_id)
    assert result is not None, "analyze_pair() returned None"
    assert result.get("status") == "complete", \
        f"Expected status='complete', got {result.get('status')}"
    print("  [PASS] analyze_pair() completed successfully")

    # 3 ── Model metadata ──────────────────────────────────────────
    model_meta = result.get("model", {})
    assert model_meta.get("threshold") == EXPECTED_THRESHOLD, \
        f"Result threshold mismatch: {model_meta.get('threshold')}"
    assert model_meta.get("input_channels") == EXPECTED_CHANNELS, \
        f"Result channel count mismatch: {model_meta.get('input_channels')}"
    print(f"  [PASS] model metadata: device={model_meta.get('device')}, threshold={model_meta.get('threshold')}")

    # 4 ── Input shape ─────────────────────────────────────────────
    input_shape = result.get("input_shape", {})
    got_h = input_shape.get("height")
    got_w = input_shape.get("width")
    assert got_h == exp_h, f"Height mismatch: expected {exp_h}, got {got_h}"
    assert got_w == exp_w, f"Width mismatch: expected {exp_w}, got {got_w}"
    print(f"  [PASS] input shape: {got_h}x{got_w}")

    # 5 ── Probability array ───────────────────────────────────────
    pair_path = _pair_dir(pair_id)
    prob_path = pair_path / "change_probability.npy"
    assert prob_path.is_file(), f"change_probability.npy missing at {prob_path}"
    prob = np.load(prob_path)
    assert prob.dtype == np.float32,     f"Probability dtype wrong: {prob.dtype}"
    assert prob.shape == (exp_h, exp_w), f"Probability shape wrong: {prob.shape}"
    assert np.isfinite(prob).all(),      "Probability contains non-finite values"
    assert prob.min() >= 0.0,            f"Probability below 0: min={prob.min()}"
    assert prob.max() <= 1.0,            f"Probability above 1: max={prob.max()}"
    print(f"  [PASS] probability: shape={prob.shape}, range=[{prob.min():.4f}, {prob.max():.4f}]")

    # 6 ── Binary mask ─────────────────────────────────────────────
    bin_path = pair_path / "change_mask_binary.npy"
    assert bin_path.is_file(), f"change_mask_binary.npy missing at {bin_path}"
    binary = np.load(bin_path)
    assert binary.dtype == np.uint8,       f"Binary dtype wrong: {binary.dtype}"
    assert binary.shape == (exp_h, exp_w), f"Binary shape wrong: {binary.shape}"
    print(f"  [PASS] binary mask: shape={binary.shape}, changed={binary.sum()}/{binary.size} px")

    # 7 ── Type mask ───────────────────────────────────────────────
    type_path = pair_path / "change_type_mask.npy"
    assert type_path.is_file(), f"change_type_mask.npy missing at {type_path}"
    types = np.load(type_path)
    assert types.dtype == np.uint8,       f"Type mask dtype wrong: {types.dtype}"
    assert types.shape == (exp_h, exp_w), f"Type mask shape wrong: {types.shape}"
    print(f"  [PASS] type mask: shape={types.shape}")

    # 8 ── PNG artifacts ───────────────────────────────────────────
    for fname in ("change_mask.png", "change_mask_binary.png", "t2_mask_overlay.png"):
        p = pair_path / fname
        assert p.is_file(), f"Artifact missing: {p}"
        assert p.stat().st_size > 0, f"Artifact is empty: {p}"
    print("  [PASS] PNG artifacts present and non-empty")

    # 9 ── Threshold re-application ───────────────────────────────
    for thr in (0.10, 0.40):
        r2 = apply_threshold(pair_id, thr)
        assert r2 is not None, f"apply_threshold({thr}) returned None"
        assert r2.get("model", {}).get("threshold") == thr, \
            f"apply_threshold({thr}) stored wrong threshold"
    # Restore default
    apply_threshold(pair_id, EXPECTED_THRESHOLD)
    print("  [PASS] apply_threshold(0.10, 0.40, 0.28) all succeeded")

    print(f"\n  ✓ ALL ASSERTIONS PASSED for {name}")


def main():
    all_ok = True
    for spec in PAIRS:
        try:
            run_pair(spec)
        except Exception as exc:
            import traceback
            print(f"\n  ✗ FAILED: {spec['name']}")
            traceback.print_exc()
            all_ok = False

    print()
    if all_ok:
        print("=" * 60)
        print("ALL E2E TESTS PASSED")
        print("=" * 60)
        sys.exit(0)
    else:
        print("=" * 60)
        print("SOME E2E TESTS FAILED")
        print("=" * 60)
        sys.exit(1)


if __name__ == "__main__":
    main()
