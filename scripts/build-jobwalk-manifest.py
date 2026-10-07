"""Build a verifiable, incomplete JobWalk migration manifest from local exports."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image


root = Path(__file__).resolve().parents[1]
public = root / "public" / "jobwalk" / "bs17-office-retail"
private = root / "data" / "jobwalk" / "bs17-office-retail" / "panoramas"
previews = public / "panoramas"
previews.mkdir(parents=True, exist_ok=True)
counts = {"01": 67, "02": 100, "03": 5}
waypoints = []
captured_files = 0

for floor, expected in counts.items():
    source = json.loads((public / f"floor-{floor}-waypoints.json").read_text(encoding="utf-8"))
    if len(source["points"]) != expected:
        raise ValueError(f"Unexpected count on floor {floor}")
    for index, point in enumerate(source["points"], start=1):
        waypoint_id = f"BS17-JW-F{floor}-{index:03d}"
        captures = []
        for version, file in enumerate(sorted(private.glob(f"floor-{floor}-point-{point['id']}-v*.jpeg")), start=1):
            file_hash = hashlib.sha256(file.read_bytes()).hexdigest()
            capture_time = datetime.fromtimestamp(int(point["id"]) / 1000, timezone.utc).isoformat()
            preview_name = f"{file.stem}.webp"
            preview_path = previews / preview_name
            if not preview_path.exists():
                with Image.open(file) as image:
                    image.resize((4096, 2048), Image.Resampling.LANCZOS).save(preview_path, "WEBP", quality=84)
            captures.append({
                "version": version,
                "capturedAt": capture_time,
                "timeProvenance": "Source scene ID, checked against HoloBuilder's displayed minute for floor 03",
                "sourceSceneId": point["id"],
                "image": f"panoramas/{preview_name}",
                "original": f"originals/{file.name}",
                "mimeType": "image/jpeg",
                "bytes": file.stat().st_size,
                "sha256": file_hash,
            })
            captured_files += 1
        waypoints.append({
            "id": waypoint_id,
            "floor": floor,
            "x": point["x"],
            "y": point["y"],
            "positionAccuracy": "approximate-manual-2d",
            "sourceSceneId": point["id"],
            "sourceUrl": point["url"],
            "captures": captures,
        })

manifest = {
    "schemaVersion": 1,
    "projectId": "c5be311a-1cb8-4ec5-b607-35707445cd16",
    "name": "BS17 - CP: Office to Retail Space (JobWalk)",
    "source": "HoloBuilder / FARO Sphere XG",
    "mapSource": "Interactive sheet PDFs exported 2026-10-06",
    "positionAccuracy": "Waypoints manually placed on 2D sheets; not surveyed or BIM aligned",
    "migrationState": "partial",
    "observedSceneCount": 245,
    "waypointCount": len(waypoints),
    "locallyExportedCaptureCount": captured_files,
    "waypoints": waypoints,
}
if len(waypoints) != 172:
    raise ValueError(f"Expected 172 mapped waypoints, got {len(waypoints)}")
(public / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Manifest: {len(waypoints)} mapped waypoints, {captured_files} captured panoramas")
