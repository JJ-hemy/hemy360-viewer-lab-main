"""Extract a traceable, preliminary BS17 coordinate package from K2 raw logs."""

from __future__ import annotations

import bisect
import csv
import hashlib
import json
import math
import os
from collections import Counter
from pathlib import Path

from pyproj import Transformer


scan_root = os.environ.get("HEMY_SCAN_ROOT")
if not scan_root:
    raise SystemExit("Set HEMY_SCAN_ROOT to the local K2 scan directory before running this script.")
ROOT = Path(scan_root)
OUT = Path(__file__).resolve().parents[1] / "data" / "bs17-rtk"
CAPTURES = {
    "152950": ROOT / "1 - Files for uploading/BS17/BS17_Loftet_2026-09-10-152950/project_data",
    "184147": ROOT / "1 - Files for uploading/BS17/BS17_fagmoebler10_roof_2026-09-08-184147/project_data",
    "143942": ROOT / "1 - Files for uploading/BS17/BS17_fagmoebler6_storage_staircase_2026-09-08-143942/project_data",
    "183256": ROOT / "Lilleberg Eiendom/BS17/K2/BS17_outdoor_full_reference_66min_2026-07-17-183256/project_data",
}
TRANSFORMER = Transformer.from_crs("EPSG:4326", "EPSG:32632", always_xy=True)
LOFT_MANIFEST = ROOT / "Lilleberg Eiendom/BS17/K2/BS17 Boiler room/Loftet/Loftet/lcc2-result/bs17_01_loftet_152950.lcc2"


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def finite(value: str) -> float | None:
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def read_gnss(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8-sig") as stream:
        rows = list(csv.DictReader(stream))
    return [dict(row, timestamp=float(row["#timestamp"])) for row in rows]


def read_points(path: Path) -> list[dict]:
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    columns = lines[1].removeprefix("#").split()
    return [dict(zip(columns, line.split())) for line in lines[2:] if line.strip()]


def coordinates(row: dict) -> dict:
    latitude, longitude, altitude = (finite(row[key]) for key in ("latitude", "longitude", "altitude"))
    if latitude is None or longitude is None:
        return {"latitude": None, "longitude": None, "easting": None, "northing": None, "ellipsoidal_height": altitude}
    easting, northing = TRANSFORMER.transform(longitude, latitude)
    return {
        "latitude": round(latitude, 9),
        "longitude": round(longitude, 9),
        "easting": round(easting, 3),
        "northing": round(northing, 3),
        "ellipsoidal_height": round(altitude, 3) if altitude is not None else None,
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(LOFT_MANIFEST.read_text(encoding="utf-8"))
    offset = manifest["offset"]
    records = []
    summary = {"scope": "preliminary K2 scan-derived reference, not a land survey or verified BIM transform", "target_projection_for_comparison": "EPSG:32632", "captures": {}}
    summary["loft_export"] = {"source": str(LOFT_MANIFEST), "sha256": digest(LOFT_MANIFEST), "epsg": manifest["epsg"], "offset_m": offset, "shift": manifest["shift"], "scale": manifest["scale"]}
    for capture_id, directory in CAPTURES.items():
        gnss_path = directory / "gnss.csv"
        points_path = directory / "control_points_latest.csv"
        gnss = read_gnss(gnss_path)
        times = [row["timestamp"] for row in gnss]
        status_counts = Counter(row["status"] for row in gnss)
        fixed = [row for row in gnss if row["status"] == "4" and coordinates(row)["easting"] is not None]
        fixed_coords = [coordinates(row) for row in fixed]
        capture = {
            "source_directory": str(directory),
            "gnss_sha256": digest(gnss_path),
            "control_points_sha256": digest(points_path),
            "gnss_rows": len(gnss),
            "gnss_status_counts": dict(sorted(status_counts.items())),
            "fixed_rows_with_coordinates": len(fixed),
            "fixed_easting_range_m": [min(p["easting"] for p in fixed_coords), max(p["easting"] for p in fixed_coords)] if fixed_coords else None,
            "fixed_northing_range_m": [min(p["northing"] for p in fixed_coords), max(p["northing"] for p in fixed_coords)] if fixed_coords else None,
            "fixed_ellipsoidal_height_range_m": [min(p["ellipsoidal_height"] for p in fixed_coords if p["ellipsoidal_height"] is not None), max(p["ellipsoidal_height"] for p in fixed_coords if p["ellipsoidal_height"] is not None)] if fixed_coords else None,
            "points": 0,
            "points_with_nearby_fixed": 0,
        }
        for point in read_points(points_path):
            timestamp = float(point["timestamp"])
            index = bisect.bisect_left(times, timestamp)
            candidates = [gnss[i] for i in (index - 1, index) if 0 <= i < len(gnss)]
            nearest = min(candidates, key=lambda row: abs(row["timestamp"] - timestamp)) if candidates else None
            if nearest is None:
                continue
            dt = abs(nearest["timestamp"] - timestamp)
            fixed_nearby = nearest["status"] == "4" and dt <= 0.5
            capture["points"] += 1
            capture["points_with_nearby_fixed"] += int(fixed_nearby)
            record = {
                "capture_id": capture_id,
                "point_id": point["id"],
                "point_label": point["label"],
                "point_timestamp": f"{timestamp:.6f}",
                "local_x_m": point["x"], "local_y_m": point["y"], "local_z_m": point["z"],
                "nearest_gnss_time_delta_s": round(dt, 3),
                "nearest_gnss_status": nearest["status"],
                "nearest_gnss_fixed_within_0_5s": fixed_nearby,
                **coordinates(nearest),
                "gnss_undulation_m": finite(nearest["undulation"]),
                "satellite_count": nearest["satellite_num"],
                "hdop": finite(nearest["hdop"]),
            }
            if capture_id == "152950":
                point_easting = float(point["x"]) + offset[0]
                point_northing = float(point["y"]) + offset[1]
                point_height = float(point["z"]) + offset[2]
                record["scan_export_easting"] = round(point_easting, 3)
                record["scan_export_northing"] = round(point_northing, 3)
                record["scan_export_height"] = round(point_height, 3)
                if fixed_nearby and record["easting"] is not None:
                    record["antenna_vs_export_horizontal_m"] = round(math.hypot(record["easting"] - point_easting, record["northing"] - point_northing), 3)
                else:
                    record["antenna_vs_export_horizontal_m"] = None
            else:
                record.update(scan_export_easting=None, scan_export_northing=None, scan_export_height=None, antenna_vs_export_horizontal_m=None)
            records.append(record)
        summary["captures"][capture_id] = capture

    csv_path = OUT / "bs17-k2-control-points-and-nearest-gnss.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
    fixed_loft_gcps = [row for row in records if row["capture_id"] == "152950" and row["nearest_gnss_fixed_within_0_5s"] and row["point_label"].startswith("0_")]
    with (OUT / "bs17-loft-fixed-gcp-candidates.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(fixed_loft_gcps)
    summary["caveats"] = [
        "Nearest GNSS observations describe the scanner antenna at the point timestamp, not a surveyed target centre.",
        "Status 4 is fixed; other statuses are not RTK control observations.",
        "EPSG:32632 is declared by the Loftet LCC2 export; the GNSS source datum and Revit project datum must be confirmed.",
        "Loft target coordinates are computed as LCC2 offset plus scan-local control-point coordinates; direct GNSS readings are antenna positions and are only used as an independent horizontal plausibility check.",
        "GNSS altitude is treated as ellipsoidal/geodetic height per XGRIDS K2 documentation; do not use as NN2000 without a verified vertical transformation.",
        "The scan-to-IFC rotation, translation and residuals still require common physical points and an independent accuracy check.",
    ]
    (OUT / "bs17-k2-rtk-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(records), "captures": {key: {k: value[k] for k in ("gnss_status_counts", "fixed_rows_with_coordinates", "points", "points_with_nearby_fixed")} for key, value in summary["captures"].items()}, "output": str(OUT)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
