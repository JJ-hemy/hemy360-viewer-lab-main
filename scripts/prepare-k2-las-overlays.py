"""Prepare local LAS and point/photo previews for two K2 captures in one viewer frame.

The input scans and Loftet LCC2 manifest are read only. The 16-byte preview
records are little-endian float32 XYZ and uint8 RGBA. All output is derived,
provisional, and belongs in the Git-ignored public/models and public/data.

Example (PowerShell, with paths set to local files):
  python scripts/prepare-k2-las-overlays.py --interior $inside --exterior $outside `
    --loft-manifest $manifest --rtk-calibration $calibrationZip
"""

from __future__ import annotations

import argparse
import bisect
import csv
import json
import math
import os
import re
import stat
import zipfile
from pathlib import Path

import laspy
import numpy as np
from pyproj import Transformer


POINT_RECORD = np.dtype({
    "names": ["X", "Y", "Z", "R", "G", "B"],
    "formats": ["<i4", "<i4", "<i4", "<u2", "<u2", "<u2"],
    "offsets": [0, 4, 8, 28, 30, 32],
    "itemsize": 34,
})
PREVIEW_RECORD = np.dtype({
    "names": ["x", "y", "z", "r", "g", "b", "a"],
    "formats": ["<f4", "<f4", "<f4", "u1", "u1", "u1", "u1"],
    "offsets": [0, 4, 8, 12, 13, 14, 15],
    "itemsize": 16,
})


def locally_available(path: Path) -> None:
    if not path.is_file():
        raise FileNotFoundError(path)
    attributes = getattr(path.stat(), "st_file_attributes", 0)
    if attributes & getattr(stat, "FILE_ATTRIBUTE_OFFLINE", 0x1000):
        raise RuntimeError(f"Dropbox file is still offline: {path}")


def capture_id(scan: Path) -> str:
    match = re.search(r"(?:^|[-_])(\d{6})$", scan.name)
    if not match:
        raise ValueError(f"Scan folder does not end with six-digit capture ID: {scan}")
    return match.group(1)


def read_calibration(path: Path) -> np.ndarray:
    locally_available(path)
    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as archive:
            names = [name for name in archive.namelist() if name.endswith("extrinsic_rtk.yaml")]
            if len(names) != 1:
                raise ValueError("Calibration ZIP must contain exactly one extrinsic_rtk.yaml")
            content = archive.read(names[0]).decode("utf-8")
    else:
        content = path.read_text(encoding="utf-8")
    match = re.search(r"^xyz_default:\s*\[([^]]+)\]", content, re.MULTILINE)
    if not match:
        raise ValueError("Missing xyz_default antenna-to-IMU lever arm in RTK calibration")
    values = np.array([float(value.strip()) for value in match.group(1).split(",")])
    if values.shape != (3,) or not np.all(np.isfinite(values)):
        raise ValueError("Invalid RTK lever arm")
    if "customized: true" in content:
        raise ValueError("Custom RTK lever arm requires explicit review")
    return values


def read_las_header(path: Path) -> laspy.LasHeader:
    locally_available(path)
    with laspy.open(path) as reader:
        header = reader.header
    if header.version.major != 1 or header.point_format.id != 3 or header.point_format.size != 34:
        raise ValueError(f"Expected uncompressed LAS 1.x point format 3: {path}")
    expected = header.offset_to_point_data + header.point_count * 34
    if path.stat().st_size != expected:
        raise ValueError(f"LAS byte count differs from header: {path}")
    return header


def read_gnss(path: Path) -> tuple[np.ndarray, list[dict]]:
    locally_available(path)
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames:
            reader.fieldnames = [field.lstrip("#") for field in reader.fieldnames]
        rows = list(reader)
    times = np.array([float(row["timestamp"]) for row in rows])
    if not np.all(np.diff(times) >= 0):
        raise ValueError(f"GNSS timestamps are not sorted: {path}")
    return times, rows


