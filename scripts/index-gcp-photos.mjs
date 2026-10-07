import { promises as fs } from "node:fs";
import path from "node:path";

const [photoRoot, gcpFile, outputFile] = process.argv.slice(2);
if (!photoRoot || !gcpFile || !outputFile) {
  throw new Error("Usage: node scripts/index-gcp-photos.mjs <photo folder> <point JSON> <output JSON>");
}

const data = JSON.parse(await fs.readFile(gcpFile, "utf8"));
const directories = (await fs.readdir(photoRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const photos = {};
for (const point of data.points) {
  const folder = directories.find((name) => name.toLowerCase().endsWith(`_${point.label.toLowerCase()}`));
  if (!folder) throw new Error(`No photo folder for ${point.label}`);
  const files = (await fs.readdir(path.join(photoRoot, folder)))
    .filter((name) => /^camera_\d+_\d+\.(?:jpg|jpeg|png)$/i.test(name))
    .sort((a, b) => Number(a.match(/^camera_(\d+)/)[1]) - Number(b.match(/^camera_(\d+)/)[1]));
  if (files.length !== 3) throw new Error(`Expected 3 photos for ${point.label}, found ${files.length}`);
  photos[point.label] = files.map((name) => ({
    camera: Number(name.match(/^camera_(\d+)/)[1]),
    path: `${folder}/${name}`,
  }));
}
await fs.writeFile(outputFile, `${JSON.stringify({ captureId: data.captureId, photos }, null, 2)}\n`);
console.log(`Indexed ${Object.values(photos).flat().length} photos for ${Object.keys(photos).length} labelled points`);
