"""
GeoWatch-Nexus model registry.

The registry records the frozen runtime contract for the production K30 model.
It does not load the checkpoint itself.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any


MODEL_REGISTRY: dict[str, dict[str, Any]] = {
    "geonexus_p4b_k30": {
        "name": "Geo-Nexus P4b Few-Shot K30",
        "version": "Geo-Nexus-v3.2-P4b-K30",
        "task": "binary_change_detection",
        "input_channels": 17,
        "output_channels": 1,
        "patch_size": 128,
        "resolution_m": 10,
        "inference_stride": 128,
        "classes": {
            0: "no_change",
            1: "change",
        },
        "channel_order": [
            "B2", "B3", "B4", "B5", "B6", "B7", "B8",
            "B8A", "B9", "B11", "B12",
            "NDVI", "NDBI",
            "VV", "VH", "VH_VV",
            "Q",
        ],
        "s2_bands": [
            "B2", "B3", "B4", "B5", "B6", "B7", "B8",
            "B8A", "B9", "B11", "B12",
        ],
        "derived_channels": ["NDVI", "NDBI"],
        "sar_channels": ["VV", "VH", "VH_VV"],
        "quality_channel": "Q",
        "cloud_score_collection": "GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED",
        "cloud_score_band": "cs_cdf",
        "cloud_score_threshold": 0.60,
        "q_target_clear_observations": 8.0,
        "s2_scale_storage": 10000,
        "sar_db_scale_storage": 100,
        "normalization_file": "norm_stats_trainonly.json",
        "preprocessing_version": "Geo-Nexus-v3.2-17ch-runtime-v1",
        "temporal_protocol": {
            "mode": "research",
            "t1": ["2020-01-01", "2020-04-01"],
            "t2": ["2024-01-01", "2024-04-01"],
        },
        "sar_protocol": {
            "collection": "COPERNICUS/S1_GRD",
            "instrument_mode": "IW",
            "pass": "DESCENDING",
            "require_common_relative_orbit": True,
            "low_look_threshold": 5,
            "low_look_filter": {
                "function": "focal_median",
                "radius_pixels": 1.5,
                "kernel": "circle",
            },
            "median_domain": "linear_power",
        },
        "research_zone_orbits": [
            {
                "name": "pune",
                "bbox": [73.70, 18.30, 74.20, 18.80],
                "relative_orbit": 136,
            },
            {
                "name": "satara",
                "bbox": [73.50, 17.50, 74.00, 18.00],
                "relative_orbit": 136,
            },
            {
                "name": "vidarbha",
                "bbox": [78.90, 20.90, 79.30, 21.30],
                "relative_orbit": 165,
            },
        ],
        "checkpoint": {
            "filename": "mh_fewshot_best_k30.pth",
            "path": "geonexus_v3_2_k30/mh_fewshot_best_k30.pth",
            "sha256": "24C041635B7930D1A7794F11E0CC7C4EB6F61A0BB99018E14FC8C61AAA5415D3",
            "required": True,
        },
        "decision_threshold": {
            "value": 0.28,
            "source": "MH-VAL",
            "metric": "F1",
            "is_test_tuned": False,
        },
    }
}


def get_model_config(model_id: str) -> dict[str, Any]:
    try:
        return MODEL_REGISTRY[model_id]
    except KeyError as exc:
        raise KeyError(f"Unknown model_id: {model_id}") from exc


def list_models() -> list[dict[str, Any]]:
    result = []
    for model_id, config in MODEL_REGISTRY.items():
        checkpoint = config["checkpoint"]
        result.append(
            {
                "model_id": model_id,
                "name": config["name"],
                "version": config["version"],
                "task": config["task"],
                "input_channels": config["input_channels"],
                "patch_size": config["patch_size"],
                "resolution_m": config["resolution_m"],
                "checkpoint_configured": bool(checkpoint.get("path")),
            }
        )
    return result


def resolve_checkpoint_path(model_id: str, model_root: str | Path) -> Path | None:
    """Return the checkpoint path when configured; otherwise None."""
    config = get_model_config(model_id)
    checkpoint = config["checkpoint"]
    path = checkpoint.get("path")
    if not path:
        return None

    resolved = Path(model_root) / path
    return resolved


def validate_model_contract(model_id: str) -> None:
    """
    Validate that the model registry entry is internally consistent.

    Called by gee_service before acquisition to ensure the runtime
    contract has not been silently broken.

    Raises ValueError on contract violation.
    """
    config = get_model_config(model_id)  # raises KeyError if unknown

    required_keys = [
        "input_channels",
        "patch_size",
        "resolution_m",
        "channel_order",
        "decision_threshold",
        "temporal_protocol",
    ]
    for key in required_keys:
        if key not in config:
            raise ValueError(
                f"Model registry entry for '{model_id}' is missing required key: '{key}'"
            )

    if len(config["channel_order"]) != config["input_channels"]:
        raise ValueError(
            f"Model '{model_id}' declares {config['input_channels']} input_channels "
            f"but channel_order has {len(config['channel_order'])} entries."
        )


def is_location_in_supported_zone(lat: float, lon: float, model_id: str) -> tuple[bool, str | None]:
    """
    Return (True, zone_name) if (lat, lon) falls inside a research_zone_orbit bbox,
    or (False, None) if the location is outside all registered research zones.

    Used for early validation before triggering expensive GEE calls.
    """
    config = get_model_config(model_id)
    zones = config.get("research_zone_orbits", [])
    for zone in zones:
        min_lon, min_lat, max_lon, max_lat = zone["bbox"]
        if min_lon <= lon <= max_lon and min_lat <= lat <= max_lat:
            return True, zone["name"]
    return False, None


def checkpoint_available(model_id: str, model_root: str | Path) -> bool:
    path = resolve_checkpoint_path(model_id, model_root)
    return path is not None and path.is_file()