def fit_rigid_xy(source: np.ndarray, target: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    source_center, target_center = source.mean(axis=0), target.mean(axis=0)
    u, _, vt = np.linalg.svd((source - source_center).T @ (target - target_center))
    rotation = vt.T @ u.T
    if np.linalg.det(rotation) < 0:
        vt[-1] *= -1
        rotation = vt.T @ u.T
    translation = target_center - rotation @ source_center
    return rotation, translation


def fit_interior(scan: Path, antenna: np.ndarray) -> dict:
    pose_path = scan / "project_data" / "poses.csv"
    locally_available(pose_path)
    poses = np.loadtxt(pose_path, delimiter=",")
    if poses.ndim != 2 or poses.shape[1] != 8 or not np.all(np.diff(poses[:, 0]) > 0):
        raise ValueError("Expected strictly timed raw pose rows: time,x,y,z,qx,qy,qz,qw")
    _, gnss = read_gnss(scan / "project_data" / "gnss.csv")
    fixed = [row for row in gnss if row["status"] == "4" and
             all(math.isfinite(float(row[field])) for field in ("latitude", "longitude", "altitude")) and
             poses[0, 0] <= float(row["timestamp"]) <= poses[-1, 0]]
    if len(fixed) < 10:
        raise ValueError("Too few status-4 GNSS fixes for a provisional pose fit")
    times = np.array([float(row["timestamp"]) for row in fixed])
    right = np.searchsorted(poses[:, 0], times, side="right")
    left = np.clip(right - 1, 0, len(poses) - 2)
    right = left + 1
    fraction = ((times - poses[left, 0]) / (poses[right, 0] - poses[left, 0]))[:, None]
    xyz = poses[left, 1:4] * (1 - fraction) + poses[right, 1:4] * fraction
    q_left, q_right = poses[left, 4:8].copy(), poses[right, 4:8].copy()
    q_right[np.sum(q_left * q_right, axis=1) < 0] *= -1
    q = q_left * (1 - fraction) + q_right * fraction
    q /= np.linalg.norm(q, axis=1)[:, None]
    vector, scalar = q[:, :3], q[:, 3, None]
    antenna_local = xyz + antenna + 2 * scalar * np.cross(vector, antenna) + \
        2 * np.cross(vector, np.cross(vector, antenna))
    projected = np.array(Transformer.from_crs("EPSG:4326", "EPSG:32632", always_xy=True).transform(
        [float(row["longitude"]) for row in fixed],
        [float(row["latitude"]) for row in fixed])).T
    keep = np.ones(len(fixed), dtype=bool)
    for _ in range(5):
        rotation, translation = fit_rigid_xy(antenna_local[keep, :2], projected[keep])
        errors = np.linalg.norm(antenna_local[:, :2] @ rotation.T + translation - projected, axis=1)
        updated = errors <= max(0.20, 3 * float(np.median(errors[keep])))
        if updated.sum() < 10 or np.array_equal(updated, keep):
            break
        keep = updated
    rotation, translation = fit_rigid_xy(antenna_local[keep, :2], projected[keep])
    errors = np.linalg.norm(antenna_local[:, :2] @ rotation.T + translation - projected, axis=1)
    fixed_heights = np.array([float(row["altitude"]) for row in fixed])
    z_shift = float(np.median(fixed_heights[keep] - antenna_local[keep, 2]))
    vertical_errors = np.abs(antenna_local[:, 2] + z_shift - fixed_heights)
    if float(np.median(errors[keep])) > 0.5 or float(np.percentile(errors[keep], 90)) > 1.0:
        raise ValueError("Status-4 fit is too inconsistent for a viewer overlay")
    return {
        "rotation": rotation,
        "translation": np.array([translation[0], translation[1], z_shift]),
        "diagnostics": {
            "status4Count": len(fixed),
            "acceptedCount": int(keep.sum()),
            "medianHorizontalResidualM": round(float(np.median(errors[keep])), 4),
            "p90HorizontalResidualM": round(float(np.percentile(errors[keep], 90)), 4),
            "maxHorizontalResidualM": round(float(np.max(errors[keep])), 4),
            "medianAbsoluteVerticalResidualM": round(float(np.median(vertical_errors[keep])), 4),
            "p90AbsoluteVerticalResidualM": round(float(np.percentile(vertical_errors[keep], 90)), 4),
            "yawDeg": round(math.degrees(math.atan2(rotation[1, 0], rotation[0, 0])), 6),
        },
    }


def local_coordinates(points: np.ndarray, kind: str, loft_offset: np.ndarray,
                      exterior_offset: np.ndarray | None, interior_fit: dict | None) -> np.ndarray:
    if kind == "exterior":
        return points + exterior_offset - loft_offset
    result = np.empty_like(points, dtype=np.float64)
    result[:, :2] = points[:, :2] @ interior_fit["rotation"].T + interior_fit["translation"][:2] - loft_offset[:2]
    result[:, 2] = points[:, 2] + interior_fit["translation"][2] - loft_offset[2]
    return result


def point_kind(label: str) -> str | None:
    if re.fullmatch(r"0_\d+", label) or "gcp" in label.lower():
        return "GCP"
    for prefix in ("POI_", "HDE_", "POV_"):
        if label.upper().startswith(prefix):
            return prefix[:-1]
    return None


def read_points(scan: Path, kind: str, gnss_times: np.ndarray, gnss_rows: list[dict],
                loft_offset: np.ndarray, exterior_offset: np.ndarray | None,
                interior_fit: dict | None) -> dict:
    control_path = scan / "project_data" / ("control_points.csv" if kind == "interior" else "control_points_latest.csv")
    locally_available(control_path)
    rows = []
    for line in control_path.read_text(encoding="utf-8-sig").splitlines():
        if not line or line.startswith("#"):
            continue
        fields = line.split()
        if len(fields) < 11 or point_kind(fields[3]) is None:
            continue
        rows.append(fields)
    if not rows:
        raise ValueError(f"No control points in {control_path}")
    raw_xyz = np.array([[float(value) for value in row[4:7]] for row in rows])
    positions = local_coordinates(raw_xyz, kind, loft_offset, exterior_offset, interior_fit)
    cid = capture_id(scan)
    points = []
    for row, xyz in zip(rows, positions):
        timestamp, point_id, _, label = row[:4]
        time = float(timestamp)
        index = bisect.bisect_left(gnss_times, time)
        near = min((i for i in (index - 1, index) if 0 <= i < len(gnss_times)),
                   key=lambda i: abs(float(gnss_times[i]) - time), default=None)
        dt = abs(float(gnss_times[near]) - time) if near is not None else math.inf
        gnss = {"status": int(gnss_rows[near]["status"]), "timeDifferenceSeconds": round(dt, 3)} \
            if dt <= 0.5 else {"status": None, "timeDifferenceSeconds": None}
        qw, qx, qy, qz = [float(value) for value in row[7:11]]
        points.append({
            "id": point_id, "sourceKey": f"{cid}:{point_id}", "sourceLabel": label,
            "canonicalGcpId": None, "label": label, "kind": point_kind(label),
            "position": [round(float(value), 6) for value in xyz],
            "orientation": [qx, qy, qz, qw], "timestamp": time, "gnss": gnss,
            "sourceCaptureId": cid,
        })
    return {
        "scanId": scan.name, "captureId": cid,
        "coordinateFrame": "Loftet 152950 LCC2 local; provisional inferred registration",
        "source": f"project_data/{control_path.name} + project_data/gnss.csv",
        "points": points,
        "referencePois": [{"label": point["label"], "position": point["position"]}
                          for point in points if point["kind"] == "POI"],
    }


def index_photos(scan: Path, points: list[dict]) -> dict:
    root = scan / "project_data" / "photo"
    if not root.is_dir():
        raise FileNotFoundError(root)
    directories = [path for path in root.iterdir() if path.is_dir()]
    photos = {}
    for point in points:
        label = point["label"]
        matches = [directory for directory in directories if directory.name.lower().endswith("_" + label.lower())]
        if len(matches) != 1:
            raise ValueError(f"Expected one photo folder for {scan.name} {label}, got {len(matches)}")
        files = sorted((path for path in matches[0].iterdir()
                        if re.fullmatch(r"camera_\d+_\d+\.(?:jpg|jpeg|png)", path.name, re.I)),
                       key=lambda path: int(re.match(r"camera_(\d+)", path.name).group(1)))
        if len(files) != 3 or [int(re.match(r"camera_(\d+)", path.name).group(1)) for path in files] != [0, 1, 2]:
            raise ValueError(f"Expected camera 0/1/2 photos for {scan.name} {label}")
        for path in files:
            locally_available(path)
        photos[label] = [{"camera": index, "path": f"{matches[0].name}/{path.name}"}
                         for index, path in enumerate(files)]
    return {"captureId": capture_id(scan), "photos": photos}


def write_preview(scan: Path, kind: str, header: laspy.LasHeader, target_count: int,
                  loft_offset: np.ndarray, exterior_offset: np.ndarray | None,
                  interior_fit: dict | None, output: Path, calibration_name: str) -> dict:
    stride = max(1, math.ceil(header.point_count / target_count))
    count = (header.point_count - 1) // stride + 1
    mapped = np.memmap(scan / "map.las", dtype=np.uint8, mode="r")
    source = np.ndarray((count,), dtype=POINT_RECORD, buffer=mapped,
                        offset=header.offset_to_point_data, strides=(stride * 34,))
    preview_path = output.with_suffix(".bin")
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    preview = np.memmap(preview_path, mode="w+", dtype=PREVIEW_RECORD, shape=(count,))
    color_shift = 8 if max(int(source[channel][:min(count, 10_000)].max()) for channel in "RGB") > 255 else 0
    for start in range(0, count, 100_000):
        end = min(count, start + 100_000)
        chunk = source[start:end]
        raw = np.column_stack([chunk[axis] * header.scales[i] + header.offsets[i]
                               for i, axis in enumerate("XYZ")])
        # LAS scaling already applies the header offset. Only map-relative
        # control_points_latest rows need that offset added separately.
        local = raw - loft_offset if kind == "exterior" else \
            local_coordinates(raw, kind, loft_offset, exterior_offset, interior_fit)
        for i, axis in enumerate("xyz"):
            preview[axis][start:end] = local[:, i].astype("<f4")
        for axis in "RGB":
            preview[axis.lower()][start:end] = (chunk[axis] >> color_shift).astype("u1")
        preview["a"][start:end] = 255
    preview.flush()
    metadata = {
        "captureId": capture_id(scan), "source": "map.las, uniform deterministic stride; read-only input",
        "sourcePoints": header.point_count, "points": count, "stride": stride, "recordBytes": 16,
        "coordinateFrame": "Loftet 152950 LCC2 local; provisional overlay",
        "loftManifestOffsetM": loft_offset.tolist(),
        "registration": {
            "status": "provisional; visual comparison only, no independent surveyed GCP validation",
            "horizontalProjectionHypothesis": "WGS84 GNSS to UTM zone 32N (EPSG:32632); source LAS lacks CRS declaration",
            "verticalReference": "GNSS ellipsoidal height hypothesis; not verified NN2000",
            "method": "status-4 GNSS antenna to raw pose rigid fit" if kind == "interior" else
                      "LAS scaled coordinates; control_points_latest plus LAS header offset",
            "antennaLeverArmCalibration": calibration_name if kind == "interior" else None,
            "antennaLeverArmLocalM": interior_fit["antenna"].tolist() if kind == "interior" else None,
            "exteriorLasHeaderOffsetM": exterior_offset.tolist() if kind == "exterior" else None,
            "rawToProjectedRotationXY": interior_fit["rotation"].tolist() if kind == "interior" else None,
            "rawToProjectedTranslationXYZM": interior_fit["translation"].tolist() if kind == "interior" else None,
            **(interior_fit["diagnostics"] if kind == "interior" else {}),
        },
        "nearestGcpMeters": {},
    }
    output.with_suffix(".json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--interior", required=True, type=Path, help="Full raw K2 scan folder ending in six-digit ID")
    parser.add_argument("--exterior", required=True, type=Path, help="Full exterior K2 scan folder ending in six-digit ID")
    parser.add_argument("--loft-manifest", required=True, type=Path, help="Loftet 152950 LCC2 JSON manifest")
    parser.add_argument("--rtk-calibration", required=True, type=Path, help="Interior extrinsic_rtk.yaml or extracted calibration ZIP")
    parser.add_argument("--output-root", type=Path, default=Path(__file__).resolve().parents[1] / "public")
    parser.add_argument("--target-points", type=int, default=800_000, help="Maximum preview points per capture")
    parser.add_argument("--candidate-pair", action="append", default=[], metavar="INTERIOR:EXTERIOR",
                        help="Optional visually suspected point labels for residual display")
    args = parser.parse_args()
    if not 1 <= args.target_points <= 3_000_000:
        parser.error("--target-points must be between 1 and 3,000,000")
    locally_available(args.loft_manifest)
    manifest = json.loads(args.loft_manifest.read_text(encoding="utf-8"))
    if manifest.get("epsg") != 32632 or manifest.get("scale") != [1, 1, 1] or manifest.get("shift") != [0, 0, 0]:
        raise ValueError("Unexpected Loftet manifest coordinate settings")
    loft_offset = np.asarray(manifest["offset"], dtype=float)
    if loft_offset.shape != (3,) or not np.all(np.isfinite(loft_offset)):
        raise ValueError("Invalid Loftet manifest offset")
    antenna = read_calibration(args.rtk_calibration)
    interior_fit = fit_interior(args.interior, antenna)
    interior_fit["antenna"] = antenna
    exterior_header = read_las_header(args.exterior / "map.las")
    interior_header = read_las_header(args.interior / "map.las")
    exterior_offset = np.asarray(exterior_header.offsets, dtype=float)
    if not (100_000 < exterior_offset[0] < 900_000 and 5_000_000 < exterior_offset[1] < 8_000_000):
        raise ValueError("Exterior LAS header offset is inconsistent with the projected-coordinate hypothesis")
    point_sets = {}
    previews = {}
    photo_counts = {}
    for kind, scan, header in (("interior", args.interior, interior_header),
                               ("exterior", args.exterior, exterior_header)):
        cid = capture_id(scan)
        times, rows = read_gnss(scan / "project_data" / "gnss.csv")
        points = read_points(scan, kind, times, rows, loft_offset, exterior_offset, interior_fit)
        photos = index_photos(scan, points["points"])
        point_sets[kind] = points
        photo_counts[kind] = sum(len(group) for group in photos["photos"].values())
        data_dir = args.output_root / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        (data_dir / f"bs17-{cid}-points.json").write_text(
            json.dumps(points, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (data_dir / f"bs17-{cid}-photos.json").write_text(
            json.dumps(photos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        previews[kind] = write_preview(scan, kind, header, args.target_points, loft_offset,
                                       exterior_offset, interior_fit,
                                       args.output_root / "models" / f"bs17-{cid}-preview",
                                       args.rtk_calibration.name)
    pair_errors = []
    by_interior = {point["label"]: point for point in point_sets["interior"]["points"]}
    by_exterior = {point["label"]: point for point in point_sets["exterior"]["points"]}
    for pair in args.candidate_pair:
        try:
            inside, outside = pair.split(":", 1)
            a, b = by_interior[inside], by_exterior[outside]
        except (ValueError, KeyError) as exc:
            raise ValueError(f"Invalid candidate pair {pair}") from exc
        pair_errors.append({"interior": inside, "exterior": outside,
                            "distance3dM": round(float(np.linalg.norm(np.array(a["position"]) - np.array(b["position"]))), 4),
                            "interiorGnssStatus": a["gnss"]["status"], "exteriorGnssStatus": b["gnss"]["status"]})
    print(json.dumps({
        "outputRoot": str(args.output_root),
        "captures": {kind: {"captureId": preview["captureId"], "sourcePoints": preview["sourcePoints"],
                            "previewPoints": preview["points"], "pointMarkers": len(point_sets[kind]["points"]),
                            "photos": photo_counts[kind]}
                     for kind, preview, scan in (("interior", previews["interior"], args.interior),
                                                 ("exterior", previews["exterior"], args.exterior))},
        "interiorFit": interior_fit["diagnostics"], "candidatePairs": pair_errors,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
