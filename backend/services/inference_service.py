"""
GeoWatch-Nexus inference and change-typing service.

Runtime contract
----------------
Model : Geo-Nexus P4b K30
Input : 17 channels, 128x128 pixels, 10 m/pixel
Stride: 128 pixels
Threshold: 0.28, selected on MH-VAL

The installed K30 checkpoint is a BINARY change detector. It predicts
change/no-change only. The multicolor classes shown to the application are a
separate, explicitly labelled spectral change-typing layer built from the same
17-channel T1/T2 data. They are not claimed to be native neural-network class
outputs or ground truth.

Stored acquisition layout
--------------------------
For each image pair directory:
  before_optical.tif : 11 S2 bands + n_clear, integer storage
  after_optical.tif  : 11 S2 bands + n_clear, integer storage
  before_sar.tif     : VV + VH, integer dB storage
  after_sar.tif      : VV + VH, integer dB storage

If the AOI was split into model tiles, the service also supports:
  data/<pair_id>/tiles/before_optical_r####_c####.tif
  data/<pair_id>/tiles/after_optical_r####_c####.tif
  data/<pair_id>/tiles/before_sar_r####_c####.tif
  data/<pair_id>/tiles/after_sar_r####_c####.tif
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import threading
from pathlib import Path
from typing import Any

import numpy as np
import torch
from PIL import Image
from scipy import ndimage

try:
    import rasterio
except ImportError as exc:  # pragma: no cover - environment error
    raise ImportError(
        "rasterio is required for GeoWatch-Nexus inference. "
        "Install it with: python -m pip install rasterio"
    ) from exc


BACKEND_ROOT = Path(os.getenv("GEOWATCH_BACKEND_ROOT", str(Path(__file__).resolve().parent.parent)))
MODEL_ROOT = BACKEND_ROOT / "models" / "geonexus_v3_2_k30"

PAIR_PATCH = 128
RESOLUTION_M = 10
INPUT_CHANNELS = 17
INFERENCE_STRIDE = 128
THRESHOLD = 0.28
Q_TARGET = 8.0
ARRAY_SCALE = 10_000.0
SAR_EXTRA_SCALE = 100.0
SAR_CHANNELS = (13, 14, 15)
Q_CHANNEL = 16
EPS = 1e-6

S2_BANDS = [
    "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12"
]
CHANNEL_ORDER = [
    "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12",
    "NDVI", "NDBI", "VV", "VH", "VH_VV", "Q"
]

# Class IDs intentionally match the project's verified change-typing contract.
CLASS_NAMES = {
    0: "no_change",
    1: "water_gain",
    2: "water_loss",
    3: "construction",
    4: "veg_loss",
    5: "veg_gain",
    6: "other",
    255: "uncertain",
}

# UI colors are fixed and must remain stable so the frontend legend never drifts.
CLASS_COLORS = {
    0: (128, 128, 128),      # gray
    1: (21, 101, 192),       # blue
    2: (79, 195, 247),       # light blue
    3: (255, 152, 0),        # orange
    4: (229, 57, 53),        # red
    5: (67, 160, 71),        # green
    6: (142, 68, 173),       # purple
    255: (189, 189, 189),    # light gray
}

# Research change-typing thresholds taken from the project's evidence logic.
TYPE_CFG = {
    "tau_ndbi": 0.15,
    "ndvi_drop_min": 0.05,
    "tau_ndvi_loss": 0.20,
    "ndvi_t1_min": 0.40,
    "tau_ndvi_gain": 0.20,
    "ndvi_t1_max": 0.30,
    "ndvi_t2_min": 0.45,
    "mndwi_thresh": 0.0,
    "opening_px": 1,
}

_MODEL_LOCK = threading.Lock()
_MODEL = None
_MODEL_DEVICE = None
_MODEL_ERROR = None
_NORM_CACHE: tuple[np.ndarray, np.ndarray, dict[str, Any]] | None = None

_TILE_RE = re.compile(
    r"^(?P<prefix>before_optical|after_optical|before_sar|after_sar)_r(?P<row>\d+)_c(?P<col>\d+)\.tif$",
    re.IGNORECASE,
)


def _atomic_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False, default=float)
    os.replace(tmp, path)


def _device_preference() -> torch.device:
    requested = os.getenv("GEOWATCH_INFERENCE_DEVICE", "auto").strip().lower()

    if requested == "cpu":
        return torch.device("cpu")
    if requested == "xpu":
        if not hasattr(torch, "xpu") or not torch.xpu.is_available():
            raise RuntimeError("GEOWATCH_INFERENCE_DEVICE=xpu but Intel XPU is unavailable")
        return torch.device("xpu")
    if requested == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("GEOWATCH_INFERENCE_DEVICE=cuda but CUDA is unavailable")
        return torch.device("cuda")

    # auto: prefer XPU for this machine, then CUDA, then CPU.
    if hasattr(torch, "xpu") and torch.xpu.is_available():
        return torch.device("xpu")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def _load_module_from_file(path: Path):
    if not path.is_file():
        raise FileNotFoundError(f"Geo-Nexus model source not found: {path}")

    spec = importlib.util.spec_from_file_location("geonexus_runtime_model", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Could not create import spec for {path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    if not hasattr(module, "GeoNexusCD"):
        raise AttributeError(f"{path.name} does not expose GeoNexusCD")
    return module


def _checkpoint_state(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(f"Geo-Nexus K30 checkpoint not found: {path}")

    checkpoint = torch.load(path, map_location="cpu", weights_only=False)
    state = checkpoint.get("model") if isinstance(checkpoint, dict) and "model" in checkpoint else checkpoint
    if not isinstance(state, dict):
        raise TypeError("K30 checkpoint does not contain a valid state_dict")
    return state


def _load_model() -> tuple[torch.nn.Module, torch.device]:
    global _MODEL, _MODEL_DEVICE, _MODEL_ERROR

    with _MODEL_LOCK:
        if _MODEL is not None and _MODEL_DEVICE is not None:
            return _MODEL, _MODEL_DEVICE

        model_source = MODEL_ROOT / "p3_geonexus_model.py"
        checkpoint = MODEL_ROOT / "mh_fewshot_best_k30.pth"

        try:
            module = _load_module_from_file(model_source)
            preferred = _device_preference()

            model = module.GeoNexusCD(decoder="lka")
            state = _checkpoint_state(checkpoint)
            missing, unexpected = model.load_state_dict(state, strict=False)
            if missing or unexpected:
                raise RuntimeError(
                    "K30 model state mismatch: "
                    f"missing={missing[:10]}, unexpected={unexpected[:10]}"
                )

            model.set_mode("gated")
            model.eval()

            # Prefer the configured accelerator. If it cannot materialise the
            # exact model, retry on CPU rather than silently producing nothing.
            try:
                model = model.to(preferred)
                if preferred.type in {"xpu", "cuda"}:
                    # Force parameter/device materialisation before serving.
                    next(model.parameters()).detach()
            except Exception as accelerator_error:
                if preferred.type == "cpu":
                    raise
                model = module.GeoNexusCD(decoder="lka")
                missing, unexpected = model.load_state_dict(state, strict=False)
                if missing or unexpected:
                    raise RuntimeError(
                        "CPU K30 state mismatch after accelerator fallback: "
                        f"missing={missing[:10]}, unexpected={unexpected[:10]}"
                    ) from accelerator_error
                model.set_mode("gated")
                model.eval()
                model = model.to("cpu")
                preferred = torch.device("cpu")

            _MODEL = model
            _MODEL_DEVICE = preferred
            _MODEL_ERROR = None
            return model, preferred

        except Exception as exc:
            _MODEL_ERROR = str(exc)
            raise


def _load_normalization() -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    global _NORM_CACHE
    if _NORM_CACHE is not None:
        return _NORM_CACHE

    path = MODEL_ROOT / "norm_stats_trainonly.json"
    if not path.is_file():
        raise FileNotFoundError(f"Normalization file not found: {path}")

    with path.open("r", encoding="utf-8") as f:
        stats = json.load(f)

    required = {"mean", "std", "array_scale", "sar_channels", "sar_extra_scale"}
    missing = required.difference(stats)
    if missing:
        raise KeyError(f"Normalization file missing keys: {sorted(missing)}")

    mu = np.asarray(stats["mean"], dtype=np.float32)
    sd = np.asarray(stats["std"], dtype=np.float32)

    if mu.shape != (17,) or sd.shape != (17,):
        raise ValueError(f"Normalization mean/std must be shape (17,), got {mu.shape}, {sd.shape}")
    if not np.isfinite(mu).all() or not np.isfinite(sd).all():
        raise ValueError("Normalization mean/std contains non-finite values")
    if np.any(sd <= 0):
        raise ValueError("Normalization std must be strictly positive")

    if float(stats["array_scale"]) != ARRAY_SCALE:
        raise ValueError(f"Expected array_scale={ARRAY_SCALE}, got {stats['array_scale']}")
    if tuple(int(v) for v in stats["sar_channels"]) != SAR_CHANNELS:
        raise ValueError("Normalization SAR channel contract does not match runtime")
    if float(stats["sar_extra_scale"]) != SAR_EXTRA_SCALE:
        raise ValueError(
            f"Expected sar_extra_scale={SAR_EXTRA_SCALE}, got {stats['sar_extra_scale']}"
        )

    # Research contract: NDVI, NDBI and Q are already in their physical ranges.
    if not np.allclose(mu[11:13], 0.0) or not np.allclose(sd[11:13], 1.0):
        raise ValueError("NDVI/NDBI identity-normalization contract failed")
    if not np.allclose(mu[16], 0.0) or not np.allclose(sd[16], 1.0):
        raise ValueError("Q identity-normalization contract failed")

    _NORM_CACHE = (mu.reshape(17, 1, 1), sd.reshape(17, 1, 1), stats)
    return _NORM_CACHE


def _read_single_tiff(path: Path) -> np.ndarray:
    with rasterio.open(path) as src:
        arr = src.read()
    if arr.ndim != 3:
        raise ValueError(f"Expected [bands,H,W] GeoTIFF at {path}, got {arr.shape}")
    return arr


def _read_stack(pair_dir: Path, prefix: str, expected_bands: int) -> np.ndarray:
    direct = pair_dir / f"{prefix}.tif"
    if direct.is_file():
        arr = _read_single_tiff(direct)
        if arr.shape[0] != expected_bands:
            raise ValueError(
                f"{direct.name}: expected {expected_bands} bands, got {arr.shape[0]}"
            )
        return arr

    tile_dir = pair_dir / "tiles"
    if not tile_dir.is_dir():
        raise FileNotFoundError(
            f"Neither {direct.name} nor tile directory {tile_dir} exists"
        )

    pieces: list[tuple[int, int, np.ndarray]] = []
    for path in sorted(tile_dir.glob(f"{prefix}_r*_c*.tif")):
        match = _TILE_RE.match(path.name)
        if not match:
            continue
        row = int(match.group("row"))
        col = int(match.group("col"))
        arr = _read_single_tiff(path)
        if arr.shape[0] != expected_bands:
            raise ValueError(
                f"{path.name}: expected {expected_bands} bands, got {arr.shape[0]}"
            )
        pieces.append((row, col, arr))

    if not pieces:
        raise FileNotFoundError(f"No {prefix}_r*_c*.tif tiles found under {tile_dir}")

    tile_h = max(p[2].shape[1] for p in pieces)
    tile_w = max(p[2].shape[2] for p in pieces)
    height = (max(p[0] for p in pieces) + 1) * tile_h
    width = (max(p[1] for p in pieces) + 1) * tile_w

    out = np.zeros((expected_bands, height, width), dtype=pieces[0][2].dtype)
    for row, col, arr in pieces:
        h, w = arr.shape[1:]
        out[:, row * tile_h:row * tile_h + h, col * tile_w:col * tile_w + w] = arr
    return out


def _derive_17_channels(opt1_raw: np.ndarray, sar1_raw: np.ndarray,
                        opt2_raw: np.ndarray, sar2_raw: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Convert stored research-compatible 14-channel raw stacks to two 17-channel
    physical tensors before normalization.
    """
    if opt1_raw.shape[0] != 12 or opt2_raw.shape[0] != 12:
        raise ValueError("Optical stack must contain 11 S2 bands + n_clear")
    if sar1_raw.shape[0] != 2 or sar2_raw.shape[0] != 2:
        raise ValueError("SAR stack must contain VV + VH")

    h = min(opt1_raw.shape[1], opt2_raw.shape[1], sar1_raw.shape[1], sar2_raw.shape[1])
    w = min(opt1_raw.shape[2], opt2_raw.shape[2], sar1_raw.shape[2], sar2_raw.shape[2])

    opt1_all = opt1_raw[:, :h, :w].astype(np.float32)
    opt2_all = opt2_raw[:, :h, :w].astype(np.float32)
    opt1 = opt1_all[:11] / ARRAY_SCALE
    opt2 = opt2_all[:11] / ARRAY_SCALE
    nclear1 = np.clip(opt1_all[11] / Q_TARGET, 0.0, 1.0)
    nclear2 = np.clip(opt2_all[11] / Q_TARGET, 0.0, 1.0)
    # S1 GeoTIFFs store dB * 100; restore physical dB here.
    sar1 = sar1_raw[:, :h, :w].astype(np.float32) / SAR_EXTRA_SCALE
    sar2 = sar2_raw[:, :h, :w].astype(np.float32) / SAR_EXTRA_SCALE

    def build(opt: np.ndarray, sar: np.ndarray, q: np.ndarray) -> np.ndarray:
        b3, b4, b8, b11 = opt[1], opt[2], opt[6], opt[9]
        ndvi = (b8 - b4) / (b8 + b4 + EPS)
        ndbi = (b11 - b8) / (b11 + b8 + EPS)
        vh_vv = sar[1] - sar[0]

        return np.concatenate(
            [
                opt,
                ndvi[None],
                ndbi[None],
                sar,
                vh_vv[None],
                q[None],
            ],
            axis=0,
        ).astype(np.float32)

    x1 = build(opt1, sar1, nclear1)
    x2 = build(opt2, sar2, nclear2)

    if x1.shape[0] != INPUT_CHANNELS or x2.shape[0] != INPUT_CHANNELS:
        raise AssertionError(f"17-channel construction failed: {x1.shape}, {x2.shape}")
    return x1, x2


