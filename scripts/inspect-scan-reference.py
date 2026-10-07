"""Inspect scan metadata without loading its point data into memory."""

import argparse
import csv
import json
from collections import Counter
from pathlib import Path

import laspy


def inspect_gnss(path: Path) -> dict:
    with path.open(newline="", encoding="utf-8-sig") as stream:
        header = stream.readline().lstrip("#").strip().split(",")
        rows = csv.DictReader(stream, fieldnames=header)
        status_counts = Counter()
        fixed = []
        for row in rows:
            status = row["status"].strip()
            status_counts[status] += 1
            if status == "4":
                fixed.append(row)

    result = {
        "file": str(path),
        "status_counts": dict(sorted(status_counts.items())),
        "fixed_count": len(fixed),
        "usable_as_rtk_anchor": bool(fixed),
        "rejected_statuses": [key for key in sorted(status_counts) if key != "4"],
    }
    if fixed:
        for column in ("latitude", "longitude", "altitude", "undulation"):
            values = [float(row[column]) for row in fixed]
            result[f"fixed_{column}_range"] = [min(values), max(values)]
        result["fixed_gnss_types"] = dict(Counter(row["gnss_type"] for row in fixed))
    return result


def inspect_las(path: Path) -> dict:
    with laspy.open(path) as source:
        header = source.header
        crs = header.parse_crs()
        return {
            "file": str(path),
            "point_count": header.point_count,
            "bounds": {"min": header.mins.tolist(), "max": header.maxs.tolist()},
            "crs": str(crs) if crs else None,
            "point_format": header.point_format.id,
        }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gnss", type=Path)
    parser.add_argument("--las", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if not args.gnss and not args.las:
        parser.error("Velg minst én av --gnss og --las")
    report = {}
    if args.gnss:
        report["gnss"] = inspect_gnss(args.gnss)
    if args.las:
        report["las"] = inspect_las(args.las)
    payload = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")
    print(payload, end="")


if __name__ == "__main__":
    main()
