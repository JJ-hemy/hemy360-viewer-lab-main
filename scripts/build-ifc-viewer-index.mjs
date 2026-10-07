/** Build a small, local-only viewer index from an IFC STEP export.
 * Usage: node scripts/build-ifc-viewer-index.mjs input.ifc public/models/model.index.json
 * The output is project data: keep it beside the ignored .frag, outside Git.
 */
import fs from "node:fs";
import path from "node:path";

const [source, destination] = process.argv.slice(2);
if (!source || !destination) {
  console.error("Usage: node scripts/build-ifc-viewer-index.mjs input.ifc output.index.json");
  process.exit(1);
}

const text = fs.readFileSync(source, "utf8");
const entities = new Map();
const reverse = new Map();
const linePattern = /^#(\d+)=([A-Z0-9_]+)\((.*)\);\s*$/gm;
for (const match of text.matchAll(linePattern)) {
  const id = Number(match[1]);
  const type = match[2];
  const body = match[3];
  const refs = [...body.matchAll(/#(\d+)/g)].map((item) => Number(item[1]));
  entities.set(id, { type, body, refs });
  for (const ref of refs) {
    const users = reverse.get(ref) ?? [];
    users.push(id);
    reverse.set(ref, users);
  }
}

const layers = new Map();
const isProduct = (id) => {
  const entity = entities.get(id);
  return entity && entity.type.startsWith("IFC") && !entity.type.startsWith("IFCREL") &&
    /^'[^']+'/.test(entity.body) && !entity.type.includes("SHAPE") &&
    !entity.type.includes("REPRESENTATION") && !entity.type.includes("PROPERTY");
};
for (const [assignmentId, entity] of entities) {
  if (entity.type !== "IFCPRESENTATIONLAYERASSIGNMENT" &&
      entity.type !== "IFCPRESENTATIONLAYERWITHSTYLE") continue;
  const name = entity.body.match(/^'((?:''|[^'])*)'/)?.[1]?.replaceAll("''", "'");
  if (!name) continue;
  for (const item of entity.refs) {
    const queue = [[item, 0]];
    const seen = new Set([assignmentId]);
    while (queue.length) {
      const [current, depth] = queue.shift();
      if (seen.has(current) || depth > 5) continue;
      seen.add(current);
      const currentEntity = entities.get(current);
      if (!currentEntity) continue;
      if (currentEntity.type === "IFCPRODUCTDEFINITIONSHAPE") {
        for (const product of reverse.get(current) ?? []) {
          if (!isProduct(product)) continue;
          const names = layers.get(product) ?? new Set();
          names.add(name);
          layers.set(product, names);
        }
        continue;
      }
      for (const user of reverse.get(current) ?? []) {
        if (user !== assignmentId) queue.push([user, depth + 1]);
      }
    }
  }
}

const systems = new Map();
for (const [id, entity] of entities) {
  if (entity.type !== "IFCRELASSIGNSTOGROUP") continue;
  const group = entities.get(entity.refs.at(-1));
  if (!group || !/IFC(?:DISTRIBUTION)?SYSTEM$/.test(group.type)) continue;
  const name = group.body.match(/^(?:'[^']*',){2}'((?:''|[^'])*)'/)?.[1]?.replaceAll("''", "'");
  if (!name) continue;
  for (const member of entity.refs.slice(0, -1)) {
    if (!isProduct(member)) continue;
    const names = systems.get(member) ?? new Set();
    names.add(name);
    systems.set(member, names);
  }
}

const output = {
  schema: 1,
  source: path.basename(source),
  layers: Object.fromEntries([...layers].map(([id, names]) => [id, [...names]])),
  systems: Object.fromEntries([...systems].map(([id, names]) => [id, [...names]])),
};
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, JSON.stringify(output));
console.log(`Indexed ${layers.size} products with IFC layers and ${systems.size} products with systems.`);