def _normalize_17(x: np.ndarray, mu: np.ndarray, sd: np.ndarray) -> np.ndarray:
    raw = x.astype(np.float32, copy=False)
    z = (raw - mu) / (sd + 1e-6)
    if not np.isfinite(z).all():
        raise FloatingPointError("Normalized model input contains non-finite values")
    return z


def _pad_patch(arr: np.ndarray, height: int, width: int) -> np.ndarray:
    out = np.zeros((arr.shape[0], height, width), dtype=arr.dtype)
    out[:, :arr.shape[1], :arr.shape[2]] = arr
    return out


def _iter_patches(x1: np.ndarray, x2: np.ndarray):
    h, w = x1.shape[1:]
    for row in range(0, h, INFERENCE_STRIDE):
        for col in range(0, w, INFERENCE_STRIDE):
            h2 = min(PAIR_PATCH, h - row)
            w2 = min(PAIR_PATCH, w - col)
            p1 = x1[:, row:row + h2, col:col + w2]
            p2 = x2[:, row:row + h2, col:col + w2]
            if p1.shape[1:] != (PAIR_PATCH, PAIR_PATCH):
                p1 = _pad_patch(p1, PAIR_PATCH, PAIR_PATCH)
                p2 = _pad_patch(p2, PAIR_PATCH, PAIR_PATCH)
            yield row, col, h2, w2, p1, p2


