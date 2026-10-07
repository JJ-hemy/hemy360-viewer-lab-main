import { closeSync, openSync, readSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { freemem } from "node:os";
import { IfcImporter } from "@thatopen/fragments";

const source = process.argv[2];
const output = process.argv[3];
if (!source || !output) {
  console.error("Bruk: node scripts/ifc-to-frag.mjs <modell.ifc> <modell.frag>");
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmDir = resolve(root, "node_modules/web-ifc");
const importer = new IfcImporter();
importer.wasm = { path: `${wasmDir}\\`, absolute: true };

const size = statSync(source).size;
const handle = openSync(source, "r");
const maxRssGB = Number(process.env.HEMY_MAX_RSS_GB ?? 0);
if (maxRssGB > 0) {
  setInterval(() => {
    const rssGB = process.memoryUsage().rss / 2 ** 30;
    const freeGB = freemem() / 2 ** 30;
    if (rssGB > maxRssGB || freeGB < 0.15) {
      console.error(`Avbrutt for å beskytte maskinen: prosess-RAM ${rssGB.toFixed(2)} GB, ledig RAM ${freeGB.toFixed(2)} GB`);
      process.exit(70);
    }
  }, 1000).unref();
}
let lastProgress = -1;
let lastLog = 0;
const log = (stage, progress) => {
  const now = Date.now();
  const percent = Math.round(progress * 100);
  if (percent === lastProgress && now - lastLog < 10000) return;
  if (percent < lastProgress + 2 && now - lastLog < 10000) return;
  lastProgress = percent;
  lastLog = now;
  const memory = process.memoryUsage();
  console.log(`${stage}: ${percent}% · prosess-RAM ${(memory.rss / 2 ** 30).toFixed(2)} GB`);
};

try {
  console.log(`Konverterer ${(size / 2 ** 20).toFixed(0)} MiB IFC til Fragments`);
  const bytes = await importer.process({
    readFromCallback: true,
    readCallback: (offset, count) => {
      const chunk = new Uint8Array(count);
      const bytesRead = readSync(handle, chunk, 0, count, offset);
      log("Leser IFC", Math.min(1, offset / size));
      return chunk.subarray(0, bytesRead);
    },
    raw: false,
    progressCallback: (progress) => log("Bygger Fragments", progress),
  });
  writeFileSync(output, bytes);
  console.log(`Lagret ${output} (${(bytes.byteLength / 2 ** 20).toFixed(1)} MiB)`);
} finally {
  closeSync(handle);
}
