import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const indexPath = resolve(process.argv[2] ?? "data/hg62-zone-index.csv");
const outputPath = resolve(process.argv[3] ?? "data/hg62-model-checks.json");
const registerUrl = process.argv[4] ?? "http://127.0.0.1:8765/data.json";

const [header, ...lines] = readFileSync(indexPath, "utf8").trimEnd().split("\n");
const fields = header.split(",");
const parseCsvLine = (line) => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map((match) => match[1].replaceAll('""', '"'));
const zones = lines.map((line) => Object.fromEntries(fields.map((field, index) => [field, parseCsvLine(line)[index]])));

const response = await fetch(registerUrl);
if (!response.ok) throw new Error(`Lokasjonsregisteret svarte ${response.status}`);
const register = await response.json();
const column = (name) => {
  const index = register.headers.indexOf(name);
  if (index < 0) throw new Error(`Fant ikke kolonnen «${name}» i lokasjonsregisteret`);
  return index;
};

const idColumn = column("BIM-lokasjons-ID");
const assetColumn = column("Hemy Asset GUID");
const levelColumn = column("Modellens vertsnivå");
const zonesByGuid = new Map(zones.map((zone) => [zone.ifc_guid, zone]));
const rowsByGuid = new Map(register.rows.map((row) => [row.key, row]));
const findings = [];

for (const row of register.rows) {
  const zone = zonesByGuid.get(row.key);
  if (!zone) {
    findings.push({ rule: "NO_3D_ZONE", registerId: row.values[idColumn], registerKey: row.key });
    continue;
  }
  const code = /\((HG62\.[^)]+)\)/.exec(zone.functional_location)?.[1] ?? "";
  if (code !== row.values[idColumn]) {
    findings.push({ rule: "LOCATION_ID_MISMATCH", ifcGuid: zone.ifc_guid, modelValue: code, registerValue: row.values[idColumn] });
  }
  if ((zone.asset_guid ?? "") !== (row.values[assetColumn] ?? "")) {
    findings.push({ rule: "ASSET_GUID_MISMATCH", ifcGuid: zone.ifc_guid, modelValue: zone.asset_guid, registerValue: row.values[assetColumn] });
  }
  if ((zone.level ?? "") !== (row.values[levelColumn] ?? "")) {
    findings.push({ rule: "LEVEL_MISMATCH", ifcGuid: zone.ifc_guid, modelValue: zone.level, registerValue: row.values[levelColumn] });
  }
}

for (const zone of zones) {
  if (!rowsByGuid.has(zone.ifc_guid)) {
    findings.push({ rule: "NO_REGISTER_ROW", ifcGuid: zone.ifc_guid, functionalLocation: zone.functional_location });
  }
  if (!zone.asset_guid) {
    findings.push({ rule: "MISSING_ASSET_GUID", ifcGuid: zone.ifc_guid, functionalLocation: zone.functional_location });
  }
  if (zone.property_ifc_guid && zone.property_ifc_guid !== zone.ifc_guid) {
    findings.push({ rule: "IFC_GUID_PROPERTY_MISMATCH", ifcGuid: zone.ifc_guid, propertyValue: zone.property_ifc_guid });
  }
}

const countsByRule = Object.fromEntries([...new Set(findings.map((finding) => finding.rule))].sort().map((rule) => [rule, findings.filter((finding) => finding.rule === rule).length]));
const result = {
  source: { ifcIndex: indexPath, register: registerUrl },
  summary: {
    modelZones: zones.length,
    registerRows: register.rows.length,
    matchedByExactIfcGuid: zones.filter((zone) => rowsByGuid.has(zone.ifc_guid)).length,
    findingsByRule: countsByRule,
  },
  findings,
};
writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n", "utf8");
console.log(JSON.stringify(result.summary, null, 2));
console.log(`Rapport: ${outputPath}`);
