/* eslint-disable import/no-extraneous-dependencies */
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type PreviewServer, type ViteDevServer } from "vite";
import { bs17Catalog } from "./src/bs17-catalog";

const localEnv = loadEnv("development", process.cwd(), "HEMY_");
const bs17ScanRoot = process.env.HEMY_LCC2_ROOT ?? localEnv.HEMY_LCC2_ROOT;
const bs17DefaultRoot = process.env.HEMY_BS17_DEFAULT_LCC2_ROOT ?? localEnv.HEMY_BS17_DEFAULT_LCC2_ROOT;
const bs17LoftetRoot = process.env.HEMY_BS17_LOFTET_LCC2_ROOT ?? localEnv.HEMY_BS17_LOFTET_LCC2_ROOT;
const bs17HendrixRoot = process.env.HEMY_BS17_HENDRIX_LCC2_ROOT ?? localEnv.HEMY_BS17_HENDRIX_LCC2_ROOT;
const bs17OutdoorRoot = process.env.HEMY_BS17_183256_LCC2_ROOT ?? localEnv.HEMY_BS17_183256_LCC2_ROOT;
const bs17CatalogRoot = process.env.HEMY_BS17_CATALOG_ROOT ?? localEnv.HEMY_BS17_CATALOG_ROOT;
const bs17DefaultPhotoRoot = process.env.HEMY_BS17_DEFAULT_PHOTO_ROOT ?? localEnv.HEMY_BS17_DEFAULT_PHOTO_ROOT;
const bs17LoftetPhotoRoot = process.env.HEMY_BS17_LOFTET_PHOTO_ROOT ?? localEnv.HEMY_BS17_LOFTET_PHOTO_ROOT;
const bs17HendrixPhotoRoot = process.env.HEMY_BS17_HENDRIX_PHOTO_ROOT ?? localEnv.HEMY_BS17_HENDRIX_PHOTO_ROOT;
const bs17FagmoeblerPhotoRoot = process.env.HEMY_BS17_112646_PHOTO_ROOT ?? localEnv.HEMY_BS17_112646_PHOTO_ROOT;
const bs17OutdoorPhotoRoot = process.env.HEMY_BS17_183256_PHOTO_ROOT ?? localEnv.HEMY_BS17_183256_PHOTO_ROOT;

