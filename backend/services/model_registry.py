from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = BACKEND_ROOT / "models" / "geonexus_v3_2_k30"

MODEL_REGISTRY = {
    "geonexus_p4b_k30": {
        "name": "Geo-Nexus P4b Few-Shot K30",
        "version": "Geo-Nexus-v3.2-P4b-K30",

        "task": "binary_change_detection",

        "checkpoint": str(
            MODEL_DIR / "mh_fewshot_best_k30.pth"
        ),

        "model_source": str(
            MODEL_DIR / "p3_geonexus_model.py"
        ),

        "normalization_file": str(
            MODEL_DIR / "norm_stats_trainonly.json"
        ),

        "input_channels": 17,
        "output_channels": 1,

        "patch_size": 128,
        "resolution_m": 10,
        "inference_stride": 128,

        "classes": {
            "0": "no_change",
            "1": "change",
        },

        "channel_order": [
            "B2",
            "B3",
            "B4",
            "B5",
            "B6",
            "B7",
            "B8",
            "B8A",
            "B9",
            "B11",
            "B12",
            "NDVI",
            "NDBI",
            "VV",
            "VH",
            "VH_VV",
            "Q",
        ],

        "s2_bands": [
            "B2",
            "B3",
            "B4",
            "B5",
            "B6",
            "B7",
            "B8",
            "B8A",
            "B9",
            "B11",
            "B12",
        ],

        "derived_channels": [
            "NDVI",
            "NDBI",
        ],

        "sar_channels": [
            "VV",
            "VH",
            "VH_VV",
        ],

        "quality_channel": "Q",

        "cloud_score_threshold": 0.60,
        "q_target": 8.0,

        "default_threshold": 0.28,
        "threshold_source": "MH-VAL",
        "threshold_selection_policy": "validation_only",

        "storage_contract": {
            "s2_scale": 10000,
            "s2_dtype": "int16",
            "sar_scale": 100,
            "sar_dtype": "int16",
            "quality_dtype": "uint8",
        },

        "temporal_protocol": {
            "t1_start": "2020-01-01",
            "t1_end": "2020-04-01",
            "t2_start": "2024-01-01",
            "t2_end": "2024-04-01",
        },

        "sar_protocol": {
            "instrument_mode": "IW",
            "polarizations": ["VV", "VH"],
            "orbit_pass": "DESCENDING",
            "common_relative_orbit": True,
            "median_space": "linear_power",
            "low_look_threshold": 5,
            "low_look_filter": {
                "radius": 1.5,
                "shape": "circle",
                "units": "pixels",
            },
        },

        "preferred_zone_orbits": {
            "Pune": 136,
            "Satara": 136,
            "Vidarbha": 165,
        },

        "required_for_acquisition": False,
        "required_for_inference": True,
    }
}


def get_model_config(model_id: str) -> dict:
    config = MODEL_REGISTRY.get(model_id)

    if config is None:
        raise KeyError(f"Unknown model_id: {model_id}")

    return config


def checkpoint_available(model_id: str) -> bool:
    checkpoint = Path(
        get_model_config(model_id)["checkpoint"]
    )
    return checkpoint.is_file()


def validate_model_contract(model_id: str = "geonexus_p4b_k30") -> None:
    config = get_model_config(model_id)

    assert config["input_channels"] == 17
    assert config["patch_size"] == 128
    assert config["resolution_m"] == 10
    assert config["inference_stride"] == 128
    assert config["cloud_score_threshold"] == 0.60
    assert config["q_target"] == 8.0
    assert config["default_threshold"] == 0.28

    expected_channels = [
        "B2", "B3", "B4", "B5", "B6", "B7",
        "B8", "B8A", "B9", "B11", "B12",
        "NDVI", "NDBI",
        "VV", "VH", "VH_VV",
        "Q",
    ]

    assert config["channel_order"] == expected_channels

    if not checkpoint_available(model_id):
        raise FileNotFoundError(
            f"K30 checkpoint not found: {config['checkpoint']}"
        )