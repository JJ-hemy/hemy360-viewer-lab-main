import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [projectDataDirectory, outputPath] = process.argv.slice(2);
if (!projectDataDirectory || !outputPath) {
  throw new Error("Usage: node scripts/export-scan-points.mjs <project_data directory> <output JSON>");
}

const scanId = path.basename(path.dirname(projectDataDirectory));
const captureId = scanId.match(/(?:^|[-_])(\d{6})$/)?.[1];
if (!captureId) throw new Error(`Missing six-digit capture ID in ${scanId}`);
const [controlText, gnssText] = await Promise.all([
  readFile(path.join(projectDataDirectory, "control_points_latest.csv"), "utf8"),
  readFile(path.join(projectDataDirectory, "gnss.csv"), "utf8"),
]);
const gnss = gnssText.split(/\r?\n/).filter((line) => line && !line.startsWith("#"))
  .map((line) => { const [time, status] = line.split(","); return { time: Number(time), status: Number(status) }; })
  .filter((row) => Number.isFinite(row.time) && Number.isInteger(row.status))
  .sort((a, b) => a.time - b.time);

function nearestGnss(time) {
  let low = 0;
  let high = gnss.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (gnss[middle].time < time) low = middle + 1;
    else high = middle;
  }
  const nearest = [gnss[low - 1], gnss[low]].filter(Boolean)
    .sort((a, b) => Math.abs(a.time - time) - Math.abs(b.time - time))[0];
  if (!nearest || Math.abs(nearest.time - time) > 0.5) return { status: null, timeDifferenceSeconds: null };
  return { status: nearest.status, timeDifferenceSeconds: Math.round(Math.abs(nearest.time - time) * 1000) / 1000 };
}

function kindOf(label) {
  if (/gcp/i.test(label) || /^0_\d+$/i.test(label)) return "GCP";
  if (/^POI_/i.test(label)) return "POI";
  if (/^HDE_/i.test(label)) return "HDE";
  if (/^POV_/i.test(label)) return "POV";
  return null;
}

const points = controlText.split(/\r?\n/).filter((line) => line && !line.startsWith("#"))
  .map((line) => line.trim().split(/\s+/))
  .filter((fields) => fields.length >= 11 && kindOf(fields[3]))
  .map((fields) => {
    const [timestamp, id, , label, x, y, z, qw, qx, qy, qz] = fields;
    const position = [x, y, z].map(Number);
    const orientation = [qx, qy, qz, qw].map(Number);
    const time = Number(timestamp);
    if (!Number.isFinite(time) || [...position, ...orientation].some((value) => !Number.isFinite(value))) {
      throw new Error(`Invalid point row: ${fields.join(" ")}`);
    }
    return { id, sourceKey: `${captureId}:${id}`, sourceLabel: label, canonicalGcpId: null,
      label, kind: kindOf(label), position, orientation, timestamp: time, gnss: nearestGnss(time) };
  });
const referencePois = points.filter((point) => point.kind === "POI")
  .map(({ label, position }) => ({ label, position }));
await writeFile(outputPath, `${JSON.stringify({ scanId, captureId, coordinateFrame: "scan-local",
  source: "project_data/control_points_latest.csv + project_data/gnss.csv", points, referencePois }, null, 2)}\n`);
console.log(`${captureId}: ${points.length} labelled points (${["GCP", "POI", "HDE", "POV"].map((kind) => `${kind} ${points.filter((point) => point.kind === kind).length}`).join(", ")})`);
