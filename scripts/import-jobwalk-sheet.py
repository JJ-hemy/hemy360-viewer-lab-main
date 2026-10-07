"""Extract approximate JobWalk waypoint locations from an interactive sheet PDF."""

import json
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from PIL import Image
from pypdf import PdfReader


pdf_path = Path(sys.argv[1])
rendered_path = Path(sys.argv[2])
out_dir = Path(sys.argv[3])
floor_number = int(sys.argv[4]) if len(sys.argv) > 4 else 1
expected_count = int(sys.argv[5]) if len(sys.argv) > 5 else None
out_dir.mkdir(parents=True, exist_ok=True)

page = PdfReader(pdf_path).pages[0]
page_w = float(page.mediabox.width)
page_h = float(page.mediabox.height)
image = Image.open(rendered_path).convert("RGB")
scale_x = image.width / page_w
scale_y = image.height / page_h

# The sheet is the right-hand panel in HoloBuilder's single-page PDF export.
# Retain its title block so these locations remain visibly tied to the source.
crop = (round(image.width * 0.322), round(image.height * 0.182),
        round(image.width * 0.963), round(image.height * 0.819))
image.crop(crop).save(out_dir / f"floor-{floor_number:02d}.webp", "WEBP", quality=88)

points = []
for annotation_ref in page.get("/Annots", []):
    annotation = annotation_ref.get_object()
    uri = str(annotation.get("/A", {}).get("/URI", ""))
    if annotation.get("/Subtype") != "/Link" or not uri.startswith("https://app.holobuilder.eu/app?"):
        continue
    params = parse_qs(urlparse(uri).query)
    if "s" not in params:
        continue
    x1, y1, x2, y2 = [float(value) for value in annotation["/Rect"]]
    if x2 - x1 > 20 or y2 - y1 > 20:
        continue  # Title/project links, not map markers.
    center_x = (x1 + x2) * 0.5 * scale_x
    center_y = (page_h - (y1 + y2) * 0.5) * scale_y
    x = (center_x - crop[0]) / (crop[2] - crop[0])
    y = (center_y - crop[1]) / (crop[3] - crop[1])
    if not (0 <= x <= 1 and 0 <= y <= 1):
        continue  # Project-title link in the export margin.
    points.append({"id": params["s"][0], "x": round(x, 6), "y": round(y, 6), "url": uri})

if expected_count is not None and len(points) != expected_count:
    raise ValueError(f"Expected {expected_count} waypoints, got {len(points)}")
if len({point["id"] for point in points}) != len(points):
    raise ValueError("Duplicate waypoint IDs in the sheet export")

payload = {
    "project": "BS17 - CP: Office to Retail Space (JobWalk)",
    "sheet": f"{floor_number:02d}. FLOOR",
    "source": "HoloBuilder interactive sheet PDF, exported 2026-10-06",
    "accuracy": "Approximate manual positions on a 2D floor plan; not surveyed coordinates",
    "points": points,
}
(out_dir / f"floor-{floor_number:02d}-waypoints.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Extracted {len(points)} linked waypoints; image {image.width}x{image.height}")