def _run_binary_inference(x1: np.ndarray, x2: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    model, device = _load_model()
    batch_size = max(1, int(os.getenv("GEOWATCH_INFERENCE_BATCH", "4")))

    h, w = x1.shape[1:]
    probability = np.zeros((h, w), dtype=np.float32)
    gate_sum = np.zeros((4,), dtype=np.float64)
    gate_count = 0

    pending = []
    for item in _iter_patches(x1, x2):
        pending.append(item)
        if len(pending) >= batch_size:
            gate_vals = _infer_batch(model, device, pending, probability)
            gate_sum += gate_vals[0]
            gate_count += gate_vals[1]
            pending.clear()

    if pending:
        gate_vals = _infer_batch(model, device, pending, probability)
        gate_sum += gate_vals[0]
        gate_count += gate_vals[1]

    mean_gates = gate_sum / max(gate_count, 1)
    return probability, mean_gates.astype(np.float32)


def _infer_batch(model: torch.nn.Module, device: torch.device, items, probability: np.ndarray):
    arr1 = np.stack([i[4] for i in items], axis=0)
    arr2 = np.stack([i[5] for i in items], axis=0)
    t1 = torch.from_numpy(np.ascontiguousarray(arr1)).to(device=device, dtype=torch.float32)
    t2 = torch.from_numpy(np.ascontiguousarray(arr2)).to(device=device, dtype=torch.float32)

    with torch.inference_mode():
        out = model(t1, t2)
        logits = out["logits"]
        probs = torch.sigmoid(logits).detach().float().cpu().numpy()[:, 0]
        gates = out.get("gates", [])
        gate_means = np.zeros((4,), dtype=np.float64)
        gate_count = len(items)
        if gates:
            for idx, gate in enumerate(gates[:4]):
                gate_means[idx] = float(gate.float().mean().detach().cpu())

    for i, (row, col, h2, w2, *_rest) in enumerate(items):
        probability[row:row + h2, col:col + w2] = probs[i, :h2, :w2]

    return gate_means, gate_count


def _apply_binary_morphology(mask: np.ndarray) -> np.ndarray:
    # Remove isolated 1-pixel speckle while preserving model-generated regions.
    structure = np.ones((3, 3), dtype=bool)
    opened = ndimage.binary_opening(mask, structure=structure)
    closed = ndimage.binary_closing(opened, structure=structure)
    return closed.astype(bool)


def _change_typing(x1: np.ndarray, x2: np.ndarray, binary_mask: np.ndarray, q: np.ndarray) -> np.ndarray:
    """Return display labels using the locked spectral evidence thresholds."""
    b3_1, b4_1, b8_1, b11_1 = x1[1], x1[2], x1[6], x1[9]
    b3_2, b4_2, b8_2, b11_2 = x2[1], x2[2], x2[6], x2[9]

    ndvi1 = (b8_1 - b4_1) / (b8_1 + b4_1 + EPS)
    ndvi2 = (b8_2 - b4_2) / (b8_2 + b4_2 + EPS)
    ndbi1 = (b11_1 - b8_1) / (b11_1 + b8_1 + EPS)
    ndbi2 = (b11_2 - b8_2) / (b11_2 + b8_2 + EPS)
    mndwi1 = (b3_1 - b11_1) / (b3_1 + b11_1 + EPS)
    mndwi2 = (b3_2 - b11_2) / (b3_2 + b11_2 + EPS)

    d_ndvi = ndvi2 - ndvi1
    d_ndbi = ndbi2 - ndbi1

    labels = np.zeros(binary_mask.shape, dtype=np.uint8)
    claimed = np.zeros(binary_mask.shape, dtype=bool)

    # Keep priority identical to the project's evidence-typing order.
    water_gain = binary_mask & (mndwi1 < TYPE_CFG["mndwi_thresh"]) & (mndwi2 >= TYPE_CFG["mndwi_thresh"])
    water_loss = binary_mask & (mndwi1 >= TYPE_CFG["mndwi_thresh"]) & (mndwi2 < TYPE_CFG["mndwi_thresh"])
    construction = binary_mask & (d_ndbi >= TYPE_CFG["tau_ndbi"]) & (d_ndvi <= -TYPE_CFG["ndvi_drop_min"])
    veg_loss = binary_mask & (d_ndvi <= -TYPE_CFG["tau_ndvi_loss"]) & (ndvi1 >= TYPE_CFG["ndvi_t1_min"])
    veg_gain = (
        binary_mask
        & (d_ndvi >= TYPE_CFG["tau_ndvi_gain"])
        & (ndvi1 <= TYPE_CFG["ndvi_t1_max"])
        & (ndvi2 >= TYPE_CFG["ndvi_t2_min"])
    )

    for cid, candidate in [
        (1, water_gain),
        (2, water_loss),
        (3, construction),
        (4, veg_loss),
        (5, veg_gain),
    ]:
        clean = candidate & ~claimed
        clean = ndimage.binary_opening(clean, structure=np.ones((3, 3), dtype=bool))
        labels[clean] = cid
        claimed |= clean

    labels[binary_mask & ~claimed] = 6

    # Very low-clear-observation pixels are separated as uncertain for display.
    # They remain model detections, but their class interpretation is low-confidence.
    low_q = q < 0.25
    labels[binary_mask & low_q] = 255

    return labels


def _class_statistics(labels: np.ndarray, total_pixels: int) -> dict[str, Any]:
    out: dict[str, Any] = {}
    changed_pixels = int(np.isin(labels, [1, 2, 3, 4, 5, 6]).sum())
    for cid, name in CLASS_NAMES.items():
        pixels = int((labels == cid).sum())
        area_m2 = pixels * RESOLUTION_M * RESOLUTION_M
        area_ha = area_m2 / 10_000.0
        area_km2 = area_m2 / 1_000_000.0
        out[name] = {
            "class_id": cid,
            "pixels": pixels,
            "area_m2": area_m2,
            "area_ha": area_ha,
            "area_km2": area_km2,
            "percent_of_aoi": 100.0 * pixels / max(total_pixels, 1),
            "percent_of_detected_change": (
                100.0 * pixels / max(changed_pixels, 1) if cid in [1, 2, 3, 4, 5, 6] else 0.0
            ),
        }
    return out


def _binary_metrics(probability: np.ndarray, gt: np.ndarray, threshold: float) -> dict[str, Any]:
    gt_arr = np.asarray(gt)
    if gt_arr.shape != probability.shape:
        raise ValueError(f"Ground truth shape {gt_arr.shape} does not match prediction {probability.shape}")

    valid = gt_arr != 255
    y = (gt_arr[valid] > 0).astype(np.uint8)
    p = probability[valid]
    pred = (p >= threshold).astype(np.uint8)

    tp = int(((pred == 1) & (y == 1)).sum())
    fp = int(((pred == 1) & (y == 0)).sum())
    fn = int(((pred == 0) & (y == 1)).sum())
    tn = int(((pred == 0) & (y == 0)).sum())

    precision = tp / max(tp + fp, 1)
    recall = tp / max(tp + fn, 1)
    f1 = 2.0 * precision * recall / max(precision + recall, 1e-12)
    iou = tp / max(tp + fp + fn, 1)
    accuracy = (tp + tn) / max(tp + fp + fn + tn, 1)

    average_precision = None
    try:
        from sklearn.metrics import average_precision_score
        if np.unique(y).size > 1:
            average_precision = float(average_precision_score(y, p))
    except ImportError:
        average_precision = None

    return {
        "ground_truth_available": True,
        "threshold": float(threshold),
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
        "iou": float(iou),
        "accuracy": float(accuracy),
        "average_precision": average_precision,
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "valid_pixels": int(valid.sum()),
    }


def _load_ground_truth(pair_dir: Path, shape: tuple[int, int]) -> np.ndarray | None:
    candidates = [
        pair_dir / "ground_truth.npy",
        pair_dir / "ground_truth_mask.npy",
        pair_dir / "ground_truth.tif",
        pair_dir / "ground_truth_mask.tif",
        pair_dir / "ground_truth.png",
        pair_dir / "ground_truth_mask.png",
    ]
    for path in candidates:
        if not path.is_file():
            continue
        if path.suffix.lower() == ".npy":
            gt = np.asarray(np.load(path), dtype=np.uint8)
        elif path.suffix.lower() in {".tif", ".tiff"}:
            gt = _read_single_tiff(path)[0].astype(np.uint8)
        else:
            gt = np.asarray(Image.open(path).convert("L"), dtype=np.uint8)
        if gt.shape != shape:
            raise ValueError(f"Ground-truth mask {path.name} has shape {gt.shape}; expected {shape}")
        return gt
    return None


def _save_mask_png(labels: np.ndarray, path: Path) -> None:
    rgb = np.zeros((*labels.shape, 3), dtype=np.uint8)
    rgb[:] = CLASS_COLORS[0]
    for cid, color in CLASS_COLORS.items():
        rgb[labels == cid] = color
    Image.fromarray(rgb, mode="RGB").save(path, format="PNG", optimize=True)


def _save_binary_png(binary: np.ndarray, path: Path) -> None:
    arr = np.where(binary, 255, 0).astype(np.uint8)
    Image.fromarray(arr, mode="L").save(path, format="PNG", optimize=True)


def _save_t2_overlay(pair_dir: Path, labels: np.ndarray, path: Path) -> None:
    rgb_path = pair_dir / "after_rgb.png"
    if not rgb_path.is_file():
        raise FileNotFoundError(f"T2 preview not found: {rgb_path}")

    base = Image.open(rgb_path).convert("RGBA")
    overlay = np.zeros((*labels.shape, 4), dtype=np.uint8)
    for cid, color in CLASS_COLORS.items():
        if cid == 0:
            continue
        sel = labels == cid
        overlay[sel, 0:3] = color
        overlay[sel, 3] = 125 if cid != 255 else 90

    mask_img = Image.fromarray(overlay, mode="RGBA")
    mask_img = mask_img.resize(base.size, resample=Image.Resampling.NEAREST)
    out = Image.alpha_composite(base, mask_img)
    out.save(path, format="PNG", optimize=True)


def _write_progress(pair_dir: Path, pair_id: str, message: str, state: str) -> None:
    _atomic_json(
        pair_dir / "progress.json",
        {
            "pair_id": pair_id,
            "state": state,
            "message": message,
        },
    )


def analyze_pair(pair_id: str, *, progress_callback=None) -> dict[str, Any]:
    """Run K30 inference + spectral change typing and persist UI artifacts."""
    if pair_id in {".", ".."} or "/" in pair_id or "\\" in pair_id:
        raise ValueError("Invalid pair_id")

    pair_dir = BACKEND_ROOT / "data" / pair_id
    if not pair_dir.is_dir():
        raise FileNotFoundError(f"Image pair directory not found: {pair_dir}")

    def progress(message: str):
        _write_progress(pair_dir, pair_id, message, "analyzing")
        if progress_callback:
            progress_callback(message)

    progress("Loading stored T1/T2 GeoTIFF stacks...")

    opt1_raw = _read_stack(pair_dir, "before_optical", 12)
    opt2_raw = _read_stack(pair_dir, "after_optical", 12)
    sar1_raw = _read_stack(pair_dir, "before_sar", 2)
    sar2_raw = _read_stack(pair_dir, "after_sar", 2)

    progress("Building the exact 17-channel model inputs...")
    x1, x2 = _derive_17_channels(opt1_raw, sar1_raw, opt2_raw, sar2_raw)
    mu, sd, norm_meta = _load_normalization()
    x1n = _normalize_17(x1, mu, sd)
    x2n = _normalize_17(x2, mu, sd)

    progress("Running Geo-Nexus K30 inference...")
    probability, gates = _run_binary_inference(x1n, x2n)
    binary = probability >= THRESHOLD
    binary = _apply_binary_morphology(binary)

    q = np.clip(x1[16], 0.0, 1.0)
    low_q_percent = 100.0 * float((q < 0.25).mean())

    progress("Assigning spectral change types...")
    labels = _change_typing(x1, x2, binary, q)

    total_pixels = int(labels.size)
    changed_pixels = int(np.isin(labels, [1, 2, 3, 4, 5, 6, 255]).sum())
    class_stats = _class_statistics(labels, total_pixels)

    progress("Calculating metrics and area statistics...")
    gt = _load_ground_truth(pair_dir, probability.shape)
    if gt is None:
        gt_metrics = {
            "ground_truth_available": False,
            "threshold": THRESHOLD,
            "precision": None,
            "recall": None,
            "f1": None,
            "iou": None,
            "accuracy": None,
            "average_precision": None,
        }
    else:
        gt_metrics = _binary_metrics(probability, gt, THRESHOLD)

    # Verified K30 release-level benchmark values. These are model benchmark
    # results, not metrics measured on this particular user's AOI.
    benchmark = {
        "scope": "Geo-Nexus P4b K30 verified benchmark",
        "threshold": 0.28,
        "mh_val": {
            "f1": 0.739389,
        },
        "mh_test": {
            "f1": 0.636976,
            "iou": 0.467325,
            "average_precision": 0.699608,
            "precision": None,
            "recall": None,
        },
        "note": "Benchmark metrics are not ground-truth metrics for this arbitrary AOI.",
    }

    # Save machine-readable arrays for later UI/tooling without making them API payloads.
    np.save(pair_dir / "change_probability.npy", probability.astype(np.float32))
    np.save(pair_dir / "change_mask_binary.npy", binary.astype(np.uint8))
    np.save(pair_dir / "change_type_mask.npy", labels.astype(np.uint8))

    _save_binary_png(binary, pair_dir / "change_mask_binary.png")
    _save_mask_png(labels, pair_dir / "change_mask.png")
    _save_t2_overlay(pair_dir, labels, pair_dir / "t2_mask_overlay.png")

    class_percent_total_change = 100.0 * changed_pixels / max(total_pixels, 1)
    analysis = {
        "pair_id": pair_id,
        "status": "complete",
        "model": {
            "model_id": "geonexus_p4b_k30",
            "version": "Geo-Nexus-v3.2-P4b-K30",
            "task": "binary_change_detection",
            "input_channels": INPUT_CHANNELS,
            "patch_size": PAIR_PATCH,
            "resolution_m": RESOLUTION_M,
            "stride": INFERENCE_STRIDE,
            "threshold": THRESHOLD,
            "threshold_source": "MH-VAL",
            "mode": "gated",
            "device": str(_MODEL_DEVICE) if _MODEL_DEVICE is not None else "unknown",
        },
        "channels": {
            "order": CHANNEL_ORDER,
            "normalization_file": norm_meta.get("name", "norm_stats_trainonly.json"),
            "array_scale": ARRAY_SCALE,
            "sar_extra_scale": SAR_EXTRA_SCALE,
            "q_target": Q_TARGET,
        },
        "input_shape": {
            "height": int(probability.shape[0]),
            "width": int(probability.shape[1]),
            "pixels": total_pixels,
        },
        "quality": {
            "q_mean": float(q.mean()),
            "q_min": float(q.min()),
            "q_max": float(q.max()),
            "low_q_below_0_25_percent": low_q_percent,
            "mean_gate_per_scale": [float(v) for v in gates],
        },
        "binary_detection": {
            "changed_pixels_before_display_typing": int(binary.sum()),
            "changed_area_m2_before_typing": int(binary.sum()) * 100,
            "changed_area_km2_before_typing": float(binary.sum()) * 100 / 1_000_000,
            "changed_percent_before_display_typing": 100.0 * float(binary.mean()),
            "typed_or_uncertain_percent": class_percent_total_change,
        },
        "class_statistics": class_stats,
        "ground_truth_metrics": gt_metrics,
        "model_benchmark": benchmark,
        "change_typing": {
            "version": "spectral_rules_v1",
            "classes": CLASS_NAMES,
            "confidence_warning": (
                "Change-type labels are derived from spectral rules on the detected "
                "binary-change pixels. They are not native K30 multiclass logits and "
                "should be presented as change typing, not ground truth."
            ),
        },
    }

    _atomic_json(pair_dir / "analysis.json", analysis)
    _write_progress(pair_dir, pair_id, "Model analysis completed.", "analysis_done")
    return analysis


def model_health() -> dict[str, Any]:
    """Return non-sensitive runtime health information for diagnostics."""
    payload = {
        "model_root": str(MODEL_ROOT),
        "checkpoint_exists": (MODEL_ROOT / "mh_fewshot_best_k30.pth").is_file(),
        "model_source_exists": (MODEL_ROOT / "p3_geonexus_model.py").is_file(),
        "normalization_exists": (MODEL_ROOT / "norm_stats_trainonly.json").is_file(),
        "device": str(_MODEL_DEVICE) if _MODEL_DEVICE is not None else None,
        "model_loaded": _MODEL is not None,
        "last_error": _MODEL_ERROR,
        "threshold": THRESHOLD,
    }
    return payload