function serveLocalBs17Scan(server: ViteDevServer | PreviewServer) {
  if (bs17CatalogRoot) {
    const catalogPaths = new Map<string, Promise<{ root: string; manifest: string }>>();
    const findCatalogPath = (id: string) => {
      const cached = catalogPaths.get(id);
      if (cached) return cached;
      const entry = bs17Catalog.find((candidate) => candidate.id === id);
      if (!entry) throw new Error("Unknown BS17 catalog entry");
      const located = (async () => {
        const folders = (await fs.readdir(bs17CatalogRoot, { withFileTypes: true }))
          .filter((item) => item.isDirectory() && item.name.startsWith(entry.folderPrefix) && !item.name.endsWith(" (1)"));
        if (folders.length !== 1) throw new Error("Expected one matching export folder");
        let folder = path.join(bs17CatalogRoot, folders[0].name);
        for (let depth = 0; depth < 10; depth += 1) {
          const contents = await fs.readdir(folder, { withFileTypes: true });
          const manifests = contents.filter((item) => item.isFile() && item.name.toLowerCase().endsWith(".lcc2"));
          if (manifests.length === 1) return { root: folder, manifest: manifests[0].name };
          const children = contents.filter((item) => item.isDirectory());
          if (manifests.length || children.length !== 1) break;
          folder = path.join(folder, children[0].name);
        }
        throw new Error("LCC2 manifest was not found in the export folder");
      })();
      catalogPaths.set(id, located);
      return located;
    };
    server.middlewares.use("/local-scan/bs17-catalog", async (request, response) => {
      if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405).end(); return; }
      let pathname: string;
      try { pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname); }
      catch { response.writeHead(400).end(); return; }
      const [, id, ...segments] = pathname.split("/");
      if (!id || !bs17Catalog.some((entry) => entry.id === id) || segments.length === 0) {
        response.writeHead(404).end(); return;
      }
      try {
        const { root, manifest } = await findCatalogPath(id);
        const relativePath = segments.join("/");
        const filePath = relativePath === "manifest.lcc2" ? path.join(root, manifest) : path.resolve(root, relativePath);
        const relative = path.relative(root, filePath);
        if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) { response.writeHead(403).end(); return; }
        const info = await fs.stat(filePath);
        if (!info.isFile()) throw new Error("Not a file");
        response.writeHead(200, {
          "Content-Type": filePath.endsWith(".lcc2") || filePath.endsWith(".json") ? "application/json" : "application/octet-stream",
          "Content-Length": info.size,
          "Cache-Control": "no-store",
        });
        if (request.method === "HEAD") response.end();
        else createReadStream(filePath).pipe(response);
      } catch { response.writeHead(404).end(); }
    });
  }
  for (const [route, root] of [
    ["/local-scan/bs17", bs17ScanRoot],
    ["/local-scan/bs17-default", bs17DefaultRoot],
    ["/local-scan/bs17-loftet", bs17LoftetRoot],
    ["/local-scan/bs17-hendrix", bs17HendrixRoot],
    ["/local-scan/bs17-outdoor", bs17OutdoorRoot],
    ["/local-scan/bs17-102311-photo", bs17DefaultPhotoRoot],
    ["/local-scan/bs17-152950-photo", bs17LoftetPhotoRoot],
    ["/local-scan/bs17-152958-photo", bs17HendrixPhotoRoot],
    ["/local-scan/bs17-112646-photo", bs17FagmoeblerPhotoRoot],
    ["/local-scan/bs17-183256-photo", bs17OutdoorPhotoRoot],
  ]) {
    if (!root) continue;
  server.middlewares.use(route, async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end();
      return;
    }

    let relativePath: string;
    try {
      relativePath = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }

    let filePath = path.resolve(root, `.${relativePath}`);
    if (relativePath === "/manifest.lcc2") {
      try {
        const captureId = route === "/local-scan/bs17-default" ? "102311" :
          route === "/local-scan/bs17-loftet" ? "152950" :
          route === "/local-scan/bs17-hendrix" ? "152958" :
          route === "/local-scan/bs17-outdoor" ? "183256" : null;
        if (!captureId) { response.writeHead(404).end(); return; }
        const names = (await fs.readdir(root)).filter((name) =>
          name.toLowerCase().endsWith(`${captureId}.lcc2`) && /(?:^|[-_])\d{6}\.lcc2$/i.test(name));
        if (names.length !== 1) { response.writeHead(404).end(); return; }
        filePath = path.join(root, names[0]);
      } catch { response.writeHead(404).end(); return; }
    }
    const fromRoot = path.relative(root, filePath);
    if (!fromRoot || fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) {
      response.writeHead(403).end();
      return;
    }
    if (route.endsWith("-photo") && !/\.(?:jpg|jpeg|png)$/i.test(filePath)) {
      response.writeHead(403).end();
      return;
    }

    try {
      const info = await fs.stat(filePath);
      if (!info.isFile()) throw new Error("Not a file");
      const contentType = filePath.endsWith(".json") ? "application/json" :
        filePath.endsWith(".jpg") ? "image/jpeg" : "application/octet-stream";
      response.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": info.size,
        "Cache-Control": "no-store",
      });
      if (request.method === "HEAD") {
        response.end();
      } else {
        createReadStream(filePath).pipe(response);
      }
    } catch {
      response.writeHead(404).end();
    }
  });
  }
}

export default defineConfig(({ command }) => ({
  base: "./",
  publicDir: command === "build" && process.env.HEMY_INCLUDE_LOCAL_DATA !== "1" ? false : "public",
  optimizeDeps: {
    noDiscovery: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        bim: fileURLToPath(new URL("./bim-lab.html", import.meta.url)),
        lcc2: fileURLToPath(new URL("./lcc2.html", import.meta.url)),
        sol: fileURLToPath(new URL("./sol-viewer.html", import.meta.url)),
      },
    },
  },
  plugins: [{
    name: "local-bs17-scan",
    configureServer: serveLocalBs17Scan,
    configurePreviewServer: serveLocalBs17Scan,
  }, {
    name: "copy-jobwalk-assets",
    apply: "build",
    async closeBundle() {
      const source = path.resolve("public/jobwalk");
      try {
        await fs.access(source);
      } catch {
        return;
      }
      await fs.cp(source, path.resolve("dist/jobwalk"), { recursive: true });
    },
  }, {
    name: "copy-web-ifc-wasm",
    apply: "build",
    async closeBundle() {
      if (process.env.HEMY_INCLUDE_LOCAL_DATA === "1") return;
      const target = path.resolve("dist/wasm");
      await fs.mkdir(target, { recursive: true });
      for (const name of ["web-ifc.wasm", "web-ifc-mt.wasm", "LICENSE-web-ifc.md"]) {
        await fs.copyFile(path.resolve("public/wasm", name), path.join(target, name));
      }
    },
  }],
  esbuild: {
    supported: {
      "top-level-await": true,
    },
  },
}));
