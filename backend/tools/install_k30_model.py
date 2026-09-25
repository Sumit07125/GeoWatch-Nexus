"""
Install the verified Geo-Nexus P4b K30 runtime package from Kaggle.

Run from the backend environment after Kaggle authentication is configured:
    python tools/install_k30_model.py

The script downloads the private/public dataset package referenced by the
project and copies only the runtime artifacts into:
    backend/models/geonexus_v3_2_k30/

No PyTorch import is required by this installer.
"""

from __future__ import annotations

import shutil
from pathlib import Path


DATASET_ID = "sumit07125/geonexus-p4b-v6-model-artifacts"
TARGET_NAMES = {
    "mh_fewshot_best_k30.pth",
    "p3_geonexus_model.py",
    "norm_stats_trainonly.json",
    "geonexus_model_registry.json",
    "P4b_RELEASE_MANIFEST.json",
    "P4b_RELEASE_METADATA.json",
    "P4b_RELEASE_README.md",
    "p4b_config.json",
}


def find_file(root: Path, filename: str) -> Path:
    matches = list(root.rglob(filename))
    if not matches:
        raise FileNotFoundError(f"Required artifact not found: {filename}")
    if len(matches) > 1:
        raise RuntimeError(
            f"Ambiguous artifact '{filename}'. Found: "
            + ", ".join(str(p) for p in matches)
        )
    return matches[0]


def main() -> None:
    try:
        import kagglehub
    except ImportError as exc:
        raise SystemExit(
            "kagglehub is not installed. Run: pip install -U kagglehub"
        ) from exc

    backend_root = Path(__file__).resolve().parents[1]
    target_dir = backend_root / "models" / "geonexus_v3_2_k30"
    target_dir.mkdir(parents=True, exist_ok=True)

    print(f"Downloading Kaggle dataset: {DATASET_ID}")
    dataset_root = Path(kagglehub.dataset_download(DATASET_ID))
    print(f"Kaggle package: {dataset_root}")

    for filename in sorted(TARGET_NAMES):
        source = find_file(dataset_root, filename)
        destination = target_dir / filename
        shutil.copy2(source, destination)
        print(f"INSTALLED: {destination}")

    checkpoint = target_dir / "mh_fewshot_best_k30.pth"
    if not checkpoint.is_file():
        raise RuntimeError("K30 checkpoint installation failed")

    print()
    print("K30 MODEL INSTALLATION: PASS")
    print(f"Checkpoint: {checkpoint}")
    print(f"Size: {checkpoint.stat().st_size / (1024**2):.2f} MiB")


if __name__ == "__main__":
    main()
