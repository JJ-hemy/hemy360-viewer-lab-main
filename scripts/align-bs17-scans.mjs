import { readFile, writeFile } from "node:fs/promises";

const [loftManifestPath, loftPointsPath, adjacentManifestPath, adjacentPointsPath, adjacentPoiPath, outputPath] = process.argv.slice(2);
if (!outputPath) throw new Error("Usage: node align-bs17-scans.mjs <loft.lcc2> <loft-points.json> <adjacent.lcc2> <adjacent-points.json> <adjacent-poi.json> <output.json>");

const [loftManifest, loftData, adjacentManifest, adjacentData, exportedPois] = await Promise.all(
  [loftManifestPath, loftPointsPath, adjacentManifestPath, adjacentPointsPath, adjacentPoiPath]
    .map(async (file) => JSON.parse(await readFile(file, "utf8"))),
);
if (loftManifest.epsg !== 32632 || adjacentManifest.epsg !== loftManifest.epsg) throw new Error("Different or unexpected CRS");
if (loftData.captureId !== "152950" || adjacentData.captureId !== "152958") throw new Error("Unexpected capture ID");
for (const manifest of [loftManifest, adjacentManifest]) {
  if (manifest.scale?.some((value) => value !== 1) || manifest.shift?.some((value) => value !== 0)) {
    throw new Error("Nontrivial LCC2 scale or shift requires a full transform");
  }
}
const rawPois = new Map(adjacentData.referencePois.map((point) => [point.label, point.position]));
const deltas = exportedPois.flatMap((point) => {
  const raw = rawPois.get(point.customLabel ?? point.name);
  return raw ? [point.position.map((value, index) => value - raw[index])] : [];
});
if (deltas.length < 3) throw new Error("Too few common POIs");
const mean = [0, 1, 2].map((axis) => deltas.reduce((sum, delta) => sum + delta[axis], 0) / deltas.length);
const residuals = deltas.map((delta) => Math.hypot(...delta.map((value, axis) => value - mean[axis])));
const maxPoiResidual = Math.max(...residuals);
if (maxPoiResidual > 0.25) throw new Error(`POI residual ${maxPoiResidual.toFixed(3)} m exceeds 0.25 m`);
const offsetDeltaToLoft = adjacentManifest.offset.map((value, index) => value - loftManifest.offset[index]);
const intoLoftFrame = (point) => point.position.map((value, axis) => value + mean[axis] + offsetDeltaToLoft[axis]);
const loftGcps = loftData.points.filter((point) => point.kind === "GCP");
const candidates = adjacentData.points.filter((point) => point.kind === "GCP").flatMap((point) => {
  const shifted = intoLoftFrame(point);
  const nearest = loftGcps.map((loft) => ({
    loft,
    distance: Math.hypot(...shifted.map((value, index) => value - loft.position[index])),
  })).sort((a, b) => a.distance - b.distance)[0];
  return nearest && nearest.distance < 0.35 ? [{
    adjacentSourceKey: point.sourceKey,
    adjacentLabel: point.label,
    adjacentGnssStatus: point.gnss.status,
    loftSourceKey: nearest.loft.sourceKey,
    loftLabel: nearest.loft.label,
    loftGnssStatus: nearest.loft.gnss.status,
    distance3dM: Number(nearest.distance.toFixed(3)),
    proposedCanonicalGcpId: null,
    note: "Geometric candidate only; confirm same physical target in images before assigning a shared name.",
  }] : [];
});
const result = {
  status: "preliminary-visual-alignment",
  crs: "EPSG:32632",
  referenceCaptureId: "152950",
  adjacentCaptureId: "152958",
  commonPoiCount: deltas.length,
  rawToExportTranslationM: mean.map((value) => Number(value.toFixed(6))),
  maxPoiResidualM: Number(maxPoiResidual.toFixed(3)),
  adjacentOffsetMinusLoftOffsetM: offsetDeltaToLoft.map((value) => Number(value.toFixed(6))),
  gcpCandidates: candidates,
  warning: "LCC2 offsets and POI translation give a visual comparison. GCP names and geodetic accuracy require physical target confirmation and independent control.",
};
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`${deltas.length} POIs, max residual ${maxPoiResidual.toFixed(3)} m; ${candidates.length} GCP candidates under 0.35 m`);
