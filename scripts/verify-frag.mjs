import { readFileSync } from "node:fs";
import { SingleThreadedFragmentsModel } from "@thatopen/fragments";

const fragPath = process.argv[2] ?? "models/HG62-SEMY-ARST-ASBUILT_IFC4.frag";
const csvPath = process.argv[3] ?? "data/hg62-zone-index.csv";
const guids = readFileSync(csvPath, "utf8")
  .trimEnd()
  .split("\n")
  .slice(1)
  .map((line) => /^"\d+","([^"]+)"/.exec(line)?.[1])
  .filter(Boolean);

const model = new SingleThreadedFragmentsModel("HG62", readFileSync(fragPath));
try {
  const localIds = model.getLocalIdsByGuids(guids);
  const missing = guids.filter((_, index) => localIds[index] == null);
  console.log(JSON.stringify({
    checkedZoneGuids: guids.length,
    foundInFragments: guids.length - missing.length,
    missingGuids: missing,
    itemsWithGeometry: model.getItemsIdsWithGeometry().length,
  }, null, 2));
  if (missing.length) process.exitCode = 1;
} finally {
  model.dispose();
}
