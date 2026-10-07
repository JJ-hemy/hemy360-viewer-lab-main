import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [modelDir, gcpPath, outputPrefix] = process.argv.slice(2);
if (!modelDir || !gcpPath || !outputPrefix) {
  throw new Error("Usage: node scripts/make-potree-preview.mjs <project_data/model> <gcp JSON> <output prefix>");
}

const scanId = path.basename(path.dirname(path.dirname(modelDir))).match(/(?:^|[-_])(\d{6})$/)?.[1];
const metadata = JSON.parse(await readFile(path.join(modelDir, "metadata.json"), "utf8"));
const pointData = JSON.parse(await readFile(gcpPath, "utf8"));
if (!scanId || pointData.captureId !== scanId) throw new Error("Point cloud and point capture IDs differ");
const gcps = pointData.points.filter((point) => point.kind === "GCP" || /gcp/i.test(point.label));
if (metadata.encoding !== "DEFAULT") throw new Error(`Unsupported Potree encoding: ${metadata.encoding}`);
if (JSON.stringify(metadata.attributes.map(({ name, size }) => [name, size])) !==
    JSON.stringify([["position", 12], ["intensity", 1], ["rgb", 3]])) {
  throw new Error("Unexpected Potree point record layout");
}

const source = await readFile(path.join(modelDir, "octree.bin"));
const bytesPerPoint = 16;
if (source.length !== metadata.points * bytesPerPoint) throw new Error("Potree point count does not match file size");
const stride = 4;
const count = Math.ceil(metadata.points / stride);
const result = Buffer.allocUnsafe(count * bytesPerPoint);
const [sx, sy, sz] = metadata.scale;
const [ox, oy, oz] = metadata.offset;
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
const nearest = gcps.map(() => Infinity);

for (let index = 0, outputIndex = 0; index < metadata.points; index += 1) {
  const inputOffset = index * bytesPerPoint;
  const x = source.readInt32LE(inputOffset) * sx + ox;
  const y = source.readInt32LE(inputOffset + 4) * sy + oy;
  const z = source.readInt32LE(inputOffset + 8) * sz + oz;
  const xyz = [x, y, z];
  for (let axis = 0; axis < 3; axis += 1) {
    min[axis] = Math.min(min[axis], xyz[axis]);
    max[axis] = Math.max(max[axis], xyz[axis]);
  }
  for (const [gcpIndex, gcp] of gcps.entries()) {
    const [gx, gy, gz] = gcp.position;
    nearest[gcpIndex] = Math.min(nearest[gcpIndex], Math.hypot(x - gx, y - gy, z - gz));
  }
  if (index % stride !== 0) continue;
  const outputOffset = outputIndex * bytesPerPoint;
  outputIndex += 1;
  result.writeFloatLE(x, outputOffset);
  result.writeFloatLE(y, outputOffset + 4);
  result.writeFloatLE(z, outputOffset + 8);
  result[outputOffset + 12] = source[inputOffset + 13];
  result[outputOffset + 13] = source[inputOffset + 14];
  result[outputOffset + 14] = source[inputOffset + 15];
  result[outputOffset + 15] = 255;
}

const preview = {
  captureId: scanId,
  source: "project_data/model/octree.bin (Potree 2.0 DEFAULT)",
  points: count,
  sourcePoints: metadata.points,
  stride,
  recordBytes: bytesPerPoint,
  bounds: { min, max },
  nearestGcpMeters: Object.fromEntries(gcps.map((point, index) => [point.label, Number(nearest[index].toFixed(3))])),
};
await Promise.all([
  writeFile(`${outputPrefix}.bin`, result),
  writeFile(`${outputPrefix}.json`, `${JSON.stringify(preview, null, 2)}\n`),
]);
console.log(JSON.stringify(preview));
