import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { SingleThreadedFragmentsModel } from "@thatopen/fragments";

const source = process.argv[2] ?? "models/HG62-SEMY-ARST-ASBUILT_IFC4.frag";
const index = process.argv[3] ?? "data/hg62-zone-index.csv";
const output = process.argv[4] ?? "public/models/HG62-3DZones.frag";

const guids = readFileSync(index, "utf8")
  .trimEnd()
  .split("\n")
  .slice(1)
  .map((line) => /^"\d+","([^"]+)"/.exec(line)?.[1])
  .filter(Boolean);

const model = new SingleThreadedFragmentsModel("HG62", readFileSync(source));
try {
  const ids = model.getLocalIdsByGuids(guids);
  const missing = guids.filter((_, index) => ids[index] == null);
  if (missing.length) throw new Error(`${missing.length} soner mangler i Fragments-filen`);
  const subset = model.getSubsetBuffer(ids.filter((id) => id != null), false);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, subset);
  const check = new SingleThreadedFragmentsModel("HG62-3DZones", subset);
  try {
    const found = check.getLocalIdsByGuids(guids).filter((id) => id != null).length;
    const result = {
      output,
      zones: guids.length,
      foundInSubset: found,
      geometryItems: check.getItemsIdsWithGeometry().length,
      sizeMiB: Number((subset.byteLength / 2 ** 20).toFixed(1)),
    };
    console.log(JSON.stringify(result, null, 2));
    if (found !== guids.length) process.exitCode = 1;
  } finally {
    check.dispose();
  }
} finally {
  model.dispose();
}
