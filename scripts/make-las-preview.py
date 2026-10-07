"""Build a lightweight local scan preview from a georeferenced LAS and RTK anchors.

The source LAS and CSV files are read only. Output uses the viewer's 16-byte
point record: float32 local x/y/z followed by RGB and an unused alpha byte.
"""

import argparse
import csv
import json
from pathlib import Path

import laspy
import numpy as np
from pyproj import Transformer


def rows(path: Path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        header = stream.readline().lstrip("#").strip().split(",")
        yield from csv.DictReader(stream, fieldnames=header)


def anchors(scan: Path, point_data: dict):
    fixes = [row for row in rows(scan / "project_data" / "gnss.csv") if row["status"] == "4"]
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:25832", always_xy=True)
    local, projected = [], []
    for point in point_data["points"]:
        if point["kind"] != "GCP" or point["gnss"]["status"] != 4:
            continue
        fix = min(fixes, key=lambda row: abs(float(row["timestamp"]) - point["timestamp"]))
        if abs(float(fix["timestamp"]) - point["timestamp"]) > 0.5:
            continue
        east, north = transformer.transform(float(fix["longitude"]), float(fix["latitude"]))
        local.append(point["position"])
        projected.append([east, north, float(fix["altitude"])])
    if len(local) < 3:
        raise ValueError("Need at least three time-matched status 4 GCPs")
    local = np.asarray(local)
    projected = np.asarray(projected)
    center_local = local[:, :2].mean(axis=0)
    center_projected = projected[:, :2].mean(axis=0)
    u, _, vt = np.linalg.svd((local[:, :2] - center_local).T @ (projected[:, :2] - center_projected))
    rotation = u @ vt
    if np.linalg.det(rotation) < 0:
        u[:, -1] *= -1
        rotation = u @ vt
    translation = center_projected - center_local @ rotation
    horizontal_errors = np.linalg.norm(local[:, :2] @ rotation + translation - projected[:, :2], axis=1)
    vertical_offset = float(np.median(projected[:, 2] - local[:, 2]))
    vertical_errors = np.abs(local[:, 2] + vertical_offset - projected[:, 2])
    if max(horizontal_errors) > 0.25 or max(vertical_errors) > 0.25:
        raise ValueError("RTK anchors disagree with scan-local positions by more than 25 cm")
    return rotation, translation, vertical_offset, horizontal_errors, vertical_errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scan", type=Path, help="Raw scan directory containing map.las and project_data")
    parser.add_argument("points", type=Path, help="Exported scan points JSON")
    parser.add_argument("output", type=Path, help="Output prefix without extension")
    parser.add_argument("--stride", type=int, default=128)
    args = parser.parse_args()
    if args.stride < 1:
        parser.error("--stride must be positive")
    point_data = json.loads(args.points.read_text(encoding="utf-8"))
    if not args.scan.name.endswith(point_data["captureId"]):
        raise ValueError("LAS and marker capture IDs differ")
    rotation, translation, z_offset, xy_errors, z_errors = anchors(args.scan, point_data)

    with laspy.open(args.scan / "map.las") as source:
        header = source.header
        if header.point_format.id != 3 or header.point_format.size != 34:
            raise ValueError("Expected uncompressed LAS point format 3 with 34-byte records")
        if not (header.mins[0] < translation[0] < header.maxs[0]
                and header.mins[1] < translation[1] < header.maxs[1]):
            raise ValueError("RTK anchor is outside LAS bounds; projected CRS may be wrong")
        sample_count = (header.point_count - 1) // args.stride + 1
        dtype = np.dtype({"names": ["X", "Y", "Z", "R", "G", "B"],
                          "formats": ["<i4", "<i4", "<i4", "<u2", "<u2", "<u2"],
                          "offsets": [0, 4, 8, 28, 30, 32], "itemsize": 34})
        mapped = np.memmap(args.scan / "map.las", dtype=np.uint8, mode="r")
        sample = np.ndarray((sample_count,), dtype=dtype, buffer=mapped,
                            offset=header.offset_to_point_data,
                            strides=(header.point_format.size * args.stride,))
        args.output.parent.mkdir(parents=True, exist_ok=True)
        result = np.memmap(args.output.with_suffix(".bin"), dtype=np.uint8, mode="w+",
                           shape=(sample_count, 16))
        output = result.view(np.dtype({"names": ["x", "y", "z", "r", "g", "b", "a"],
                                       "formats": ["<f4", "<f4", "<f4", "u1", "u1", "u1", "u1"],
                                       "offsets": [0, 4, 8, 12, 13, 14, 15], "itemsize": 16})).reshape(-1)
        color_shift = 8 if max(int(sample[channel][: min(sample_count, 10_000)].max())
                               for channel in "RGB") > 255 else 0
        # Small batches keep memory bounded even for source files with hundreds of millions of points.
        for start in range(0, sample_count, 100_000):
            end = min(start + 100_000, sample_count)
            chunk = sample[start:end]
            xy = np.column_stack((chunk["X"] * header.scales[0] + header.offsets[0],
                                  chunk["Y"] * header.scales[1] + header.offsets[1]))
            local_xy = (xy - translation) @ rotation.T
            output["x"][start:end] = local_xy[:, 0]
            output["y"][start:end] = local_xy[:, 1]
            output["z"][start:end] = chunk["Z"] * header.scales[2] + header.offsets[2] - z_offset
            for color in "RGB":
                output[color.lower()][start:end] = (chunk[color] >> color_shift).astype("u1")
            output["a"][start:end] = 255
        result.flush()

    preview = {
        "captureId": point_data["captureId"],
        "source": "map.las (uniform sample transformed to scan-local via RTK status 4 GCPs)",
        "sourcePoints": header.point_count,
        "points": sample_count,
        "stride": args.stride,
        "recordBytes": 16,
        "registration": {
            "projectedCrsCandidate": "EPSG:25832 (inferred from GNSS, not declared in LAS)",
            "anchorCount": len(xy_errors),
            "maximumHorizontalResidualMeters": round(float(max(xy_errors)), 3),
            "maximumVerticalResidualMeters": round(float(max(z_errors)), 3),
            "translation": translation.tolist(),
            "rotation": rotation.tolist(),
            "verticalOffset": z_offset,
        },
        "nearestGcpMeters": {},
    }
    args.output.with_suffix(".json").write_text(json.dumps(preview, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"points": sample_count, "registration": preview["registration"]}, indent=2))


if __name__ == "__main__":
    main()
