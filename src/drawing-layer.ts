import * as THREE from "three";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Point = { x: number; y: number };
type Slot = "source1" | "world1" | "source2" | "world2";

export function setupDrawingLayer(options: {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  scanHit: (x: number, y: number) => Point | null;
  defaultHeight: () => number;
}) {
  const fileInput = document.querySelector<HTMLInputElement>("#drawing-file")!;
  const pageSelect = document.querySelector<HTMLSelectElement>("#drawing-page")!;
  const levelSelect = document.querySelector<HTMLSelectElement>("#drawing-level")!;
  const heightInput = document.querySelector<HTMLInputElement>("#drawing-height")!;
  const opacityInput = document.querySelector<HTMLInputElement>("#drawing-opacity")!;
  const opacityValue = document.querySelector<HTMLOutputElement>("#drawing-opacity-value")!;
  const visibleInput = document.querySelector<HTMLInputElement>("#drawing-visible")!;
  const preview = document.querySelector<HTMLCanvasElement>("#drawing-preview")!;
  const previewPoints = document.querySelector<HTMLElement>("#drawing-preview-points")!;
  const status = document.querySelector<HTMLElement>("#drawing-status")!;
  const buttons: Record<Slot, HTMLButtonElement> = {
    source1: document.querySelector("#drawing-source-1")!,
    world1: document.querySelector("#drawing-world-1")!,
    source2: document.querySelector("#drawing-source-2")!,
    world2: document.querySelector("#drawing-world-2")!,
  };
  const source: Array<Point | null> = [null, null];
  const world: Array<Point | null> = [null, null];
  let active: Slot | null = null;
  let drawingCanvas: HTMLCanvasElement | null = null;
  let pdf: pdfjs.PDFDocumentProxy | null = null;
  let pdfTask: ReturnType<typeof pdfjs.getDocument> | null = null;
  let mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  let texture: THREE.CanvasTexture | null = null;
  let loadSequence = 0;

  function setStatus(message: string) { status.textContent = message; }
  function elevation() {
    if (levelSelect.value === "lower") return options.defaultHeight();
    if (levelSelect.value === "upper") return options.defaultHeight() + 3.5;
    const value = Number(heightInput.value);
    return Number.isFinite(value) ? value : options.defaultHeight();
  }
  function updateHeight() {
    if (levelSelect.value !== "custom") heightInput.value = elevation().toFixed(1);
    if (mesh) mesh.position.z = elevation();
  }
  function updateButtons() {
    for (const [slot, button] of Object.entries(buttons) as [Slot, HTMLButtonElement][]) {
      button.dataset.active = String(active === slot);
      const index = slot.endsWith("1") ? 0 : 1;
      button.dataset.picked = String(slot.startsWith("source") ? !!source[index] : !!world[index]);
    }
  }
  function updatePreview() {
    previewPoints.replaceChildren();
    if (!drawingCanvas) return;
    const width = Math.min(260, drawingCanvas.width);
    const height = Math.round(width * drawingCanvas.height / drawingCanvas.width);
    preview.width = width;
    preview.height = height;
    preview.getContext("2d")!.drawImage(drawingCanvas, 0, 0, width, height);
    source.forEach((point, index) => {
      if (!point) return;
      const marker = document.createElement("span");
      marker.className = "drawing-preview-point";
      marker.textContent = String(index + 1);
      marker.style.left = `${point.x / drawingCanvas!.width * 100}%`;
      marker.style.top = `${point.y / drawingCanvas!.height * 100}%`;
      previewPoints.append(marker);
    });
  }
  function updateLayer() {
    if (!drawingCanvas || source.some((point) => !point) || world.some((point) => !point)) {
      if (mesh) mesh.visible = false;
      return;
    }
    const [a, b] = source as Point[];
    const [c, d] = world as Point[];
    const sourceLength = Math.hypot(b.x - a.x, b.y - a.y);
    const worldLength = Math.hypot(d.x - c.x, d.y - c.y);
    if (sourceLength < 10 || worldLength < 0.25) {
      if (mesh) mesh.visible = false;
      setStatus("Punktene er for nær hverandre. Velg to tydelige hjørner med god avstand.");
      return;
    }
    const scale = worldLength / sourceLength;
    const angle = Math.atan2(d.y - c.y, d.x - c.x) - Math.atan2(a.y - b.y, b.x - a.x);
    if (!mesh) {
      texture = new THREE.CanvasTexture(drawingCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(drawingCanvas.width, drawingCanvas.height),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: Number(opacityInput.value), side: THREE.DoubleSide, depthWrite: false }),
      );
      mesh.renderOrder = 8;
      options.scene.add(mesh);
    }
    const localX = a.x - drawingCanvas.width / 2;
    const localY = drawingCanvas.height / 2 - a.y;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    mesh.position.set(c.x - scale * (cos * localX - sin * localY), c.y - scale * (sin * localX + cos * localY), elevation());
    mesh.rotation.z = angle;
    mesh.scale.set(scale, scale, 1);
    mesh.visible = visibleInput.checked;
    setStatus(`Tegningen er lagt inn i høyde ${elevation().toFixed(1)} m. To punktpar gir en foreløpig innretting.`);
  }
  function clearAlignment() {
    source.fill(null);
    world.fill(null);
    active = null;
    if (mesh) mesh.visible = false;
    updateButtons();
    updatePreview();
    setStatus("Velg to punktpar på tegningen og i 3D-visningen.");
  }
  function replaceDrawing(canvas: HTMLCanvasElement) {
    if (mesh) {
      options.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      texture?.dispose();
      mesh = null;
      texture = null;
    }
    drawingCanvas = canvas;
    clearAlignment();
    updateHeight();
  }
  async function renderPdfPage(pageNumber: number, sequence: number) {
    if (!pdf) return;
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2, 2048 / Math.max(base.width, base.height)) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
    if (sequence === loadSequence) replaceDrawing(canvas);
  }
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const sequence = ++loadSequence;
    setStatus(`Åpner ${file.name} …`);
    try {
      const previousPdfTask = pdfTask;
      pdf = null;
      pdfTask = null;
      if (previousPdfTask) void previousPdfTask.destroy();
      if (file.name.toLowerCase().endsWith(".pdf")) {
        pdfTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
        pdf = await pdfTask.promise;
        if (sequence !== loadSequence) return;
        pageSelect.replaceChildren(...Array.from({ length: pdf.numPages }, (_, index) => new Option(String(index + 1), String(index + 1))));
        pageSelect.disabled = pdf.numPages < 2;
        await renderPdfPage(1, sequence);
      } else if (file.type === "image/png" || file.type === "image/jpeg") {
        const bitmap = await createImageBitmap(file);
        if (sequence !== loadSequence) { bitmap.close(); return; }
        const factor = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * factor);
        canvas.height = Math.round(bitmap.height * factor);
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        pageSelect.replaceChildren(new Option("1", "1"));
        pageSelect.disabled = true;
        replaceDrawing(canvas);
      } else {
        throw new Error("Bruk PDF, PNG eller JPG. DWG/DXF må først eksporteres til PDF.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  });
  pageSelect.addEventListener("change", () => { if (pdf) void renderPdfPage(Number(pageSelect.value), ++loadSequence); });
  preview.addEventListener("pointerup", (event) => {
    if (!drawingCanvas || (active !== "source1" && active !== "source2")) return;
    const rect = preview.getBoundingClientRect();
    const point = { x: (event.clientX - rect.left) / rect.width * drawingCanvas.width,
      y: (event.clientY - rect.top) / rect.height * drawingCanvas.height };
    source[active === "source1" ? 0 : 1] = point;
    active = null;
    updateButtons();
    updatePreview();
    updateLayer();
    if (!mesh?.visible) setStatus("Tegningspunkt valgt. Velg tilsvarende punkt i 3D-visningen.");
  });
  for (const [slot, button] of Object.entries(buttons) as [Slot, HTMLButtonElement][]) {
    button.addEventListener("click", () => {
      if (!drawingCanvas) { setStatus("Velg en PDF eller et bilde først."); return; }
      active = active === slot ? null : slot;
      updateButtons();
      if (active) setStatus(active.startsWith("source") ? "Klikk på punktet i tegningen under." : "Klikk på tilsvarende punkt i 3D-visningen.");
    });
  }
  options.canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || (active !== "world1" && active !== "world2")) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    const rect = options.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let point = options.scanHit(x, y);
    if (!point) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(x / rect.width * 2 - 1, 1 - y / rect.height * 2), options.camera);
      const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -elevation()), new THREE.Vector3());
      if (hit) point = { x: hit.x, y: hit.y };
    }
    if (!point) { setStatus("Ingen treff her. Se ned mot etasjen og prøv igjen."); return; }
    world[active === "world1" ? 0 : 1] = point;
    active = null;
    updateButtons();
    updateLayer();
    if (!mesh?.visible) setStatus("3D-punkt valgt. Fortsett med neste punktpar.");
  }, { capture: true });
  levelSelect.addEventListener("change", () => {
    heightInput.disabled = levelSelect.value !== "custom";
    updateHeight();
  });
  heightInput.disabled = true;
  heightInput.value = String(options.defaultHeight());
  heightInput.addEventListener("input", updateHeight);
  opacityInput.addEventListener("input", () => {
    opacityValue.textContent = `${Math.round(Number(opacityInput.value) * 100)} %`;
    if (mesh) mesh.material.opacity = Number(opacityInput.value);
  });
  visibleInput.addEventListener("change", () => { if (mesh) mesh.visible = visibleInput.checked; });
  document.querySelector<HTMLButtonElement>("#drawing-reset")!.addEventListener("click", clearAlignment);
  updateButtons();
}
