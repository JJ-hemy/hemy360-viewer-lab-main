import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [projectDataDirectory, outputPath] = process.argv.slice(2);
if (!projectDataDirectory || !outputPath) {
  throw new Error("Usage: node scripts/export-gcp-markers.mjs <project_data directory> <output JSON>");
}

const controlPointsPath = path.join(projectDataDirectory, "control_points_latest.csv");
const gnssPath = path.join(projectDataDirectory, "gnss.csv");
const [controlPointsText, gnssText] = await Promise.all([
  readFile(controlPointsPath, "utf8"),
  readFile(gnssPath, "utf8"),
]);

const gnss = gnssText.split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => {
    const [time, status] = line.split(",");
    return { time: Number(time), status: Number(status) };
  })
  .filter((row) => Number.isFinite(row.time) && Number.isInteger(row.status))
  .sort((a, b) => a.time - b.time);

function nearestGnss(time) {
  let low = 0;
  let high = gnss.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (gnss[mid].time < time) low = mid + 1;
    else high = mid;
  }
  const candidates = [gnss[low - 1], gnss[low]].filter(Boolean);
  const nearest = candidates.sort((a, b) => Math.abs(a.time - time) - Math.abs(b.time - time))[0];
  if (!nearest || Math.abs(nearest.time - time) > 0.5) {
    return { status: null, timeDifferenceSeconds: null };
  }
  return {
    status: nearest.status,
    timeDifferenceSeconds: Math.round(Math.abs(nearest.time - time) * 1000) / 1000,
  };
}

const controlPoints = controlPointsText.split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => line.trim().split(/\s+/))
  .filter((fields) => fields.length >= 7 && (/gcp/i.test(fields[3]) || /^POI_/i.test(fields[3])))
  .map((fields) => {
    const [timestamp, id, , label, x, y, z] = fields;
    const time = Number(timestamp);
    const position = [Number(x), Number(y), Number(z)];
    if (!Number.isFinite(time) || position.some((value) => !Number.isFinite(value))) {
      throw new Error(`Invalid GCP row: ${fields.join(" ")}`);
    }
    return { id, label, position, timestamp: time, gnss: nearestGnss(time) };
  });
const points = controlPoints.filter((point) => /gcp/i.test(point.label));
const referencePois = controlPoints.filter((point) => /^POI_/i.test(point.label))
  .map(({ label, position }) => ({ label, position }));

const output = {
  scanId: path.basename(path.dirname(projectDataDirectory)),
  captureId: path.basename(path.dirname(projectDataDirectory)).match(/(?:^|[-_])(\d{6})$/)?.[1] ?? null,
  coordinateFrame: "scan-local",
  source: "project_data/control_points_latest.csv + project_data/gnss.csv",
  statusMeaning: { "4": "RTK fixed", "1": "single" },
  points,
  referencePois,
};
if (!output.captureId) throw new Error(`Missing six-digit capture ID in ${output.scanId}`);
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
const counts = Object.groupBy(points, (point) => String(point.gnss.status ?? "unknown"));
console.log(JSON.stringify({ scanId: output.scanId, points: points.length,
  statusCounts: Object.fromEntries(Object.entries(counts).map(([status, rows]) => [status, rows.length])) }));
