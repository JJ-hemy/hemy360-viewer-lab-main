"""Create local viewer indexes for Boiler room 180322 from its LCC2 export.

Usage: python scripts/prepare-boiler-pois.py <lcc2-result-directory>
The source export is read only. Output goes to Git-ignored public/data.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main(root: Path) -> None:
    info = root / "info"
    items = json.loads((info / "poi.json").read_text(encoding="utf-8"))
    points = []
    photos = {}
    for item in items:
        if item.get("type") != "POI":
            continue
        label = item.get("customLabel") or item.get("name")
        if not label or len(item.get("position", [])) != 3:
            raise ValueError("POI label or coordinates are missing")
        folder = info / item["mediaPath"]
        images = sorted(folder.glob("camera_2_*.jpg"))
        if len(images) != 1:
            raise ValueError(f"Expected one front photo for {label}: {folder}")
        points.append({
            "label": label, "kind": "POI", "position": item["position"],
            "orientation": item.get("rotation", [0, 0, 0, 1]),
            "gnss": {"status": None},
        })
        photos[label] = [{"camera": 2, "path": images[0].relative_to(info).as_posix()}]

    destination = Path(__file__).resolve().parents[1] / "public" / "data"
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "bs17-180322-points.json").write_text(json.dumps({
        "captureId": "180322", "points": points, "referencePois": [],
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    (destination / "bs17-180322-photos.json").write_text(json.dumps({
        "captureId": "180322", "photos": photos,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Prepared {len(points)} local POIs and front photos for 180322")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: prepare-boiler-pois.py <lcc2-result-directory>")
    main(Path(sys.argv[1]))
