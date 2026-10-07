import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createInterface } from "node:readline";

const input = process.argv[2];
const output = resolve(process.argv[3] ?? "data/hg62-zone-index.csv");

if (!input) {
  console.error("Bruk: node scripts/extract-zone-index.mjs <modell.ifc> [utdata.csv]");
  process.exit(1);
}

async function scan(callback) {
  const lines = createInterface({
    input: createReadStream(input, { encoding: "utf8", highWaterMark: 1024 * 1024 }),
    crlfDelay: Infinity,
  });
  for await (const line of lines) callback(line);
}

const zones = new Map();
const propertySetsByZone = new Map();

await scan((line) => {
  const zone = line.match(/^#(\d+)=IFCBUILDINGELEMENTPROXY\('([^']+)',#[^,]+,'((?:''|[^'])*)'/);
  if (zone && zone[3].includes("3DZone")) {
    zones.set(zone[1], {
      stepId: zone[1],
      guid: zone[2],
      name: zone[3].replaceAll("''", "'"),
    });
    return;
  }

  if (!line.includes("IFCRELDEFINESBYPROPERTIES")) return;
  const relation = line.match(/,\(([#,\d]+)\),#(\d+)\);$/);
  if (!relation) return;
  for (const objectRef of relation[1].match(/#\d+/g) ?? []) {
    const zoneId = objectRef.slice(1);
    if (!zones.has(zoneId)) continue;
    const sets = propertySetsByZone.get(zoneId) ?? [];
    sets.push(relation[2]);
    propertySetsByZone.set(zoneId, sets);
  }
});

const neededSets = new Set([...propertySetsByZone.values()].flat());
const propertyIdsBySet = new Map();
await scan((line) => {
  if (!line.includes("=IFCPROPERTYSET(")) return;
  const propertySet = line.match(/^#(\d+)=IFCPROPERTYSET\([^;]*,\(([#,\d]+)\)\);$/);
  if (propertySet && neededSets.has(propertySet[1])) {
    propertyIdsBySet.set(propertySet[1], (propertySet[2].match(/#\d+/g) ?? []).map((ref) => ref.slice(1)));
  }
});

const neededProperties = new Set([...propertyIdsBySet.values()].flat());
const properties = new Map();
await scan((line) => {
  if (!line.includes("=IFCPROPERTYSINGLEVALUE(")) return;
  const property = line.match(/^#(\d+)=IFCPROPERTYSINGLEVALUE\('((?:''|[^'])*)',[^,]*,IFC\w+\('((?:''|[^'])*)'\)/);
  if (property && neededProperties.has(property[1])) {
    properties.set(property[1], [property[2].replaceAll("''", "'"), property[3].replaceAll("''", "'")]);
  }
});

const fields = ["step_id", "ifc_guid", "name", "level", "functional_location", "asset_guid", "property_ifc_guid"];
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const rows = [...zones.values()].map((zone) => {
  const values = {};
  for (const setId of propertySetsByZone.get(zone.stepId) ?? []) {
    for (const propertyId of propertyIdsBySet.get(setId) ?? []) {
      const property = properties.get(propertyId);
      if (property) values[property[0]] = property[1];
    }
  }
  return {
    step_id: zone.stepId,
    ifc_guid: zone.guid,
    name: zone.name,
    level: values.Level,
    functional_location: values["Functional Location"],
    asset_guid: values["Asset ID (GUID)"],
    property_ifc_guid: values.IfcGUID,
  };
});

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, [fields.join(","), ...rows.map((row) => fields.map((field) => csvCell(row[field])).join(","))].join("\n") + "\n", "utf8");

const count = (field) => rows.filter((row) => !row[field]).length;
const distinctGuids = new Set(rows.map((row) => row.ifc_guid));
console.log(JSON.stringify({
  file: output,
  zones: rows.length,
  missingLevel: count("level"),
  missingFunctionalLocation: count("functional_location"),
  missingAssetGuid: count("asset_guid"),
  guidMismatch: rows.filter((row) => row.property_ifc_guid && row.property_ifc_guid !== row.ifc_guid).length,
  duplicateIfcGuid: rows.length - distinctGuids.size,
}, null, 2));
