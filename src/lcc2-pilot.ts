import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { FragmentsModels, type FragmentsModel, type SpatialTreeItem } from "@thatopen/fragments";
import fragmentsWorkerUrl from "@thatopen/fragments/worker?url";
import { LCCRender, type LccObject } from "../vendor/xgrids-web-sdk/lcc-sdk-three.js";
import "./lcc2-pilot.css";
import "./lcc2-hemy-theme.css";
import { initI18n } from "./i18n";
import { initViewerTheme } from "./viewer-theme";
import { initViewerSidebar } from "./viewer-shell";
import { setupDrawingLayer } from "./drawing-layer";
import { bs17Catalog, type Bs17CatalogId } from "./bs17-catalog";

initI18n();

type Bounds = { min: [number, number, number]; max: [number, number, number] };
type Manifest = { epsg?: number; offset?: [number, number, number]; root: { boundingBox: Bounds } };
type PointKind = "GCP" | "POI" | "HDE" | "POV";
type ScanPoint = { label: string; kind: PointKind; position: [number, number, number]; orientation: [number, number, number, number]; gnss: { status: number | null }; sourceCaptureId?: string };
type PointData = { captureId: string; points: ScanPoint[]; referencePois: { label: string; position: [number, number, number] }[] };
type PointPhoto = { camera: number; path: string };
type PointPhotoData = { captureId: string; photos: Record<string, PointPhoto[]> };
type ScanAlignment = { crs: string; referenceCaptureId: string; adjacentCaptureId: string; commonPoiCount: number; maxPoiResidualM: number; rawToExportTranslationM: number[]; adjacentOffsetMinusLoftOffsetM: number[]; gcpCandidates: { adjacentLabel: string; adjacentGnssStatus: number | null; loftLabel: string; loftGnssStatus: number | null; distance3dM: number }[] };
type PointPreview = { captureId: string; points: number; recordBytes: number; nearestGcpMeters: Record<string, number> };
type Poi = { name?: string; customLabel?: string; position: [number, number, number] };
type ExtraScanId = "112646" | "183256";
type NoiseMaskId = "152950" | "152958" | "183256" | "180322" | Bs17CatalogId;
type NoiseMask = { vertices: [number, number][]; heights?: number[]; margin: number; enabled: boolean };
const MAX_NOISE_MASK_VERTICES = 24;

const host = document.querySelector<HTMLElement>("#canvas-host")!;
const status = document.querySelector<HTMLElement>("#status")!;
const loadTime = document.querySelector<HTMLElement>("#load-time")!;
const fps = document.querySelector<HTMLElement>("#fps")!;
const detail = document.querySelector<HTMLSelectElement>("#detail")!;
const bimPanel = document.querySelector<HTMLElement>("#bim-panel")!;
const showBim = document.querySelector<HTMLInputElement>("#show-bim")!;
const showBimSpaces = document.querySelector<HTMLInputElement>("#show-bim-spaces")!;
const bimSpacesCount = document.querySelector<HTMLElement>("#bim-spaces-count")!;
const showBimShells = document.querySelector<HTMLInputElement>("#show-bim-shells")!;
const bimShellsCount = document.querySelector<HTMLElement>("#bim-shells-count")!;
const showBimWalls = document.querySelector<HTMLInputElement>("#show-bim-walls")!;
const bimWallsCount = document.querySelector<HTMLElement>("#bim-walls-count")!;
const showBimOpenings = document.querySelector<HTMLInputElement>("#show-bim-openings")!;
const bimOpeningsCount = document.querySelector<HTMLElement>("#bim-openings-count")!;
const showBimOthers = document.querySelector<HTMLInputElement>("#show-bim-others")!;
const bimOthersCount = document.querySelector<HTMLElement>("#bim-others-count")!;
const bimLayerStatus = document.querySelector<HTMLElement>("#bim-layer-status")!;
const bimOpacityField = document.querySelector<HTMLElement>("#bim-opacity-field")!;
const bimOpacity = document.querySelector<HTMLInputElement>("#bim-opacity")!;
const bimOpacityValue = document.querySelector<HTMLOutputElement>("#bim-opacity-value")!;
const bimLight = document.querySelector<HTMLInputElement>("#bim-light")!;
const bimLightValue = document.querySelector<HTMLOutputElement>("#bim-light-value")!;
const bimStatus = document.querySelector<HTMLElement>("#bim-status")!;
const bimExplorer = document.querySelector<HTMLElement>("#bim-explorer")!;
const bimTree = document.querySelector<HTMLElement>("#bim-tree")!;
const bimObject = document.querySelector<HTMLElement>("#bim-object")!;
const bimFilterForm = document.querySelector<HTMLFormElement>("#bim-filter")!;
const bimFilterField = document.querySelector<HTMLSelectElement>("#bim-filter-field")!;
const bimFilterName = document.querySelector<HTMLInputElement>("#bim-filter-name")!;
const bimFilterNameLabel = document.querySelector<HTMLElement>("#bim-filter-name-label")!;
const bimFilterValue = document.querySelector<HTMLInputElement>("#bim-filter-value")!;
const bimFilterSuggestions = document.querySelector<HTMLDataListElement>("#bim-filter-suggestions")!;
const bimFilterStatus = document.querySelector<HTMLElement>("#bim-filter-status")!;
const bimFilterResults = document.querySelector<HTMLElement>("#bim-filter-results")!;
const sectionPanel = document.querySelector<HTMLElement>("#section-panel")!;
const sectionAxes = document.querySelector<HTMLElement>("#section-axes")!;
const sectionReset = document.querySelector<HTMLButtonElement>("#section-reset")!;
const heightView = document.querySelector<HTMLFieldSetElement>("#height-view")!;
const heightViewStatus = document.querySelector<HTMLElement>("#height-view-status")!;
const wheelSpeedInput = document.querySelector<HTMLInputElement>("#wheel-speed")!;
const wheelSpeedValue = document.querySelector<HTMLOutputElement>("#wheel-speed-value")!;
const points = document.querySelector<HTMLButtonElement>("#points")!;
const resetView = document.querySelector<HTMLButtonElement>("#reset-view")!;
const collision = document.querySelector<HTMLInputElement>("#collision")!;
const collisionStatus = document.querySelector<HTMLElement>("#collision-status")!;
const scanSelect = document.querySelector<HTMLSelectElement>("#scan-select")!;
const propertySelect = document.querySelector<HTMLSelectElement>("#property-select")!;
const requestedProperty = new URLSearchParams(location.search).get("property");
const propertyId = Array.from(propertySelect.options).some((option) => option.value === requestedProperty)
  ? requestedProperty! : "bs17";
propertySelect.value = propertyId;
initViewerTheme();
const aimTab = document.querySelector<HTMLButtonElement>("#property-tab-aim")!;
const projectsTab = document.querySelector<HTMLButtonElement>("#property-tab-projects")!;
const projectPanel = document.querySelector<HTMLElement>("#project-panel")!;
function selectPropertyTab(projects: boolean) {
  document.documentElement.classList.toggle("property-project-active", projects);
  aimTab.setAttribute("aria-selected", String(!projects));
  projectsTab.setAttribute("aria-selected", String(projects));
  projectPanel.hidden = !projects;
}
aimTab.addEventListener("click", () => selectPropertyTab(false));
projectsTab.addEventListener("click", () => selectPropertyTab(true));
propertySelect.addEventListener("change", () => {
  if (propertySelect.value === "sol20" || propertySelect.value === "sol24-26") {
    const next = new URL("sol-viewer.html", document.baseURI);
    next.searchParams.set("property", propertySelect.value);
    next.searchParams.set("theme", document.documentElement.dataset.theme || "hemy");
    location.assign(next.href);
    return;
  }
  if (propertySelect.value === "bs17") {
    const saved = sessionStorage.getItem("hemy360-bs17-viewer-url");
    const next = new URL(saved || "/lcc2.html?scan=bs17-loftet", location.origin);
    const lang = new URLSearchParams(location.search).get("lang");
    if (lang) next.searchParams.set("lang", lang);
    location.assign(next.href);
    return;
  }
  if (propertyId === "bs17") sessionStorage.setItem("hemy360-bs17-viewer-url", location.href);
  const next = new URL(location.href);
  next.searchParams.delete("layers");
  next.searchParams.delete("display");
  next.searchParams.set("property", propertySelect.value);
  next.searchParams.delete("scan");
  location.assign(next.href);
});
const scanName = document.querySelector<HTMLElement>("#scan-name")!;
const scanNote = document.querySelector<HTMLElement>("#scan-note")!;
if (propertyId !== "bs17") {
  document.documentElement.classList.add("property-other");
  const propertyName = propertySelect.selectedOptions[0].textContent!.replace(/ · BIM$/, "");
  const hasBim = propertyId === "hg62";
  const note = hasBim
    ? "HG62 har BIM-visning i laben. Skannopptak er ennå ikke koblet til denne eiendommen her."
    : "Eiendommen finnes i Dropbox-katalogen. Ingen modeller eller opptak er koblet til denne vieweren ennå.";
  scanName.textContent = propertyName;
  document.querySelector<HTMLElement>("h1")!.textContent = "Hemy360 visningslab";
  document.title = `Hemy360 · ${propertyName}`;
  document.querySelector<HTMLElement>("#property-summary-title")!.textContent = propertyName;
  document.querySelector<HTMLElement>("#property-summary-note")!.textContent = note;
  document.querySelector<HTMLElement>("#property-view-title")!.textContent = propertyName;
  document.querySelector<HTMLElement>("#property-view-note")!.textContent = note;
  document.querySelector<HTMLElement>("#property-summary-link")!.hidden = !hasBim;
  document.querySelector<HTMLElement>("#property-view-link")!.hidden = !hasBim;
  document.querySelector<HTMLElement>("#property-summary")!.hidden = false;
  for (const child of document.querySelector<HTMLElement>(".panel")!.children) {
    if (!child.matches(".theme-picker, .language-picker, .back, h1, #scan-name, .property-picker, #property-summary, #property-tabs, #project-panel")) {
      (child as HTMLElement).hidden = true;
    }
  }
  document.querySelector<HTMLElement>("#project-source-note")!.textContent = "Ingen prosjekter er registrert for denne eiendommen i visningslaben ennå.";
  document.querySelector<HTMLElement>("#project-source-link")!.hidden = true;
  document.querySelector<HTMLElement>("#project-file-list")!.hidden = true;
  document.querySelector<HTMLElement>("#drawing-panel")!.hidden = true;
  host.hidden = true;
  document.querySelector<HTMLElement>("#property-view")!.hidden = false;
}
const gcpPanel = document.querySelector<HTMLElement>("#gcp-panel")!;
const adjacentPanel = document.querySelector<HTMLElement>("#adjacent-panel")!;
const singleLayerPanel = document.querySelector<HTMLElement>("#single-layer-panel")!;
const singleLayerTitle = document.querySelector<HTMLElement>("#single-layer-title")!;
const singleLayerNote = document.querySelector<HTMLElement>("#single-layer-note")!;
const singleVisibility = document.querySelector<HTMLSelectElement>("#single-visibility")!;
const singleDisplay = document.querySelector<HTMLSelectElement>("#single-display")!;
const showLoft = document.querySelector<HTMLSelectElement>("#show-loft")!;
const showHendrix = document.querySelector<HTMLSelectElement>("#show-hendrix")!;
const loftDisplay = document.querySelector<HTMLSelectElement>("#loft-display")!;
const hendrixDisplay = document.querySelector<HTMLSelectElement>("#hendrix-display")!;
const showLoftPoints = document.querySelector<HTMLInputElement>("#show-loft-points")!;
const showHendrixPoints = document.querySelector<HTMLInputElement>("#show-hendrix-points")!;
const outdoorDisplay = document.querySelector<HTMLSelectElement>("#outdoor-display")!;
const extraScanControls: Record<ExtraScanId, { visibility: HTMLSelectElement; markers: HTMLInputElement; status: HTMLElement; label: string }> = {
  "112646": {
    visibility: document.querySelector<HTMLSelectElement>("#show-fagmoebler")!,
    markers: document.querySelector<HTMLInputElement>("#show-fagmoebler-points")!,
    status: document.querySelector<HTMLElement>("#fagmoebler-status")!,
    label: "Fagmøbler1",
  },
  "183256": {
    visibility: document.querySelector<HTMLSelectElement>("#show-outdoor")!,
    markers: document.querySelector<HTMLInputElement>("#show-outdoor-points")!,
    status: document.querySelector<HTMLElement>("#outdoor-status")!,
    label: "Utvendig referanse",
  },
};
const catalogControls = new Map<Bs17CatalogId, {
  visibility: HTMLSelectElement; display: HTMLSelectElement; status: HTMLElement;
  focus: HTMLButtonElement; model: LccObject | null; loading: Promise<void> | null;
  pointMode: boolean; bounds: Bounds | null;
}>();
for (const entry of bs17Catalog) {
  scanSelect.add(new Option(`${entry.label}${entry.aligned ? " · LCC2" : " · lokal ramme"}`, entry.id));
  if (!entry.aligned) continue;
  const picker = document.createElement("label");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.value = entry.id;
  picker.append(checkbox, document.createTextNode(` ${entry.label}`));
  document.querySelector<HTMLElement>("#catalog-layer-picker")!.append(picker);
  const card = document.createElement("div");
  card.className = "model-layer";
  card.dataset.layerId = entry.id;
  card.hidden = true;
  const title = document.createElement("strong");
  title.textContent = entry.label;
  const visibilityLabel = document.createElement("label");
  visibilityLabel.textContent = "Synlighet";
  const visibility = document.createElement("select");
  visibility.setAttribute("aria-label", `Synlighet ${entry.label}`);
  visibility.append(new Option("Borte", "hidden"), new Option("Synlig", "visible"), new Option("Ghost", "ghost"));
  const displayLabel = document.createElement("label");
  displayLabel.textContent = "Filtype";
  const display = document.createElement("select");
  display.setAttribute("aria-label", `Filtype ${entry.label}`);
  display.append(new Option("3DGS · LCC2", "splat"), new Option("Punktsky · LCC2", "points"));
  const focus = document.createElement("button");
  focus.type = "button";
  focus.textContent = "Fokuser på opptaket";
  const statusElement = document.createElement("p");
  statusElement.className = "layer-status";
  statusElement.textContent = "LCC2 lastes når laget vises. Felles koordinatramme er ikke landmålerkontrollert.";
  card.append(title, visibilityLabel, visibility, displayLabel, display, focus, statusElement);
  document.querySelector<HTMLElement>("#catalog-layer-cards")!.append(card);
  catalogControls.set(entry.id, { visibility, display, status: statusElement,
    focus, model: null, loading: null, pointMode: false, bounds: null });
}
const bimVisibility = document.querySelector<HTMLSelectElement>("#bim-visibility")!;
const separateScans = document.querySelector<HTMLInputElement>("#separate-scans")!;
const scanSeparationHeight = document.querySelector<HTMLInputElement>("#scan-separation-height")!;
const scanSeparationValue = document.querySelector<HTMLOutputElement>("#scan-separation-value")!;
const hendrixStatus = document.querySelector<HTMLElement>("#hendrix-status")!;
const gcpMatchList = document.querySelector<HTMLElement>("#gcp-match-list")!;
const sharedAnchorList = document.querySelector<HTMLElement>("#shared-anchor-list")!;
const showGcps = document.querySelector<HTMLInputElement>("#show-gcps")!;
const pointToggles: Record<PointKind, HTMLInputElement> = {
  GCP: showGcps,
  POI: document.querySelector<HTMLInputElement>("#show-pois")!,
  HDE: document.querySelector<HTMLInputElement>("#show-hdes")!,
  POV: document.querySelector<HTMLInputElement>("#show-povs")!,
};
const annotation = document.querySelector<HTMLElement>("#gcp-annotation")!;
const annotationTitle = document.querySelector<HTMLElement>("#gcp-annotation-title")!;
const annotationStatus = document.querySelector<HTMLElement>("#gcp-annotation-status")!;
const annotationImage = document.querySelector<HTMLImageElement>("#gcp-annotation-image")!;
const photoViewport = document.querySelector<HTMLElement>("#photo-viewport")!;
const photoZoomLevel = document.querySelector<HTMLElement>("#photo-zoom-level")!;
const zoomOut = document.querySelector<HTMLButtonElement>("#photo-zoom-out")!;
const zoomIn = document.querySelector<HTMLButtonElement>("#photo-zoom-in")!;
const annotationCaption = document.querySelector<HTMLElement>("#gcp-annotation-caption")!;
const photoCount = document.querySelector<HTMLElement>("#gcp-photo-count")!;
const photoPrev = document.querySelector<HTMLButtonElement>("#gcp-photo-prev")!;
const photoNext = document.querySelector<HTMLButtonElement>("#gcp-photo-next")!;
const annotationNote = document.querySelector<HTMLElement>("#annotation-note")!;
const bubbleControls = document.querySelector<HTMLElement>("#bubble-controls")!;
const bubbleTitle = document.querySelector<HTMLElement>("#bubble-title")!;
const scanParam = new URLSearchParams(location.search).get("scan");
const catalogScan = bs17Catalog.find((entry) => entry.id === scanParam);
const selectedScan = scanParam === "bs17-default" || scanParam === "bs17-loftet" ||
  scanParam === "bs17-fagmoebler1" || scanParam === "bs17-outdoor" ? scanParam : catalogScan?.id ?? "boiler";
const primaryLayerId = selectedScan === "bs17-loftet" ? "152950" :
  selectedScan === "bs17-outdoor" ? "183256" : selectedScan === "bs17-fagmoebler1" ? "112646" :
  selectedScan === "bs17-default" ? "102311" : catalogScan?.id ?? "180322";
const validLayerIds = new Set(["152950", "152958", "183256", "112646", "180322", "102311",
  ...bs17Catalog.filter((entry) => entry.aligned).map((entry) => entry.id)]);
type ModelPreferences = {
  order?: string[]; layers?: string[]; visibility?: Record<string, string>;
  display?: Record<string, string>; markers?: Record<string, boolean>;
  detail?: string; separateScans?: boolean; separationHeight?: string;
};
let savedModelPreferences: ModelPreferences = {};
try { savedModelPreferences = JSON.parse(localStorage.getItem("hemy360-bs17-model-preferences-v1") || "{}"); }
catch { /* Local preferences are optional. */ }
const requestedLayerIds = new URLSearchParams(location.search).get("layers")?.split(",") ??
  savedModelPreferences.layers ?? [];
const selectedLayerIds = new Set<string>(selectedScan === "bs17-loftet" ?
  ["152950", ...requestedLayerIds.filter((id) => validLayerIds.has(id))] : [primaryLayerId]);
const noiseMaskPanel = document.querySelector<HTMLElement>("#noise-mask-panel")!;
const noiseMaskLayer = document.querySelector<HTMLSelectElement>("#noise-mask-layer")!;
const noiseMaskPick = document.querySelector<HTMLButtonElement>("#noise-mask-pick")!;
const noiseMaskUndo = document.querySelector<HTMLButtonElement>("#noise-mask-undo")!;
const noiseMaskEnabled = document.querySelector<HTMLInputElement>("#noise-mask-enabled")!;
const noiseMaskMargin = document.querySelector<HTMLInputElement>("#noise-mask-margin")!;
const noiseMaskMarginValue = document.querySelector<HTMLOutputElement>("#noise-mask-margin-value")!;
const noiseMaskClear = document.querySelector<HTMLButtonElement>("#noise-mask-clear")!;
const noiseMaskStatus = document.querySelector<HTMLElement>("#noise-mask-status")!;
const noiseMaskIds: NoiseMaskId[] = ["152950", "152958", "183256", "180322", ...bs17Catalog.map((entry) => entry.id)];
for (const entry of bs17Catalog) noiseMaskLayer.add(new Option(entry.label, entry.id));
const noiseMasks: Partial<Record<NoiseMaskId, NoiseMask>> = {};
try {
  const saved = JSON.parse(localStorage.getItem("hemy360-bs17-noise-masks-v2") ||
    localStorage.getItem("hemy360-bs17-noise-masks-v1") || "{}");
  for (const id of noiseMaskIds) {
    const candidate = saved[id] as (NoiseMask & { corners?: [[number, number], [number, number]] }) | undefined;
    const corners = candidate?.corners;
    const vertices = candidate?.vertices ?? (Array.isArray(corners) && corners.length === 2 ?
      [[corners[0][0], corners[0][1]], [corners[1][0], corners[0][1]],
        [corners[1][0], corners[1][1]], [corners[0][0], corners[1][1]]] : []);
    const validVertices = Array.isArray(vertices) && vertices.length >= 3 &&
      vertices.length <= MAX_NOISE_MASK_VERTICES && vertices.every((vertex) =>
        Array.isArray(vertex) && vertex.length === 2 && vertex.every((value) => Number.isFinite(value)));
    if (validVertices && Number.isFinite(candidate?.margin) && candidate!.margin >= 0 && candidate!.margin <= 10) {
      const candidateHeights = candidate?.heights;
      const heights = Array.isArray(candidateHeights) && candidateHeights.length === vertices.length &&
        candidateHeights.every((value) => Number.isFinite(value)) ? candidateHeights : undefined;
      noiseMasks[id] = { vertices: vertices as [number, number][], heights,
        margin: candidate!.margin,
        enabled: candidate!.enabled === true };
    }
  }
} catch { /* A damaged or unavailable browser preference must not block the viewer. */ }
noiseMaskPanel.hidden = selectedScan === "bs17-default" || selectedScan === "bs17-fagmoebler1";
noiseMaskLayer.value = selectedLayerIds.has("183256") ? "183256" : primaryLayerId;
const overlapPriority = document.querySelector<HTMLSelectElement>("#overlap-priority")!;
for (const entry of bs17Catalog.filter((candidate) => candidate.aligned)) {
  overlapPriority.add(new Option(entry.label, entry.id));
}
try {
  const saved = localStorage.getItem("hemy360-overlap-priority");
  if (saved && Array.from(overlapPriority.options).some((option) => option.value === saved)) overlapPriority.value = saved;
} catch { /* This preference is optional when browser storage is unavailable. */ }
overlapPriority.addEventListener("change", () => {
  try { localStorage.setItem("hemy360-overlap-priority", overlapPriority.value); } catch { /* Optional preference. */ }
  updateSplatBudgets();
});
const layerPicker = document.querySelector<HTMLElement>("#scan-layer-picker")!;
const layerBoxes = [...layerPicker.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
function showSelectedLayerCards() {
  for (const box of layerBoxes) {
    box.checked = selectedLayerIds.has(box.value);
    box.disabled = box.value === primaryLayerId;
  }
  for (const card of adjacentPanel.querySelectorAll<HTMLElement>("[data-layer-id]")) {
    card.hidden = card.dataset.layerId !== "bim" && !selectedLayerIds.has(card.dataset.layerId!);
  }
}
showSelectedLayerCards();
const modelList = document.querySelector<HTMLElement>("#model-list")!;
const modelPreferenceStatus = document.querySelector<HTMLElement>("#model-preferences-status")!;
const modelCards = [...adjacentPanel.querySelectorAll<HTMLElement>(".model-layer[data-layer-id]")];
for (const card of modelCards) modelList.append(card);
const initialOrder = ["roof-184147", "152950", "152958", "183256", "storage-133309",
  "fagmoebler2-120101", "fagmoebler4-133309", "hvac-140642", "fagmoebler1-112646",
  "boiler-180322", "112646", "180322", "102311", "bim"];
const rankedIds = [...new Set([...(savedModelPreferences.order ?? initialOrder), ...modelCards.map((card) => card.dataset.layerId!)])];
for (const id of rankedIds) {
  const card = modelCards.find((item) => item.dataset.layerId === id);
  if (card) modelList.append(card);
}
const visibilityForLayer = (id: string): HTMLSelectElement | null => id === "152950" ? showLoft :
  id === "152958" ? showHendrix : id === "183256" ? extraScanControls["183256"].visibility :
  id === "112646" ? extraScanControls["112646"].visibility : id === "bim" ? bimVisibility :
  id === "single" ? singleVisibility :
  catalogControls.get(id as Bs17CatalogId)?.visibility ?? null;
let isolatedVisibility: Map<string, string> | null = null;
function setLayerVisibility(id: string, value: string) {
  const select = visibilityForLayer(id);
  if (!select || select.value === value) return;
  select.value = value;
  select.dispatchEvent(new Event("change"));
}
function reorderModelCard(card: HTMLElement, direction: -1 | 1) {
  const visible = [...modelList.children].filter((item) => !(item as HTMLElement).hidden) as HTMLElement[];
  const position = visible.indexOf(card);
  const neighbor = visible[position + direction];
  if (!neighbor) return;
  if (direction < 0) modelList.insertBefore(card, neighbor);
  else modelList.insertBefore(neighbor, card);
  updateSplatBudgets();
}
let activeLayerId = primaryLayerId;
const layerDetailById = new Map<string, HTMLElement>();
function toggleLayerDetails(id: string) {
  const details = layerDetailById.get(id);
  if (details) details.hidden = !details.hidden;
}
for (const card of modelCards) {
  const id = card.dataset.layerId!;
  const select = visibilityForLayer(id);
  const viewSelects = [...card.querySelectorAll<HTMLSelectElement>("select")];
  const viewControls = document.createElement("div");
  viewControls.className = "layer-view-controls";
  if (viewSelects.length === 1) viewControls.classList.add("layer-view-controls--single");
  for (const input of viewSelects) {
    input.classList.add(input === select ? "layer-visibility" : "layer-display");
    viewControls.append(input);
  }
  const up = document.createElement("button");
  up.type = "button"; up.className = "layer-priority-up"; up.textContent = "↑";
  up.title = "Høyere prioritet"; up.setAttribute("aria-label", `Flytt ${id} opp`);
  up.addEventListener("click", () => reorderModelCard(card, -1));
  const down = document.createElement("button");
  down.type = "button"; down.className = "layer-priority-down"; down.textContent = "↓";
  down.title = "Lavere prioritet"; down.setAttribute("aria-label", `Flytt ${id} ned`);
  down.addEventListener("click", () => reorderModelCard(card, 1));
  const eye = document.createElement("button");
  eye.type = "button"; eye.className = "layer-eye";
  function syncEye() {
    eye.textContent = select?.value === "hidden" ? "○" : select?.value === "ghost" ? "◐" : "●";
    eye.setAttribute("aria-label", `${select?.value === "hidden" ? "Vis" : "Skjul"} ${card.querySelector("strong")?.textContent ?? id}`);
  }
  eye.disabled = !select;
  eye.addEventListener("click", () => { activeLayerId = id; setLayerVisibility(id, select?.value === "hidden" ? "visible" : "hidden"); });
  select?.addEventListener("change", syncEye);
  syncEye();
  const expand = document.createElement("button");
  expand.type = "button"; expand.className = "layer-expand"; expand.textContent = "▾";
  expand.setAttribute("aria-label", `Vis detaljer for ${card.querySelector("strong")?.textContent ?? id}`);
  expand.addEventListener("click", (event) => {
    activeLayerId = id;
    if (matchMedia("(pointer: coarse)").matches) showModelContextMenu(event.clientX, event.clientY, id);
    else { toggleLayerDetails(id); expand.setAttribute("aria-expanded", String(!layerDetailById.get(id)?.hidden)); }
  });
  card.append(eye, up, down, expand);
  const secondary = [...card.children].filter((child) => child.matches(
    ".toggle, .layer-status, .layer-open, button:not(.layer-priority-up):not(.layer-priority-down):not(.layer-eye):not(.layer-expand)",
  ));
  const details = document.createElement("div");
  details.className = "layer-details"; details.hidden = true;
  details.append(viewControls, ...secondary);
  card.append(details);
  layerDetailById.set(id, details);
  card.tabIndex = 0;
  card.addEventListener("contextmenu", (event) => {
    event.preventDefault(); activeLayerId = id; showModelContextMenu(event.clientX, event.clientY, id);
  });
  card.addEventListener("keydown", (event) => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      const rect = card.getBoundingClientRect();
      showModelContextMenu(rect.left + 20, rect.bottom, id); event.preventDefault();
    }
  });
}
function runLayerAction(id: string, action: string) {
  activeLayerId = id;
  if (action === "details") {
    if (id === "single") singleDetails.hidden = !singleDetails.hidden;
    else toggleLayerDetails(id);
    return;
  }
  if (action === "all") {
    isolatedVisibility = null;
    if (id === "single") setLayerVisibility(id, "visible");
    else for (const item of modelCards) if (!item.hidden) setLayerVisibility(item.dataset.layerId!, "visible");
  } else if (action === "hide" || action === "ghost" || action === "visible")
    setLayerVisibility(id, action === "hide" ? "hidden" : action === "ghost" ? "ghost" : "visible");
  else if (action === "others" || action === "isolate") {
    if (id === "single") { setLayerVisibility(id, "visible"); return; }
    if (action === "isolate") isolatedVisibility = new Map(modelCards.map((item) =>
      [item.dataset.layerId!, visibilityForLayer(item.dataset.layerId!)?.value ?? "hidden"]));
    else isolatedVisibility = null;
    for (const item of modelCards) if (!item.hidden) setLayerVisibility(item.dataset.layerId!, item.dataset.layerId === id ? "visible" : "hidden");
  } else if (action === "restore") {
    if (isolatedVisibility) for (const [savedId, value] of isolatedVisibility) setLayerVisibility(savedId, value);
    isolatedVisibility = null;
  } else if (action === "look") {
    const catalogFocus = catalogControls.get(id as Bs17CatalogId)?.focus;
    if (catalogFocus) catalogFocus.click(); else resetView.click();
  } else if (action === "up" || action === "down") {
    const card = modelCards.find((item) => item.dataset.layerId === id);
    if (card) reorderModelCard(card, action === "up" ? -1 : 1);
  }
}
const modelContextMenu = document.createElement("div");
modelContextMenu.className = "model-context-menu";
modelContextMenu.hidden = true;
modelContextMenu.setAttribute("role", "dialog");
modelContextMenu.setAttribute("aria-label", "Laghandlinger");
const contextTitle = document.createElement("strong");
contextTitle.textContent = "Laghandlinger";
const contextLayer = document.createElement("select");
contextLayer.setAttribute("aria-label", "Velg skannlag eller modell");
contextLayer.addEventListener("change", () => { activeLayerId = contextLayer.value; });
modelContextMenu.append(contextTitle, contextLayer);
for (const [action, label] of [
  ["visible", "Vis"], ["hide", "Skjul"], ["ghost", "Gjennomsiktig"],
  ["isolate", "Isoler"], ["others", "Skjul andre"], ["restore", "Avslutt isolering"],
  ["all", "Vis alle"], ["look", "Se på"], ["up", "Prioritet opp"],
  ["down", "Prioritet ned"], ["details", "Detaljer"],
]) {
  const button = document.createElement("button");
  button.type = "button"; button.textContent = label;
  button.addEventListener("click", () => { runLayerAction(contextLayer.value, action); modelContextMenu.hidden = true; });
  modelContextMenu.append(button);
}
document.body.append(modelContextMenu);
function showModelContextMenu(x: number, y: number, selectedId = activeLayerId) {
  contextLayer.replaceChildren();
  if (!singleLayerPanel.hidden) contextLayer.add(new Option(singleLayerTitle.textContent || "Aktivt skann", "single"));
  else for (const card of modelCards.filter((item) => !item.hidden))
    contextLayer.add(new Option(card.querySelector("strong")?.textContent ?? card.dataset.layerId!, card.dataset.layerId!));
  if (!contextLayer.options.length) return;
  contextLayer.value = [...contextLayer.options].some((option) => option.value === selectedId) ? selectedId : contextLayer.options[0].value;
  activeLayerId = contextLayer.value;
  modelContextMenu.hidden = false;
  const rect = modelContextMenu.getBoundingClientRect();
  modelContextMenu.style.left = `${Math.max(8, Math.min(x, innerWidth - rect.width - 8))}px`;
  modelContextMenu.style.top = `${Math.max(8, Math.min(y, innerHeight - rect.height - 8))}px`;
  contextLayer.focus();
}
document.addEventListener("pointerdown", (event) => {
  if (!modelContextMenu.hidden && !modelContextMenu.contains(event.target as Node)) modelContextMenu.hidden = true;
});
window.addEventListener("keydown", (event) => { if (event.key === "Escape") modelContextMenu.hidden = true; });
const singleCard = singleLayerPanel.querySelector<HTMLElement>(".model-layer")!;
const singleDetails = document.createElement("div");
singleDetails.className = "layer-details"; singleDetails.hidden = true;
for (const child of [...singleCard.children]) if (child.id !== "single-layer-title") singleDetails.append(child);
const singleEye = document.createElement("button");
singleEye.type = "button"; singleEye.className = "layer-eye"; singleEye.textContent = "●";
singleEye.setAttribute("aria-label", "Vis eller skjul aktivt skann");
singleEye.addEventListener("click", () => setLayerVisibility("single", singleVisibility.value === "hidden" ? "visible" : "hidden"));
const singleExpand = document.createElement("button");
singleExpand.type = "button"; singleExpand.className = "layer-expand"; singleExpand.textContent = "▾";
singleExpand.setAttribute("aria-label", "Vis detaljer for aktivt skann");
singleExpand.addEventListener("click", (event) => {
  if (matchMedia("(pointer: coarse)").matches) showModelContextMenu(event.clientX, event.clientY, "single");
  else { singleDetails.hidden = !singleDetails.hidden; singleExpand.setAttribute("aria-expanded", String(!singleDetails.hidden)); }
});
singleCard.append(singleEye, singleExpand, singleDetails);
singleVisibility.addEventListener("change", () => { singleEye.textContent = singleVisibility.value === "hidden" ? "○" : singleVisibility.value === "ghost" ? "◐" : "●"; });
singleCard.addEventListener("contextmenu", (event) => { event.preventDefault(); showModelContextMenu(event.clientX, event.clientY, "single"); });
document.querySelector<HTMLButtonElement>("#save-model-preferences")!.addEventListener("click", () => {
  const preferences: ModelPreferences = {
    order: [...modelList.children].map((item) => (item as HTMLElement).dataset.layerId!),
    layers: [...selectedLayerIds], visibility: {}, display: {}, markers: {},
    detail: detail.value, separateScans: separateScans.checked, separationHeight: scanSeparationHeight.value,
  };
  for (const card of modelCards) {
    const id = card.dataset.layerId!;
    const visibility = visibilityForLayer(id);
    if (visibility) preferences.visibility![id] = visibility.value;
    const display = card.querySelector<HTMLSelectElement>(".layer-display");
    if (display) preferences.display![id] = display.value;
    const marker = card.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (marker) preferences.markers![id] = marker.checked;
  }
  try {
    localStorage.setItem("hemy360-bs17-model-preferences-v1", JSON.stringify(preferences));
    modelPreferenceStatus.textContent = "Lagret på denne enheten. Delte lenker kan ha egne lagvalg.";
  } catch { modelPreferenceStatus.textContent = "Kunne ikke lagre i denne nettleseren."; }
});
document.querySelector<HTMLButtonElement>("#reset-model-preferences")!.addEventListener("click", () => {
  try { localStorage.removeItem("hemy360-bs17-model-preferences-v1"); }
  catch { /* The current view can still use defaults. */ }
  location.reload();
});
for (const box of layerBoxes) {
  box.addEventListener("change", () => {
    if (box.checked) selectedLayerIds.add(box.value);
    else selectedLayerIds.delete(box.value);
    if (selectedScan !== "bs17-loftet") {
      selectedLayerIds.add("152950");
      const next = new URL(location.href);
      next.searchParams.set("scan", "bs17-loftet");
      next.searchParams.set("layers", [...selectedLayerIds].join(","));
      next.searchParams.delete("display");
      location.assign(next.href);
      return;
    }
    showSelectedLayerCards();
    const visibility = box.value === "152958" ? showHendrix :
      box.value === "183256" ? extraScanControls["183256"].visibility :
      box.value === "112646" ? extraScanControls["112646"].visibility :
        catalogControls.get(box.value as Bs17CatalogId)?.visibility ?? null;
    if (visibility) {
      visibility.value = box.checked ? "visible" : "hidden";
      visibility.dispatchEvent(new Event("change"));
    }
    const next = new URL(location.href);
    if (selectedLayerIds.size === 1) next.searchParams.delete("layers");
    else next.searchParams.set("layers", [...selectedLayerIds].join(","));
    history.replaceState(null, "", next);
  });
}
document.querySelector<HTMLSelectElement>("#boiler-type")!.addEventListener("change", (event) => {
  const next = new URL("lcc2.html", document.baseURI);
  next.searchParams.set("display", (event.target as HTMLSelectElement).value);
  location.assign(next.href);
});
scanSelect.value = selectedScan;
scanSelect.addEventListener("change", () => {
  const next = new URL(location.href);
  next.searchParams.delete("layers");
  next.searchParams.delete("display");
  if (scanSelect.value === "boiler") next.searchParams.delete("scan");
  else next.searchParams.set("scan", scanSelect.value);
  location.assign(next.href);
});
const isPointScan = !catalogScan;
const isRawLasScan = selectedScan === "bs17-fagmoebler1";
points.hidden = selectedScan === "bs17-loftet" || isRawLasScan;
const captureId = selectedScan === "boiler" ? "180322" : selectedScan === "bs17-default" ? "102311" : selectedScan === "bs17-loftet" ? "152950" :
  selectedScan === "bs17-fagmoebler1" ? "112646" : selectedScan === "bs17-outdoor" ? "183256" : null;
const modelUrl = new URL(selectedScan === "bs17-default" ? "local-scan/bs17-default/manifest.lcc2" :
  selectedScan === "bs17-loftet" ? "local-scan/bs17-loftet/manifest.lcc2" :
  selectedScan === "bs17-outdoor" ? "local-scan/bs17-outdoor/manifest.lcc2" :
  catalogScan ? `local-scan/bs17-catalog/${catalogScan.id}/manifest.lcc2` :
  "local-scan/bs17/BS17_03_boiler-room_180322.lcc2", document.baseURI).href;
if (catalogScan && propertyId === "bs17") {
  scanName.textContent = `Opptak ${catalogScan.label}`;
  scanNote.textContent = catalogScan.aligned
    ? "Eksporten oppgir EPSG:32632 og samme lokale offset som Loftet. Landmålerkontroll og høydedatum gjenstår."
    : "Eksporten oppgir EPSG 0. Den vises separat til en kontrollert transformasjon er etablert.";
  gcpPanel.hidden = true;
  adjacentPanel.hidden = true;
  singleLayerPanel.hidden = false;
  singleLayerTitle.textContent = catalogScan.label;
  singleLayerNote.textContent = catalogScan.aligned
    ? "Samme oppgitte koordinatramme som Loftet, men samstilling er foreløpig."
    : "Lokalt koordinatsystem. Kan ikke legges over de øvrige opptakene ennå.";
  document.querySelector<HTMLElement>("#point-photo-hint")!.textContent = "Ingen bildemarkører er registrert for denne eksporten ennå.";
}
if (isPointScan) {
  if (propertyId === "bs17") scanName.textContent = selectedScan === "boiler" ? "Opptak 180322 · Boiler room" :
    selectedScan === "bs17-default" ? "Opptak 102311 · avbrutt testskann" :
    selectedScan === "bs17-loftet" ? "Opptak 152950 · Loftet" :
      selectedScan === "bs17-fagmoebler1" ? "Opptak 112646 · Fagmøbler1" : "Opptak 183256 · utvendig referanse";
  scanNote.textContent = selectedScan === "boiler"
    ? "Boiler room har lokalt koordinatsystem (EPSG 0) og ingen RTK fixed-observasjoner. Felles plassering mot andre BS17-opptak er ikke verifisert."
    : selectedScan === "bs17-default"
    ? "Punktsky og punkter er fra samme, avbrutte råopptak. Ingen GCP har RTK fixed. Bruk dette til å teste visning og bilder, ikke georeferering."
    : selectedScan === "bs17-outdoor"
      ? "Full LCC2/3DGS fra utvendig opptak. Modellen bruker oppgitt EPSG:32632; felles kontrollpunkter og høydedatum er ennå ikke verifisert."
    : isRawLasScan
      ? "Farget utvalg fra rå LAS i Loftets lokale ramme. Samstillingen bygger på foreløpige punktkandidater og GNSS-data; absolutt plassering og høydedatum er ikke verifisert."
      : "Punktsky og punkter er fra samme råopptak. GNSS-loggen har RTK fixed-perioder, men dette alene verifiserer ikke hvert kontrollpunkt eller samstilling med andre skann.";
  gcpPanel.hidden = false;
  if (selectedScan === "boiler") {
    document.querySelector<HTMLElement>("#point-photo-hint")!.textContent =
      "Klikk på et POI-punkt for frontbildet. Denne eksporten inneholder ikke fisheye-bilder til 360°-boble.";
  }
  adjacentPanel.hidden = selectedScan !== "bs17-loftet";
  singleLayerPanel.hidden = selectedScan === "bs17-loftet";
  if (!singleLayerPanel.hidden) {
    singleLayerTitle.textContent = selectedScan === "boiler" ? "Boiler room · 180322" :
      selectedScan === "bs17-outdoor" ? "Utvendig referanse · 183256" :
        selectedScan === "bs17-fagmoebler1" ? "Fagmøbler1 · 112646" : "Testskann · 102311";
    singleLayerNote.textContent = selectedScan === "boiler"
      ? "Eget lokalt koordinatsystem. Overlegg mot øvrige BS17-skann venter på kontrollert transformasjon."
      : selectedScan === "bs17-outdoor" ? "Samme horisontale EPSG som Loftet. Felles ankere og høydedatum er fortsatt foreløpige."
        : selectedScan === "bs17-default" ? "Avbrutt testopptak vist som LAS-punktsky uten RTK fixed. Ikke samstilt med resten av BS17."
          : "Dette LAS-opptaket vises separat her. Velg det sammen med Loftet for å se tilgjengelig samstilling.";
    if (selectedScan === "bs17-fagmoebler1" || selectedScan === "bs17-default") {
      singleVisibility.disabled = true;
      singleDisplay.replaceChildren(new Option("Punktsky · LAS", "points"));
      singleDisplay.disabled = true;
    }
  }
  if (selectedScan === "boiler" && new URLSearchParams(location.search).get("display") === "points") {
    singleDisplay.value = "points";
  }
}
const started = performance.now();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15191e);
const bimAmbientLight = new THREE.HemisphereLight(0xffffff, 0x6d7d90, 1.1);
scene.add(bimAmbientLight);
const bimSunlight = new THREE.DirectionalLight(0xffffff, 0.7);
bimSunlight.position.set(-1, -1, 2);
scene.add(bimSunlight);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 5000);
camera.up.set(0, 0, 1);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.localClippingEnabled = true;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.domElement.tabIndex = 0;
host.append(renderer.domElement);
const pointOverlay = document.createElement("div");
pointOverlay.className = "point-overlay";
pointOverlay.setAttribute("aria-label", "Klikkbare punkter i skannet");
host.append(pointOverlay);
const panoramaScene = new THREE.Scene();
const panoramaCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
panoramaCamera.up.set(0, 0, 1);
let panoramaMesh: THREE.Mesh | null = null;
let panoramaTextures: THREE.Texture[] = [];
let bubbleActive = false;
let bubbleRequest = 0;
let bubbleYaw = 0;
let bubblePitch = 0;

function updateBubbleDirection() {
  panoramaCamera.lookAt(
    Math.cos(bubblePitch) * Math.sin(bubbleYaw),
    Math.cos(bubblePitch) * Math.cos(bubbleYaw),
    Math.sin(bubblePitch),
  );
}
updateBubbleDirection();

const pressed = new Set<string>();
const forward = new THREE.Vector3();
const move = new THREE.Vector3();
const orbitPivot = new THREE.Vector3();
const scanCenter = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const worldZ = new THREE.Vector3(0, 0, 1);
const rotation = new THREE.Quaternion();
const raycaster = new THREE.Raycaster();
const pickPlane = new THREE.Plane();
const panStep = new THREE.Vector3();
const collisionStep = new THREE.Vector3();
const collisionCandidate = new THREE.Vector3();
const pointGroups: Record<PointKind, THREE.Group> = {
  GCP: new THREE.Group(), POI: new THREE.Group(), HDE: new THREE.Group(), POV: new THREE.Group(),
};
const pointButtons: { point: ScanPoint; button: HTMLButtonElement; world: THREE.Vector3 }[] = [];
for (const [kind, group] of Object.entries(pointGroups) as [PointKind, THREE.Group][]) {
  pointToggles[kind].addEventListener("change", () => {
    group.visible = pointToggles[kind].checked;
    if (activePoint?.kind === kind && !group.visible) hidePointAnnotation();
    updatePointTargets();
  });
}
let coordinateGrid: THREE.GridHelper | null = null;
let pointPhotos: PointPhotoData | null = null;
let hendrixPhotos: PointPhotoData | null = null;
const extraPhotos: Partial<Record<ExtraScanId, PointPhotoData>> = {};
const extraModels: Partial<Record<ExtraScanId, THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>>> = {};
const extraPoints: Partial<Record<ExtraScanId, PointData>> = {};
const extraLoading: Partial<Record<ExtraScanId, Promise<void>>> = {};
let activePoint: ScanPoint | null = null;
let activePhotoIndex = 0;
let photoScale = 1;
let photoOffsetX = 0;
let photoOffsetY = 0;
let photoDrag: { x: number; y: number; offsetX: number; offsetY: number } | null = null;
let scanModel: LccObject | null = null;
let adjacentModel: LccObject | null = null;
let outdoorLccModel: LccObject | null = null;
let outdoorPointMode = false;
let adjacentLoading = false;
let pointMode = false;
let loftPointMode = false;
let hendrixPointMode = false;
type SectionAxis = { enabled: HTMLInputElement; position: HTMLInputElement; side: HTMLSelectElement; value: HTMLOutputElement; min: number; max: number };
const sectionControls: SectionAxis[] = [];
const sectionPlanes: THREE.Plane[] = [];
let sectionBounds: THREE.Box3 | null = null;
type SectionMode = "axes" | "plane" | "box";
let sectionMode: SectionMode = "plane";
let sectionPlaneReady = false;
let sectionTransform: TransformControls | null = null;
let sectionGizmoDragging = false;
let sectionPlaneMesh: THREE.Mesh | null = null;
let sectionBoxMesh: THREE.Mesh | null = null;
const sectionOverlayScene = new THREE.Scene();
const scanClipCache = new WeakMap<LccObject, string>();
let sectionPickPending = false;
let sectionPickStart: { x: number; y: number } | null = null;
let placeSectionFromTap: ((x: number, y: number) => boolean) | null = null;
const sectionPickHint = document.createElement("div");
sectionPickHint.id = "section-pick-hint";
sectionPickHint.hidden = true;
sectionPickHint.innerHTML = '<span>Trykk på en overflate for å plassere snittplanet.</span><button type="button">Avbryt</button>';
host.append(sectionPickHint);
function stopSectionPick() {
  const wasPending = sectionPickPending;
  sectionPickPending = false;
  sectionPickStart = null;
  sectionPickHint.hidden = true;
  host.classList.remove("section-picking");
  if (wasPending && sectionMode === "plane" && sectionPlaneMesh) {
    sectionPlaneMesh.visible = sectionPlaneReady;
    if (sectionPlaneReady) sectionTransform?.attach(sectionPlaneMesh);
    updateSection();
  }
}
sectionPickHint.querySelector("button")!.addEventListener("click", stopSectionPick);
window.addEventListener("keydown", (event) => { if (event.key === "Escape") stopSectionPick(); });
if (propertyId === "bs17") setupDrawingLayer({
  scene, camera, canvas: renderer.domElement,
  defaultHeight: () => sectionBounds?.min.z ?? scanCenter.z,
  scanHit: (x, y) => {
    try {
      const hit = scanModel?.raycast({ evt: { x, y }, maxDistance: 1000, radius: 0.1 });
      return hit ? { x: hit.x, y: hit.y } : null;
    } catch { return null; }
  },
});
const noiseMaskOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
noiseMaskOverlay.classList.add("noise-mask-overlay");
const noiseMaskOutline = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
const noiseMaskDraftLine = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
noiseMaskOverlay.append(noiseMaskOutline, noiseMaskDraftLine);
host.append(noiseMaskOverlay);
const noiseMaskStart = document.createElement("button");
noiseMaskStart.type = "button";
noiseMaskStart.className = "noise-mask-start";
noiseMaskStart.setAttribute("aria-label", "Lukk maskelinjen på startpunktet");
noiseMaskStart.title = "Klikk for å lukke maskelinjen";
noiseMaskStart.hidden = true;
host.append(noiseMaskStart);
let noiseMaskPicking: { id: NoiseMaskId; vertices: THREE.Vector3[] } | null = null;
let noiseMaskPointerDown: { x: number; y: number } | null = null;
const polygonClipReady = new Set<NoiseMaskId>();
function maskFor(id: string): NoiseMask | undefined {
  return noiseMaskIds.includes(id as NoiseMaskId) ? noiseMasks[id as NoiseMaskId] : undefined;
}
function maskLimits(mask: NoiseMask) {
  const xs = mask.vertices.map((vertex) => vertex[0]);
  const ys = mask.vertices.map((vertex) => vertex[1]);
  return {
    minX: Math.min(...xs) - mask.margin,
    maxX: Math.max(...xs) + mask.margin,
    minY: Math.min(...ys) - mask.margin,
    maxY: Math.max(...ys) + mask.margin,
  };
}
function saveNoiseMasks() {
  try { localStorage.setItem("hemy360-bs17-noise-masks-v2", JSON.stringify(noiseMasks)); }
  catch { /* Masks still work for the current session. */ }
}
function updateNoiseMaskOverlay() {
  camera.updateMatrixWorld();
  const project = (vertices: [number, number][], heights?: number[]) => vertices.map(([x, y], index) => {
    const point = new THREE.Vector3(x, y, heights?.[index] ?? scanCenter.z).project(camera);
    return `${((point.x + 1) * host.clientWidth / 2).toFixed(1)},${((1 - point.y) * host.clientHeight / 2).toFixed(1)}`;
  }).join(" ");
  const mask = maskFor(noiseMaskLayer.value);
  noiseMaskOutline.setAttribute("points", mask?.enabled ?
    project(mask.vertices, mask.heights) : "");
  const vertices = noiseMaskPicking?.vertices ?? [];
  noiseMaskDraftLine.setAttribute("points", vertices.length ?
    project(vertices.map((point) => [point.x, point.y]), vertices.map((point) => point.z)) : "");
  noiseMaskStart.hidden = !vertices.length;
  noiseMaskStart.disabled = vertices.length < 3;
  if (vertices.length) {
    const first = new THREE.Vector3(vertices[0].x, vertices[0].y, vertices[0].z).project(camera);
    noiseMaskStart.style.left = `${(first.x + 1) * host.clientWidth / 2}px`;
    noiseMaskStart.style.top = `${(1 - first.y) * host.clientHeight / 2}px`;
  }
}
function syncNoiseMaskUi() {
  const mask = maskFor(noiseMaskLayer.value);
  noiseMaskUndo.disabled = !noiseMaskPicking?.vertices.length;
  noiseMaskEnabled.disabled = !mask;
  noiseMaskEnabled.checked = Boolean(mask?.enabled);
  noiseMaskMargin.disabled = !mask;
  noiseMaskMargin.value = String(mask?.margin ?? 1);
  noiseMaskMarginValue.textContent = `${Number(noiseMaskMargin.value).toLocaleString("nb-NO")} m`;
  noiseMaskClear.disabled = !mask;
  noiseMaskPick.textContent = noiseMaskPicking ? "Avbryt tegning" : mask ? "Tegn området på nytt" : "Tegn område";
  if (!noiseMaskPicking) noiseMaskStatus.textContent = mask
    ? `Masken ${mask.enabled ? "er aktiv" : "er av"}. ${mask.vertices.length} hjørner. Klikk «Tegn området på nytt» for å endre formen.`
    : "Tegn rundt området som skal beholdes. Klikk på startpunktet for å lukke linjen.";
  if (!noiseMaskPicking && mask?.enabled && modelForNoiseMask(noiseMaskLayer.value as NoiseMaskId) &&
      !polygonClipReady.has(noiseMaskLayer.value as NoiseMaskId)) {
    noiseMaskStatus.textContent += " Eksakt polygonavgrensing er ikke tilgjengelig; bare ytre klippeboks brukes.";
  }
  updateNoiseMaskOverlay();
}
function cancelNoiseMaskPicking() {
  noiseMaskPicking = null;
  noiseMaskPointerDown = null;
  host.classList.remove("mask-picking");
  syncNoiseMaskUi();
}
function finishNoiseMask() {
  if (!noiseMaskPicking || noiseMaskPicking.vertices.length < 3) return;
  const vertices = noiseMaskPicking.vertices;
  const flat = vertices.map((vertex): [number, number] => [vertex.x, vertex.y]);
  const signedArea = flat.reduce((area, [x, y], index) => {
    const [nextX, nextY] = flat[(index + 1) % flat.length];
    return area + x * nextY - nextX * y;
  }, 0) / 2;
  if (Math.abs(signedArea) < 1) {
    noiseMaskStatus.textContent = "Området er for lite. Legg til hjørner lenger fra hverandre.";
    return;
  }
  noiseMasks[noiseMaskPicking.id] = {
    vertices: flat, heights: vertices.map((vertex) => vertex.z),
    margin: Number(noiseMaskMargin.value), enabled: true,
  };
  saveNoiseMasks();
  cancelNoiseMaskPicking();
  updateSection();
}
noiseMaskStart.addEventListener("click", finishNoiseMask);
function modelForNoiseMask(id: NoiseMaskId): LccObject | null {
  if (id === primaryLayerId) return scanModel;
  if (id === "152958") return adjacentModel;
  if (id === "183256") return outdoorLccModel;
  return catalogControls.get(id as Bs17CatalogId)?.model ?? null;
}
noiseMaskLayer.addEventListener("change", () => { cancelNoiseMaskPicking(); });
noiseMaskPick.addEventListener("click", () => {
  if (noiseMaskPicking) { cancelNoiseMaskPicking(); return; }
  const id = noiseMaskLayer.value as NoiseMaskId;
  if (!modelForNoiseMask(id)) {
    noiseMaskStatus.textContent = "Vis og last dette skannlaget før du markerer et område.";
    return;
  }
  noiseMaskPicking = { id, vertices: [] };
  host.classList.add("mask-picking");
  noiseMaskPick.textContent = "Avbryt tegning";
  noiseMaskStatus.textContent = "Klikk rundt området i 3D-visningen. Avslutt ved å klikke på det grønne startpunktet (minst tre hjørner).";
});
noiseMaskUndo.addEventListener("click", () => {
  if (!noiseMaskPicking?.vertices.length) return;
  noiseMaskPicking.vertices.pop();
  syncNoiseMaskUi();
  const count = noiseMaskPicking.vertices.length;
  noiseMaskStatus.textContent = count >= 3 ?
    `${count} hjørner. Fortsett å tegne, eller klikk på det grønne startpunktet for å lukke linjen.` :
    count === 1 ? "Første hjørne er beholdt. Fortsett å tegne." :
      count === 2 ? "To hjørner er beholdt. Legg til minst ett til." :
        "Klikk i 3D-visningen for å sette et nytt første hjørne.";
});
noiseMaskEnabled.addEventListener("change", () => {
  const mask = maskFor(noiseMaskLayer.value);
  if (!mask) return;
  mask.enabled = noiseMaskEnabled.checked;
  saveNoiseMasks();
  updateSection();
  syncNoiseMaskUi();
});
noiseMaskMargin.addEventListener("input", () => {
  const mask = maskFor(noiseMaskLayer.value);
  if (!mask) return;
  mask.margin = Number(noiseMaskMargin.value);
  saveNoiseMasks();
  updateSection();
  syncNoiseMaskUi();
});
noiseMaskClear.addEventListener("click", () => {
  delete noiseMasks[noiseMaskLayer.value as NoiseMaskId];
  cancelNoiseMaskPicking();
  saveNoiseMasks();
  updateSection();
});
syncNoiseMaskUi();
let sectionBimUpdate: ReturnType<typeof setTimeout> | null = null;
let bimFragments: FragmentsModels | null = null;
let bimModel: FragmentsModel | null = null;
let bimLoading = false;
let bimSpaceIds: number[] = [];
let bimShellIds: number[] = [];
let bimWallIds: number[] = [];
let bimOpeningIds: number[] = [];
let bimOtherIds: number[] = [];
let bimAllGeometryIds: number[] = [];
const bimStoreyById = new Map<number, string>();
const bimLayersById = new Map<number, string[]>();
const bimSystemsById = new Map<number, string[]>();
let bimIndexLoading: Promise<void> | null = null;
let bimTreeLoading: Promise<void> | null = null;
let bimFilterRequest = 0;
let bimFilterActive = false;
let bimUpdating = false;
let selectedBimId: number | null = null;
let selectedBimButton: HTMLButtonElement | null = null;
let bimPointerDown: { x: number; y: number } | null = null;
let lastBimUpdateAt = 0;
function updateBimMaterialDepth(model: FragmentsModel) {
  const writesDepth = Number(bimOpacity.value) >= 0.999;
  model.object.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material.depthWrite === writesDepth) continue;
      material.depthWrite = writesDepth;
      material.needsUpdate = true;
    }
  });
}
const lastBimCameraPosition = new THREE.Vector3();
const lastBimCameraQuaternion = new THREE.Quaternion();
let heading = 0;
let moveSpeed = 8;
let wheelStep = isPointScan ? 0.3 : 1;
try {
  const savedWheelStep = Number(localStorage.getItem("hemy360-wheel-step"));
  if (savedWheelStep >= 0.1 && savedWheelStep <= 5) wheelStep = savedWheelStep;
} catch { /* The viewer remains usable when browser storage is unavailable. */ }
wheelSpeedInput.value = String(wheelStep);
function updateWheelSpeed() {
  wheelStep = Number(wheelSpeedInput.value);
  wheelSpeedValue.textContent = `${wheelStep.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} m/hakk`;
}
updateWheelSpeed();
wheelSpeedInput.addEventListener("input", () => {
  updateWheelSpeed();
  try { localStorage.setItem("hemy360-wheel-step", String(wheelStep)); } catch { /* Optional preference. */ }
});
let dragMode: "orbit" | "pan" | "bubble" | null = null;
let panDepth = 1;
let lastPointerX = 0;
let lastPointerY = 0;
const touchPointers = new Map<number, { x: number; y: number }>();
let touchGesture: { distance: number; x: number; y: number } | null = null;
let rightPointerDown: { x: number; y: number; at: number } | null = null;
let lastFrameAt = performance.now();
let lastCollisionCheckAt = 0;
const keys = new Set(["KeyA", "KeyD", "KeyW", "KeyS", "KeyQ", "KeyE", "KeyR", "KeyF", "ShiftLeft", "ShiftRight"]);

function updateHeading() {
  camera.getWorldDirection(forward);
  if (forward.x * forward.x + forward.y * forward.y > 0.0001) {
    heading = Math.atan2(forward.x, forward.y);
  }
}

function setView(position: THREE.Vector3, target: THREE.Vector3) {
  camera.position.copy(position);
  camera.lookAt(target);
  updateHeading();
}

function rotateCamera(quaternion: THREE.Quaternion, pivot?: THREE.Vector3) {
  if (pivot) camera.position.sub(pivot).applyQuaternion(quaternion).add(pivot);
  camera.quaternion.premultiply(quaternion);
}

function pickOrbitPivot(event: PointerEvent) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  let nearest: THREE.Vector3 | null = null;
  const visibleScans = [
    { model: scanModel, visible: (selectedScan === "bs17-loftet" ? showLoft : singleVisibility).value !== "hidden" },
    { model: adjacentModel, visible: showHendrix.value !== "hidden" },
    { model: outdoorLccModel, visible: extraScanControls["183256"].visibility.value !== "hidden" },
    ...[...catalogControls.values()].map(({ model, visibility }) => ({ model, visible: visibility.value !== "hidden" })),
  ];
  for (const { model, visible } of visibleScans) {
    if (!model || !visible) continue;
    try {
      const hit = model.raycast({ evt: { x, y }, maxDistance: 1000, radius: 0.25 });
      if (!hit) continue;
      const point = new THREE.Vector3(hit.x, hit.y, hit.z);
      if (!nearest || point.distanceToSquared(camera.position) < nearest.distanceToSquared(camera.position)) nearest = point;
    } catch (error) {
      console.warn("Kunne ikke velge treffpunkt i skannlaget", error);
    }
  }
  if (nearest) return nearest;

  // Empty pixels still get a stable pivot at the scan's approximate depth.
  raycaster.setFromCamera(new THREE.Vector2(x / rect.width * 2 - 1, 1 - y / rect.height * 2), camera);
  camera.getWorldDirection(forward);
  pickPlane.setFromNormalAndCoplanarPoint(forward, scanCenter);
  return raycaster.ray.intersectPlane(pickPlane, new THREE.Vector3()) ?? scanCenter.clone();
}

function pickNoiseMaskPoint(event: PointerEvent): THREE.Vector3 | null {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  // A horizontal drawing plane makes the 2D polygon match the pointer even
  // where there are no splats. The resulting mask is a vertical XY prism.
  raycaster.setFromCamera(new THREE.Vector2(x / rect.width * 2 - 1, 1 - y / rect.height * 2), camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -scanCenter.z);
  const point = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  return point && point.distanceTo(scanCenter) < 500 ? point : null;
}

function updateCollisionAvailability() {
  const available = Boolean(scanModel?.hasCollision() && scanModel.intersectsSphere);
  collision.disabled = !available;
  if (!available) collision.checked = false;
  collisionStatus.textContent = available
    ? (collision.checked ? "På: kameraet stopper ved kollisjonsflater." : "Klar. Slå på for motstand ved vegger.")
    : "Kollisjonsdata er ikke klare for dette skannet.";
}
collision.addEventListener("change", updateCollisionAvailability);

function moveCamera(displacement: THREE.Vector3) {
  if (!collision.checked || !scanModel?.intersectsSphere) {
    camera.position.add(displacement);
    return;
  }
  const steps = Math.max(1, Math.ceil(displacement.length() / 0.25));
  collisionStep.copy(displacement).multiplyScalar(1 / steps);
  for (let index = 0; index < steps; index += 1) {
    collisionCandidate.copy(camera.position).add(collisionStep);
    const result = scanModel.intersectsSphere({
      center: collisionCandidate,
      radius: 0.35,
      noDelta: true,
    });
    if (result?.hit) break;
    camera.position.copy(collisionCandidate);
  }
}

renderer.domElement.addEventListener("pointerdown", (event) => {
  if (!sectionPickPending && sectionMode !== "axes" && sectionTransform?.axis) return;
  if (event.pointerType === "touch") {
    touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    renderer.domElement.setPointerCapture(event.pointerId);
    if (touchPointers.size >= 2) {
      const [a, b] = [...touchPointers.values()];
      touchGesture = { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      panDepth = Math.max(camera.position.distanceTo(orbitPivot), 0.5);
      dragMode = null;
      bimPointerDown = null;
      noiseMaskPointerDown = null;
      sectionPickStart = null;
      event.preventDefault();
      return;
    }
  }
  if (event.button !== 0 && event.button !== 2) return;
  if (sectionPickPending && event.button === 0) {
    sectionPickStart = { x: event.clientX, y: event.clientY };
    dragMode = null;
    renderer.domElement.focus();
    event.preventDefault();
    return;
  }
  if (noiseMaskPicking && event.button === 0) {
    noiseMaskPointerDown = { x: event.clientX, y: event.clientY };
    bimPointerDown = null;
    renderer.domElement.focus();
    return;
  }
  bimPointerDown = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
  if (bubbleActive) {
    dragMode = "bubble";
  } else if (event.button === 0) {
    const pivot = pickOrbitPivot(event);
    orbitPivot.copy(pivot);
    dragMode = "orbit";
  } else {
    rightPointerDown = { x: event.clientX, y: event.clientY, at: performance.now() };
    const pivot = pickOrbitPivot(event);
    panDepth = Math.max(camera.position.distanceTo(pivot), 0.5);
    dragMode = "pan";
    event.preventDefault();
  }
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  renderer.domElement.focus();
});
window.addEventListener("pointermove", (event) => {
  if (sectionGizmoDragging) return;
  if (event.pointerType === "touch" && touchPointers.has(event.pointerId)) {
    touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touchPointers.size >= 2 && touchGesture) {
      const [a, b] = [...touchPointers.values()];
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const centerX = (a.x + b.x) / 2;
      const centerY = (a.y + b.y) / 2;
      const zoom = Math.log(distance / Math.max(1, touchGesture.distance));
      if (bubbleActive) {
        panoramaCamera.fov = THREE.MathUtils.clamp(panoramaCamera.fov - zoom * 55, 40, 100);
        panoramaCamera.updateProjectionMatrix();
      } else {
        const scale = 2 * panDepth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.max(1, renderer.domElement.clientHeight);
        right.set(1, 0, 0).applyQuaternion(camera.quaternion);
        up.set(0, 1, 0).applyQuaternion(camera.quaternion);
        panStep.copy(right).multiplyScalar(-(centerX - touchGesture.x) * scale)
          .addScaledVector(up, (centerY - touchGesture.y) * scale);
        moveCamera(panStep);
        camera.getWorldDirection(forward);
        const zoomDistance = THREE.MathUtils.clamp(zoom, -0.35, 0.35) * panDepth * 1.35;
        moveCamera(move.copy(forward).multiplyScalar(zoomDistance));
        panDepth = Math.max(0.5, panDepth - zoomDistance);
      }
      touchGesture = { distance, x: centerX, y: centerY };
      event.preventDefault();
      return;
    }
  }
  if (!dragMode) return;
  const deltaX = event.clientX - lastPointerX;
  const deltaY = event.clientY - lastPointerY;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  if (dragMode === "bubble") {
    bubbleYaw -= deltaX * 0.004;
    bubblePitch = THREE.MathUtils.clamp(bubblePitch + deltaY * 0.004, -1.45, 1.45);
    updateBubbleDirection();
  } else if (dragMode === "orbit") {
    if (deltaX) rotateCamera(rotation.setFromAxisAngle(worldZ, -deltaX * 0.003), orbitPivot);
    if (deltaY) {
      right.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
      rotateCamera(rotation.setFromAxisAngle(right, -deltaY * 0.003), orbitPivot);
    }
    updateHeading();
  } else {
    const scale = 2 * panDepth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / renderer.domElement.clientHeight;
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    panStep.copy(right).multiplyScalar(-deltaX * scale).addScaledVector(up, deltaY * scale);
    moveCamera(panStep);
  }
});
window.addEventListener("pointerup", () => {
  dragMode = null;
});
renderer.domElement.addEventListener("pointerup", (event) => {
  if (event.pointerType === "touch") {
    const hadGesture = touchGesture !== null;
    touchPointers.delete(event.pointerId);
    if (touchPointers.size < 2) touchGesture = null;
    if (hadGesture) { dragMode = null; bimPointerDown = null; noiseMaskPointerDown = null; return; }
  }
  if (sectionPickPending && event.button === 0) {
    const start = sectionPickStart;
    sectionPickStart = null;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8) {
      const rect = renderer.domElement.getBoundingClientRect();
      if (placeSectionFromTap?.(event.clientX - rect.left, event.clientY - rect.top)) stopSectionPick();
      else sectionPickHint.querySelector("span")!.textContent = "Fant ingen overflate her. Trykk på en synlig del av modellen.";
    }
    return;
  }
  if (event.button === 2) {
    const start = rightPointerDown;
    rightPointerDown = null;
    if (start && !bubbleActive && !noiseMaskPicking &&
      performance.now() - start.at < 300 && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6)
      showModelContextMenu(event.clientX, event.clientY);
    return;
  }
  if (noiseMaskPicking && event.button === 0) {
    const start = noiseMaskPointerDown;
    noiseMaskPointerDown = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    const point = pickNoiseMaskPoint(event);
    if (!point) {
      noiseMaskStatus.textContent = "Fant ikke et punkt her. Se mer ovenfra og prøv igjen.";
      return;
    }
    const vertices = noiseMaskPicking.vertices;
    const first = vertices[0];
    if (first && vertices.length >= 3) {
      const firstScreen = first.clone().project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      const firstX = rect.left + (firstScreen.x + 1) * rect.width / 2;
      const firstY = rect.top + (1 - firstScreen.y) * rect.height / 2;
      if (Math.hypot(event.clientX - firstX, event.clientY - firstY) <= 18) {
        finishNoiseMask();
        return;
      }
    }
    if (vertices.some((vertex) => vertex.distanceTo(point) < 0.5)) {
      noiseMaskStatus.textContent = "Velg neste hjørne litt lenger unna, eller klikk på det grønne startpunktet for å avslutte.";
      return;
    }
    if (vertices.length >= MAX_NOISE_MASK_VERTICES) {
      noiseMaskStatus.textContent = `Maks ${MAX_NOISE_MASK_VERTICES} hjørner. Klikk på startpunktet for å avslutte.`;
      return;
    }
    vertices.push(point);
    updateNoiseMaskOverlay();
    noiseMaskUndo.disabled = false;
    noiseMaskStatus.textContent = vertices.length < 3 ?
      `Hjørne ${vertices.length} er valgt. Legg til minst ${3 - vertices.length} til.` :
      `${vertices.length} hjørner. Klikk på det grønne startpunktet for å lukke linjen.`;
    return;
  }
  const start = bimPointerDown;
  bimPointerDown = null;
  if (!start || event.button !== 0 || bubbleActive || !bimModel?.object.visible) return;
  if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
  void bimModel.raycast({
    camera, mouse: new THREE.Vector2(event.clientX, event.clientY), dom: renderer.domElement,
  }).then((hit) => { if (hit) void selectBimObject(hit.localId); })
    .catch((error) => console.warn("Kunne ikke velge BIM-objekt", error));
});
window.addEventListener("pointercancel", (event) => {
  dragMode = null; noiseMaskPointerDown = null; rightPointerDown = null; sectionPickStart = null;
  touchPointers.delete(event.pointerId); touchGesture = null;
});
renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault());
renderer.domElement.addEventListener("wheel", (event) => {
  event.preventDefault();
  if (bubbleActive) {
    panoramaCamera.fov = THREE.MathUtils.clamp(panoramaCamera.fov + Math.sign(event.deltaY) * 4, 40, 100);
    panoramaCamera.updateProjectionMatrix();
    return;
  }
  camera.getWorldDirection(forward);
  const wheelNotches = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY / 3
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? event.deltaY
    : event.deltaY / 100;
  moveCamera(move.copy(forward).multiplyScalar(-THREE.MathUtils.clamp(wheelNotches, -3, 3) * wheelStep));
}, { passive: false });
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!bubbleControls.hidden) closeBubble();
    else hidePointAnnotation();
  }
  if (!keys.has(event.code) || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target instanceof HTMLElement && event.target.closest("input, select, button, textarea, a, [contenteditable]")) return;
  pressed.add(event.code);
  event.preventDefault();
});
window.addEventListener("keyup", (event) => { pressed.delete(event.code); });
window.addEventListener("blur", () => { pressed.clear(); dragMode = null; });
document.addEventListener("visibilitychange", () => { if (document.hidden) pressed.clear(); });

function updateNavigation(deltaSeconds: number) {
  if (bubbleActive) return;
  const turn = 1.25 * deltaSeconds;
  const yawTurn = Number(pressed.has("KeyE")) - Number(pressed.has("KeyQ"));
  if (yawTurn) rotateCamera(rotation.setFromAxisAngle(worldZ, yawTurn * turn));
  const pitchTurn = Number(pressed.has("KeyR")) - Number(pressed.has("KeyF"));
  if (pitchTurn) {
    right.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    rotateCamera(rotation.setFromAxisAngle(right, pitchTurn * turn));
  }
  if (yawTurn || pitchTurn) updateHeading();

  move.set(0, 0, 0);
  if (pressed.has("KeyW")) move.y += 1;
  if (pressed.has("KeyS")) move.y -= 1;
  if (pressed.has("KeyD")) move.x += 1;
  if (pressed.has("KeyA")) move.x -= 1;
  if (move.lengthSq()) {
    move.normalize();
    const x = move.x * Math.cos(heading) + move.y * Math.sin(heading);
    const y = -move.x * Math.sin(heading) + move.y * Math.cos(heading);
    const sprint = pressed.has("ShiftLeft") || pressed.has("ShiftRight") ? 3 : 1;
    moveCamera(move.set(x, y, 0).multiplyScalar(moveSpeed * sprint * deltaSeconds));
  }
}

function resize() {
  const width = host.clientWidth;
  const height = host.clientHeight;
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  panoramaCamera.aspect = width / height;
  panoramaCamera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function hidePointAnnotation() {
  if (!bubbleControls.hidden) closeBubble();
  annotation.hidden = true;
  annotationImage.removeAttribute("src");
  activePoint = null;
}

function photosFor(point: ScanPoint): PointPhotoData | null {
  if (point.sourceCaptureId === "152958") return hendrixPhotos;
  if (point.sourceCaptureId === "112646" || point.sourceCaptureId === "183256") {
    return extraPhotos[point.sourceCaptureId] ?? (captureId === point.sourceCaptureId ? pointPhotos : null);
  }
  return pointPhotos;
}

function photoUrl(photo: PointPhoto, point: ScanPoint) {
  const encodedPath = photo.path.split("/").map(encodeURIComponent).join("/");
  if ((point.sourceCaptureId ?? captureId) === "180322") {
    return new URL(`local-scan/bs17/info/${encodedPath}`, document.baseURI).href;
  }
  return new URL(`local-scan/bs17-${point.sourceCaptureId ?? captureId}-photo/${encodedPath}`, document.baseURI).href;
}

function renderPhotoZoom() {
  const limitX = (photoScale - 1) * photoViewport.clientWidth / 2;
  const limitY = (photoScale - 1) * photoViewport.clientHeight / 2;
  photoOffsetX = THREE.MathUtils.clamp(photoOffsetX, -limitX, limitX);
  photoOffsetY = THREE.MathUtils.clamp(photoOffsetY, -limitY, limitY);
  annotationImage.style.transform = `translate(${photoOffsetX}px, ${photoOffsetY}px) scale(${photoScale})`;
  photoZoomLevel.textContent = `${Math.round(photoScale * 100)} %`;
  zoomOut.disabled = photoScale <= 1;
  zoomIn.disabled = photoScale >= 6;
}

function setPhotoZoom(scale: number) {
  photoScale = THREE.MathUtils.clamp(scale, 1, 6);
  if (photoScale === 1) { photoOffsetX = 0; photoOffsetY = 0; }
  renderPhotoZoom();
}

zoomOut.addEventListener("click", () => setPhotoZoom(photoScale / 1.4));
zoomIn.addEventListener("click", () => setPhotoZoom(photoScale * 1.4));
document.querySelector<HTMLButtonElement>("#photo-zoom-reset")!.addEventListener("click", () => setPhotoZoom(1));
photoViewport.addEventListener("wheel", (event) => {
  event.preventDefault();
  setPhotoZoom(photoScale * (event.deltaY < 0 ? 1.25 : 0.8));
}, { passive: false });
photoViewport.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || photoScale <= 1) return;
  photoDrag = { x: event.clientX, y: event.clientY, offsetX: photoOffsetX, offsetY: photoOffsetY };
  event.preventDefault();
});
window.addEventListener("pointermove", (event) => {
  if (!photoDrag) return;
  photoOffsetX = photoDrag.offsetX + event.clientX - photoDrag.x;
  photoOffsetY = photoDrag.offsetY + event.clientY - photoDrag.y;
  renderPhotoZoom();
});
window.addEventListener("pointerup", () => { photoDrag = null; });
photoViewport.addEventListener("dblclick", () => setPhotoZoom(1));

function renderPointPhoto() {
  if (!activePoint) return;
  const photos = photosFor(activePoint)?.photos[activePoint.label] ?? [];
  const photo = photos[activePhotoIndex];
  if (!photo) return;
  annotationImage.src = photoUrl(photo, activePoint);
  annotationImage.alt = `${photo.camera === 2 ? "Frontbilde" : "Fisheye-bilde"} fra ${activePoint.label}`;
  annotationCaption.textContent = `Kamera ${photo.camera} · ${photo.camera === 2 ? "2D frontkamera" : "180° fisheye"}`;
  setPhotoZoom(1);
  photoCount.textContent = `${activePhotoIndex + 1} / ${photos.length}`;
  photoPrev.disabled = activePhotoIndex === 0;
  photoNext.disabled = activePhotoIndex === photos.length - 1;
}

function showPointAnnotation(point: ScanPoint) {
  activePoint = point;
  const photos = photosFor(point)?.photos[point.label] ?? [];
  activePhotoIndex = Math.max(0, photos.findIndex((photo) => photo.camera === 2));
  document.querySelector<HTMLButtonElement>("#gcp-open-bubble")!.hidden =
    photos.filter((photo) => photo.camera === 0 || photo.camera === 1).length !== 2;
  annotationTitle.textContent = `${point.kind} · ${point.label} · ${point.sourceCaptureId ?? captureId}`;
  annotationStatus.textContent = point.kind === "GCP"
    ? (point.gnss.status === 4 ? "GNSS 4 · RTK fixed" :
      point.gnss.status === 1 ? "GNSS 1 · single, ikke RTK" : `GNSS ${point.gnss.status ?? "ukjent"} · ikke RTK fixed`)
    : `${point.kind}-punkt · lokalt skannkoordinat`;
  annotationNote.textContent = (point.sourceCaptureId ?? captureId) === "180322"
    ? "Boiler room-punktet har ett frontbilde og lokal plassering. Kobling mot andre opptak er ikke bekreftet."
    : (point.sourceCaptureId ?? captureId) === "102311"
    ? "Dette er et avbrutt testopptak uten RTK fixed. Bildene dokumenterer punktet, men siktemerket er ikke nødvendigvis tydelig i hvert bilde."
    : point.sourceCaptureId === "112646" || point.sourceCaptureId === "183256"
      ? "Punktet er plassert i Loftets visning med en foreløpig koordinattilpasning. Bildet dokumenterer markeringen; felles punktidentitet og absolutt nøyaktighet må kontrolleres separat."
    : `Bildene kommer fra punktet i opptak ${point.sourceCaptureId ?? captureId}. 360°-boblen er foreløpig sydd fra de to fisheye-bildene uten kalibrert søm eller retning.`;
  annotation.hidden = false;
  renderPointPhoto();
}

document.querySelector<HTMLButtonElement>("#gcp-annotation-close")!.addEventListener("click", hidePointAnnotation);
photoPrev.addEventListener("click", () => { if (activePhotoIndex > 0) { activePhotoIndex -= 1; renderPointPhoto(); } });
photoNext.addEventListener("click", () => {
  if (activePoint && activePhotoIndex < (photosFor(activePoint)?.photos[activePoint.label]?.length ?? 0) - 1) {
    activePhotoIndex += 1;
    renderPointPhoto();
  }
});
annotationImage.addEventListener("error", () => { annotationCaption.textContent = "Bildet kunne ikke åpnes fra den lokale rådatamappen."; });

function closeBubble() {
  bubbleRequest += 1;
  bubbleActive = false;
  pointOverlay.hidden = false;
  bubbleControls.hidden = true;
  if (panoramaMesh) {
    panoramaScene.remove(panoramaMesh);
    panoramaMesh.geometry.dispose();
    (panoramaMesh.material as THREE.Material).dispose();
    panoramaMesh = null;
  }
  for (const texture of panoramaTextures) texture.dispose();
  panoramaTextures = [];
  if (activePoint) annotation.hidden = false;
}

async function openBubble() {
  if (!activePoint) return;
  const fisheyes = photosFor(activePoint)?.photos[activePoint.label]?.filter((photo) => photo.camera === 0 || photo.camera === 1) ?? [];
  if (fisheyes.length !== 2) return;
  const request = ++bubbleRequest;
  const point = activePoint;
  bubbleTitle.textContent = `${point.kind} · ${point.label} · laster bildeboble …`;
  bubbleControls.hidden = false;
  annotation.hidden = true;
  try {
    const textures = await Promise.all(fisheyes.map((photo) => new THREE.TextureLoader().loadAsync(photoUrl(photo, point))));
    if (request !== bubbleRequest) { textures.forEach((texture) => texture.dispose()); return; }
    panoramaTextures = textures;
    for (const texture of textures) texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.ShaderMaterial({
      uniforms: { image0: { value: textures[0] }, image1: { value: textures[1] } },
      side: THREE.BackSide,
      vertexShader: `varying vec3 vDirection;
        void main() { vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D image0; uniform sampler2D image1; varying vec3 vDirection;
        void main() {
          vec3 d = normalize(vDirection);
          bool back = d.y < 0.0;
          vec3 h = back ? vec3(-d.x, d.z, -d.y) : vec3(d.x, d.z, d.y);
          float theta = acos(clamp(h.z, -1.0, 1.0));
          float radius = theta / 1.57079632679;
          vec2 xy = length(h.xy) > 0.00001 ? normalize(h.xy) * radius : vec2(0.0);
          vec2 uv = vec2(0.5 + xy.x * 0.375, 0.5 + xy.y * 0.5);
          gl_FragColor = back ? texture2D(image1, uv) : texture2D(image0, uv);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    panoramaMesh = new THREE.Mesh(new THREE.SphereGeometry(20, 64, 32), material);
    panoramaScene.add(panoramaMesh);
    bubbleYaw = 0;
    bubblePitch = 0;
    panoramaCamera.fov = 75;
    panoramaCamera.updateProjectionMatrix();
    updateBubbleDirection();
    bubbleActive = true;
    pointOverlay.hidden = true;
    bubbleTitle.textContent = `${point.kind} · ${point.label} · 360°`;
  } catch (error) {
    bubbleControls.hidden = true;
    annotation.hidden = false;
    annotationCaption.textContent = `Bildeboblen kunne ikke lastes: ${error instanceof Error ? error.message : String(error)}`;
  }
}
document.querySelector<HTMLButtonElement>("#gcp-open-bubble")!.addEventListener("click", () => { void openBubble(); });
document.querySelector<HTMLButtonElement>("#bubble-close")!.addEventListener("click", closeBubble);

const pointScreenPosition = new THREE.Vector3();
function scanSeparationActive() {
  return Boolean(adjacentModel && showLoft.value !== "hidden" && showHendrix.value !== "hidden" && separateScans.checked);
}

function sourceMarkersVisible(point: ScanPoint) {
  if (point.sourceCaptureId === "152958") return showHendrixPoints.checked;
  if (point.sourceCaptureId === "112646" || point.sourceCaptureId === "183256") {
    return extraScanControls[point.sourceCaptureId].markers.checked;
  }
  return selectedScan !== "bs17-loftet" || showLoftPoints.checked;
}

function withinNoiseMask(id: string, world: THREE.Vector3) {
  const mask = maskFor(id);
  if (!mask?.enabled) return true;
  const { minX, maxX, minY, maxY } = maskLimits(mask);
  if (world.x < minX || world.x > maxX || world.y < minY || world.y > maxY) return false;
  let inside = false;
  for (let index = 0; index < mask.vertices.length; index += 1) {
    const a = mask.vertices[index];
    const b = mask.vertices[(index + 1) % mask.vertices.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = THREE.MathUtils.clamp(((world.x - a[0]) * dx + (world.y - a[1]) * dy) /
      Math.max(dx * dx + dy * dy, 0.0001), 0, 1);
    if (Math.hypot(world.x - a[0] - t * dx, world.y - a[1] - t * dy) <= mask.margin) return true;
    if ((a[1] > world.y) !== (b[1] > world.y) &&
        world.x < dx * (world.y - a[1]) / dy + a[0]) inside = !inside;
  }
  return inside;
}

function updatePointTargets() {
  if (pointOverlay.hidden || !pointButtons.length) return;
  camera.updateMatrixWorld();
  const width = host.clientWidth;
  const height = host.clientHeight;
  const separate = scanSeparationActive();
  const splitHeight = Number(scanSeparationHeight.value);
  for (const { point, button, world } of pointButtons) {
    pointScreenPosition.copy(world).project(camera);
    const visible = pointGroups[point.kind].visible &&
      sectionPlanes.every((plane) => plane.distanceToPoint(world) >= -0.01) &&
      withinNoiseMask(point.sourceCaptureId ?? primaryLayerId, world) &&
      sourceMarkersVisible(point) &&
      (!separate || (point.sourceCaptureId === "152958" ? world.z >= splitHeight : world.z <= splitHeight)) &&
      pointScreenPosition.z > -1 && pointScreenPosition.z < 1 &&
      Math.abs(pointScreenPosition.x) <= 1.02 && Math.abs(pointScreenPosition.y) <= 1.02;
    button.hidden = !visible;
    if (!visible) continue;
    button.style.left = `${(pointScreenPosition.x + 1) * width / 2}px`;
    button.style.top = `${(1 - pointScreenPosition.y) * height / 2}px`;
  }
}

// XGRIDS 0.6.3 exposes box clipping only. Add a small per-fragment polygon
// test to its splat ShaderMaterials while retaining the SDK box as a coarse cull.
const polygonUniforms = `
        uniform int hemyPolygonCount;
        uniform vec2 hemyPolygon[${MAX_NOISE_MASK_VERTICES}];
        uniform float hemyPolygonMargin;
`;
const polygonFunction = `
        bool hemyInsidePolygon(vec2 point) {
            bool inside = false;
            for (int i = 0; i < ${MAX_NOISE_MASK_VERTICES}; i++) {
                if (i >= hemyPolygonCount) break;
                int j = (i + 1 == hemyPolygonCount) ? 0 : i + 1;
                vec2 a = hemyPolygon[i];
                vec2 b = hemyPolygon[j];
                vec2 edge = b - a;
                float t = clamp(dot(point - a, edge) / max(dot(edge, edge), 0.0001), 0.0, 1.0);
                if (distance(point, a + t * edge) <= hemyPolygonMargin) return true;
                if ((a.y > point.y) != (b.y > point.y) &&
                    point.x < edge.x * (point.y - a.y) / edge.y + a.x) inside = !inside;
            }
            return inside;
        }
`;
function syncModelPolygonClip(model: LccObject, id: NoiseMaskId) {
  const mask = maskFor(id);
  let patched = 0;
  (model.getInstancedMesh() as THREE.Group).traverse((object) => {
    const material = (object as THREE.Mesh).material;
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    for (const item of materials) {
      if (!(item instanceof THREE.ShaderMaterial)) continue;
      if (!item.fragmentShader.includes("splatVsBox(vp, use1[1])")) continue;
      if (!item.fragmentShader.includes("hemyInsidePolygon")) {
        if (!mask?.enabled) continue;
        const withUniforms = item.fragmentShader.replace("        in mediump vec4 vColor;",
          `${polygonUniforms}\n        in mediump vec4 vColor;`);
        const withFunction = withUniforms.replace("        void main () {",
          `${polygonFunction}\n        void main () {`);
        if (withFunction === item.fragmentShader || !withFunction.includes("hemyInsidePolygon")) continue;
        item.fragmentShader = withFunction.replace("            A = exp(A) * alpha;",
          "            if (hemyPolygonCount >= 3 && !hemyInsidePolygon(vp.xy)) discard;\n            A = exp(A) * alpha;");
        item.uniforms.hemyPolygonCount = { value: 0 };
        item.uniforms.hemyPolygon = { value: Array.from({ length: MAX_NOISE_MASK_VERTICES }, () => new THREE.Vector2()) };
        item.uniforms.hemyPolygonMargin = { value: 0 };
        item.needsUpdate = true;
      }
      const points = item.uniforms.hemyPolygon.value as THREE.Vector2[];
      if (mask?.enabled) mask.vertices.forEach(([x, y], index) => points[index].set(x, y));
      item.uniforms.hemyPolygonCount.value = mask?.enabled ? mask.vertices.length : 0;
      item.uniforms.hemyPolygonMargin.value = mask?.enabled ? mask.margin : 0;
      patched += 1;
    }
  });
  if (patched) polygonClipReady.add(id);
  else polygonClipReady.delete(id);
}

function addBoxSectionPlanes(box: THREE.Mesh) {
  box.updateMatrixWorld(true);
  const half = box.scale.clone().multiplyScalar(0.5);
  for (let axis = 0; axis < 3; axis += 1) {
    for (const sign of [-1, 1]) {
      const outward = new THREE.Vector3().setComponent(axis, sign).applyQuaternion(box.quaternion);
      const point = new THREE.Vector3().setComponent(axis, sign * half.getComponent(axis))
        .applyQuaternion(box.quaternion).add(box.position);
      sectionPlanes.push(new THREE.Plane().setFromNormalAndCoplanarPoint(outward.negate(), point));
    }
  }
}

function scanClipBox() {
  if (sectionMode !== "box" || !sectionBoxMesh) return null;
  return {
    position: sectionBoxMesh.position.toArray(),
    scale: sectionBoxMesh.scale.toArray(),
    rotation: [sectionBoxMesh.rotation.x, sectionBoxMesh.rotation.y, sectionBoxMesh.rotation.z],
    clipSide: 1,
  };
}

function updateSection() {
  if (!sectionBounds) return;
  const low = sectionBounds.min.clone().addScalar(-100);
  const high = sectionBounds.max.clone().addScalar(100);
  sectionPlanes.length = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const control = sectionControls[axis];
    const position = Number(control.position.value);
    control.value.textContent = `${position.toFixed(1)} m`;
    if (sectionMode !== "axes" || !control.enabled.checked) continue;
    const normal = new THREE.Vector3().setComponent(axis, control.side.value === "low" ? -1 : 1);
    sectionPlanes.push(new THREE.Plane(normal, control.side.value === "low" ? position : -position));
    if (control.side.value === "low") high.setComponent(axis, position);
    else low.setComponent(axis, position);
  }
  if (sectionMode === "plane" && sectionPlaneReady && sectionPlaneMesh && !sectionPickPending) {
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(sectionPlaneMesh.quaternion).normalize();
    if (document.querySelector<HTMLSelectElement>("#section-plane-side")!.value === "negative") normal.negate();
    sectionPlanes.push(new THREE.Plane().setFromNormalAndCoplanarPoint(normal, sectionPlaneMesh.position));
  }
  if (sectionMode === "box" && sectionBoxMesh) addBoxSectionPlanes(sectionBoxMesh);
  if (selectedScan === "bs17-loftet" && sectionControls[2]) {
    const z = sectionControls[2];
    const atSplit = Math.abs(Number(z.position.value) - 3.5) < 0.051;
    const active = !z.enabled.checked ? "both" : atSplit ? (z.side.value === "low" ? "loft" : "hendrix") : "custom";
    for (const button of heightView.querySelectorAll<HTMLButtonElement>("button[data-height-view]")) {
      button.setAttribute("aria-pressed", String(button.dataset.heightView === active));
    }
    heightViewStatus.textContent = active === "both" ? "Viser begge nivåer. Foreløpig skille ved 3,5 m i skannets lokale høyde." :
      active === "loft" ? "Viser geometri under 3,5 m fra begge skann og BIM." :
        active === "hendrix" ? "Viser geometri over 3,5 m fra begge skann og BIM." :
          `Egendefinert høydegrense ved ${Number(z.position.value).toFixed(1)} m.`;
  }
  renderer.clippingPlanes = sectionPlanes;
  const separate = sectionMode !== "box" && scanSeparationActive();
  const splitHeight = Number(scanSeparationHeight.value);
  for (const [model, source] of [[scanModel, "loft"], [adjacentModel, "hendrix"]] as const) {
    if (!model) continue;
    const modelLow = low.clone();
    const modelHigh = high.clone();
    if (separate && source === "loft") modelHigh.z = Math.min(modelHigh.z, splitHeight);
    if (separate && source === "hendrix") modelLow.z = Math.max(modelLow.z, splitHeight);
    const mask = maskFor(source === "loft" ? primaryLayerId : "152958");
    syncModelPolygonClip(model, source === "loft" ? primaryLayerId as NoiseMaskId : "152958");
    if (mask?.enabled) {
      const { minX, maxX, minY, maxY } = maskLimits(mask);
      modelLow.x = Math.max(modelLow.x, minX);
      modelHigh.x = Math.min(modelHigh.x, maxX);
      modelLow.y = Math.max(modelLow.y, minY);
      modelHigh.y = Math.min(modelHigh.y, maxY);
    }
    const hasVolume = modelLow.x < modelHigh.x && modelLow.y < modelHigh.y && modelLow.z < modelHigh.z;
    const visibility = source === "loft"
      ? (selectedScan !== "bs17-loftet" ? singleVisibility.value : showLoft.value)
      : showHendrix.value;
    model.setVisible(visibility !== "hidden" && hasVolume);
    model.setAlpha(visibility === "ghost" ? 0.2 : 1);
    if (scanClipBox()) model.setClipBox(scanClipBox()!);
    else if (!sectionPlanes.length && !separate && !mask?.enabled) model.setClipBox();
    else if (hasVolume) model.setClipBox({
      position: modelLow.clone().add(modelHigh).multiplyScalar(0.5).toArray(),
      scale: modelHigh.clone().sub(modelLow).toArray(),
      rotation: [0, 0, 0],
      clipSide: 1,
    });
  }
  if (outdoorLccModel) {
    const visible = extraScanControls["183256"].visibility.value;
    const outdoorLow = low.clone();
    const outdoorHigh = high.clone();
    const mask = maskFor("183256");
    syncModelPolygonClip(outdoorLccModel, "183256");
    if (mask?.enabled) {
      const { minX, maxX, minY, maxY } = maskLimits(mask);
      outdoorLow.x = Math.max(outdoorLow.x, minX);
      outdoorHigh.x = Math.min(outdoorHigh.x, maxX);
      outdoorLow.y = Math.max(outdoorLow.y, minY);
      outdoorHigh.y = Math.min(outdoorHigh.y, maxY);
    }
    const hasVolume = outdoorLow.x < outdoorHigh.x && outdoorLow.y < outdoorHigh.y && outdoorLow.z < outdoorHigh.z;
    outdoorLccModel.setVisible(visible !== "hidden" && hasVolume);
    outdoorLccModel.setAlpha(visible === "ghost" ? 0.2 : 1);
    if (scanClipBox()) outdoorLccModel.setClipBox(scanClipBox()!);
    else if (!sectionPlanes.length && !mask?.enabled) outdoorLccModel.setClipBox();
    else if (hasVolume) outdoorLccModel.setClipBox({
      position: outdoorLow.clone().add(outdoorHigh).multiplyScalar(0.5).toArray(),
      scale: outdoorHigh.clone().sub(outdoorLow).toArray(), rotation: [0, 0, 0], clipSide: 1,
    });
  }
  for (const [id, controls] of catalogControls) {
    const model = controls.model;
    if (!model) continue;
    const modelLow = low.clone();
    const modelHigh = high.clone();
    const mask = maskFor(id);
    syncModelPolygonClip(model, id);
    if (mask?.enabled) {
      const { minX, maxX, minY, maxY } = maskLimits(mask);
      modelLow.x = Math.max(modelLow.x, minX);
      modelHigh.x = Math.min(modelHigh.x, maxX);
      modelLow.y = Math.max(modelLow.y, minY);
      modelHigh.y = Math.min(modelHigh.y, maxY);
    }
    const hasVolume = modelLow.x < modelHigh.x && modelLow.y < modelHigh.y && modelLow.z < modelHigh.z;
    model.setVisible(controls.visibility.value !== "hidden" && hasVolume);
    model.setAlpha(controls.visibility.value === "ghost" ? 0.2 : 1);
    if (scanClipBox()) model.setClipBox(scanClipBox()!);
    else if (!sectionPlanes.length && !mask?.enabled) model.setClipBox();
    else if (hasVolume) model.setClipBox({
      position: modelLow.clone().add(modelHigh).multiplyScalar(0.5).toArray(),
      scale: modelHigh.clone().sub(modelLow).toArray(), rotation: [0, 0, 0], clipSide: 1,
    });
  }
  syncNoiseMaskUi();
  updatePointTargets();
  if (bimFragments && bimModel) {
    if (sectionBimUpdate) clearTimeout(sectionBimUpdate);
    sectionBimUpdate = setTimeout(() => {
      sectionBimUpdate = null;
      void bimFragments?.update(true).catch((error) => console.warn("Kunne ikke oppdatere BIM-snitt", error));
    }, 90);
  }
}

function updateScanSectionPlane() {
  if (!sectionBounds) return;
  camera.updateMatrixWorld();
  const inverseViewProjection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert().transpose();
  const apply = (model: LccObject | null, worldPlane: THREE.Plane | null) => {
    if (!model) return;
    if (!worldPlane) {
      if (scanClipCache.get(model) !== "none") {
        model.setClipPlane(undefined as unknown as number[], 0);
        scanClipCache.set(model, "none");
      }
      return;
    }
    const clip = new THREE.Vector4(worldPlane.normal.x, worldPlane.normal.y, worldPlane.normal.z, worldPlane.constant)
      .applyMatrix4(inverseViewProjection);
    const length = Math.hypot(clip.x, clip.y, clip.z);
    if (!Number.isFinite(length) || length < 1e-10) return;
    const values = [clip.x / length, clip.y / length, clip.z / length, -clip.w / length];
    const key = values.map((value) => value.toFixed(5)).join(",");
    if (scanClipCache.get(model) === key) return;
    model.setClipPlane(values.slice(0, 3), values[3]);
    scanClipCache.set(model, key);
  };
  const freePlane = sectionMode === "plane" ? sectionPlanes[0] ?? null : null;
  const splitHeight = Number(scanSeparationHeight.value);
  const split = sectionMode === "box" && scanSeparationActive();
  apply(scanModel, freePlane ?? (split ? new THREE.Plane(new THREE.Vector3(0, 0, -1), splitHeight) : null));
  apply(adjacentModel, freePlane ?? (split ? new THREE.Plane(new THREE.Vector3(0, 0, 1), -splitHeight) : null));
  apply(outdoorLccModel, freePlane);
  for (const controls of catalogControls.values()) apply(controls.model, freePlane);
}

function setupSection(bounds: Bounds) {
  sectionBounds = new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max));
  sectionPanel.hidden = false;
  heightView.hidden = selectedScan !== "bs17-loftet";
  const names = ["X", "Y", "Snitthøyde"];
  for (let axis = 0; axis < 3; axis += 1) {
    const min = bounds.min[axis];
    const max = bounds.max[axis];
    const row = document.createElement("div");
    row.className = "section-axis";
    const head = document.createElement("div");
    head.className = "section-axis__head";
    const label = document.createElement("label");
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    label.append(enabled, document.createTextNode(names[axis]));
    const value = document.createElement("output");
    head.append(label, value);
    const position = document.createElement("input");
    position.type = "range";
    position.min = String(min);
    position.max = String(max);
    position.step = "0.1";
    position.value = String((min + max) / 2);
    position.setAttribute("aria-label", axis === 2 ? "Snitthøyde" : `Snittposisjon ${names[axis]}`);
    const side = document.createElement("select");
    side.setAttribute("aria-label", axis === 2 ? "Vis område ved snitthøyde" : `Behold side av ${names[axis]}`);
    side.append(new Option(axis === 2 ? "Vis under snittet" : "Behold lavere koordinat", "low"),
      new Option(axis === 2 ? "Vis over snittet" : "Behold høyere koordinat", "high"));
    row.append(head, position, side);
    if (axis === 2) sectionAxes.append(row);
    sectionControls.push({ enabled, position, side, value, min, max });
    enabled.addEventListener("change", updateSection);
    position.addEventListener("input", updateSection);
    side.addEventListener("change", updateSection);
  }
  const center = sectionBounds.getCenter(new THREE.Vector3());
  const size = sectionBounds.getSize(new THREE.Vector3());
  const extent = Math.max(size.x, size.y, size.z, 4);
  const sectionAnchor = center.clone();
  const viewFocus = () => {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const ground = new THREE.Plane(new THREE.Vector3(0, 0, 1), -scanCenter.z);
    const hit = raycaster.ray.intersectPlane(ground, new THREE.Vector3());
    return hit && hit.distanceTo(scanCenter) < 500 ? hit : scanCenter.clone();
  };
  const planeGeometry = new THREE.PlaneGeometry(extent * 1.4, extent * 1.4);
  sectionPlaneMesh = new THREE.Mesh(planeGeometry,
    new THREE.MeshBasicMaterial({ color: 0x3285e8, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  sectionPlaneMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(planeGeometry),
    new THREE.LineBasicMaterial({ color: 0x2877df, depthTest: false })));
  sectionPlaneMesh.position.copy(center);
  sectionPlaneMesh.visible = false;
  sectionOverlayScene.add(sectionPlaneMesh);

  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  sectionBoxMesh = new THREE.Mesh(boxGeometry,
    new THREE.MeshBasicMaterial({ color: 0x3285e8, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }));
  sectionBoxMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(boxGeometry),
    new THREE.LineBasicMaterial({ color: 0xe35a56, depthTest: false })));
  const fitBox = (useView = false) => {
    sectionBoxMesh!.position.copy(useView ? viewFocus() : center);
    sectionBoxMesh!.rotation.set(0, 0, 0);
    sectionBoxMesh!.scale.set(Math.max(Math.min(size.x, 30), 4), Math.max(Math.min(size.y, 30), 4), Math.max(Math.min(size.z, 20), 4));
    updateSection();
  };
  fitBox();
  sectionBoxMesh.visible = false;
  sectionOverlayScene.add(sectionBoxMesh);
  sectionTransform = new TransformControls(camera, renderer.domElement);
  sectionTransform.setSize(0.8);
  sectionTransform.addEventListener("mouseDown", () => { sectionGizmoDragging = true; dragMode = null; });
  sectionTransform.addEventListener("mouseUp", () => { sectionGizmoDragging = false; });
  sectionTransform.addEventListener("objectChange", () => {
    if (sectionMode === "plane" && sectionPlaneMesh) {
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(sectionPlaneMesh.quaternion);
      planeAzimuth.value = String(Math.round(THREE.MathUtils.radToDeg(Math.atan2(normal.y, normal.x))));
      planeTilt.value = String(Math.round(THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(normal.z, -1, 1)))));
      planeOffset.value = String(THREE.MathUtils.clamp(normal.dot(sectionPlaneMesh.position.clone().sub(sectionAnchor)),
        Number(planeOffset.min), Number(planeOffset.max)));
      syncPlaneOutputs();
    }
    updateSection();
  });
  sectionOverlayScene.add(sectionTransform.getHelper());

  const planeAzimuth = document.querySelector<HTMLInputElement>("#section-plane-azimuth")!;
  const planeTilt = document.querySelector<HTMLInputElement>("#section-plane-tilt")!;
  const planeOffset = document.querySelector<HTMLInputElement>("#section-plane-offset")!;
  planeOffset.min = String(-extent);
  planeOffset.max = String(extent);
  const syncPlaneOutputs = () => {
    document.querySelector<HTMLOutputElement>("#section-plane-azimuth-value")!.textContent = `${planeAzimuth.value}°`;
    document.querySelector<HTMLOutputElement>("#section-plane-tilt-value")!.textContent = `${planeTilt.value}°`;
    document.querySelector<HTMLOutputElement>("#section-plane-offset-value")!.textContent = `${Number(planeOffset.value).toFixed(1)} m`;
  };
  const setPlaneFromSliders = (activate = true) => {
    const azimuth = THREE.MathUtils.degToRad(Number(planeAzimuth.value));
    const tilt = THREE.MathUtils.degToRad(Number(planeTilt.value));
    const normal = new THREE.Vector3(Math.cos(tilt) * Math.cos(azimuth), Math.cos(tilt) * Math.sin(azimuth), Math.sin(tilt));
    sectionPlaneMesh!.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    sectionPlaneMesh!.position.copy(sectionAnchor).addScaledVector(normal, Number(planeOffset.value));
    if (activate) {
      sectionPlaneReady = true;
      if (sectionMode === "plane" && !sectionPickPending) {
        sectionPlaneMesh!.visible = true;
        sectionTransform!.attach(sectionPlaneMesh!);
      }
    }
    syncPlaneOutputs();
    updateSection();
  };
  planeTilt.value = "90";
  for (const slider of [planeAzimuth, planeTilt, planeOffset]) slider.addEventListener("input", () => setPlaneFromSliders());
  document.querySelector<HTMLSelectElement>("#section-plane-side")!.addEventListener("change", updateSection);
  setPlaneFromSliders(false);

  const axisTools = document.querySelector<HTMLElement>("#section-axis-tools")!;
  const planeTools = document.querySelector<HTMLElement>("#section-plane-tools")!;
  const boxTools = document.querySelector<HTMLElement>("#section-box-tools")!;
  const modeHelp = document.querySelector<HTMLElement>("#section-mode-help")!;
  const modeButtons = [...sectionPanel.querySelectorAll<HTMLButtonElement>("[data-section-mode]")];
  let planePlacedInView = false;
  let boxPlacedInView = false;
  function selectSectionMode(next: SectionMode) {
    if (next !== "plane") stopSectionPick();
    if (next === "plane" && !planePlacedInView) {
      sectionAnchor.copy(viewFocus());
      setPlaneFromSliders(false);
      planePlacedInView = true;
    }
    if (next === "box" && !boxPlacedInView) {
      fitBox(true);
      boxPlacedInView = true;
    }
    sectionMode = next;
    axisTools.hidden = next !== "axes";
    planeTools.hidden = next !== "plane";
    boxTools.hidden = next !== "box";
    sectionPlaneMesh!.visible = next === "plane" && sectionPlaneReady;
    sectionBoxMesh!.visible = next === "box";
    sectionTransform!.detach();
    if (next === "box" || (next === "plane" && sectionPlaneReady))
      sectionTransform!.attach(next === "plane" ? sectionPlaneMesh! : sectionBoxMesh!);
    sectionTransform!.setMode(next === "plane" ? "rotate" : "translate");
    modeHelp.textContent = next === "axes" ? "Horisontalt snitt. Velg høyde og hvilken side som skal vises." :
      next === "plane" ? (sectionPlaneReady ? "Roter planet med håndtaket i 3D eller velg retning og helning her." : "Velg en overflate i 3D for å plassere snittplanet.") :
        "Behold området innenfor boksen. Bruk håndtakene i 3D til å flytte, rotere og skalere.";
    for (const button of modeButtons) button.setAttribute("aria-pressed", String(button.dataset.sectionMode === next));
    updateSection();
  }
  function startSectionPick() {
    if (bubbleActive || !scanModel) return;
    selectSectionMode("plane");
    sectionPickPending = true;
    sectionPickStart = null;
    host.classList.add("section-picking");
    sectionPlaneMesh!.visible = false;
    sectionTransform!.detach();
    sectionPickHint.querySelector("span")!.textContent = "Trykk på en overflate for å plassere snittplanet.";
    sectionPickHint.hidden = false;
    updateSection();
    const mobileDialog = document.querySelector<HTMLDialogElement>("#mobile-section-dialog");
    if (mobileDialog?.open) mobileDialog.close();
  }
  document.querySelector<HTMLButtonElement>("#section-plane-pick")!.addEventListener("click", startSectionPick);
  document.addEventListener("viewer:pick-section-plane", startSectionPick);
  placeSectionFromTap = (x, y) => {
    const models = [
      { model: scanModel, visible: (selectedScan === "bs17-loftet" ? showLoft : singleVisibility).value !== "hidden" },
      { model: adjacentModel, visible: showHendrix.value !== "hidden" },
      { model: outdoorLccModel, visible: extraScanControls["183256"].visibility.value !== "hidden" },
      ...[...catalogControls.values()].map((item) => ({ model: item.model, visible: item.visibility.value !== "hidden" })),
    ];
    const hitAt = (px: number, py: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(px / rect.width * 2 - 1, 1 - py / rect.height * 2), camera);
      let best: THREE.Vector3 | null = null;
      for (const { model, visible } of models) {
        if (!model || !visible) continue;
        try {
          const hit = model.raycast({ evt: { x: px, y: py }, maxDistance: 1000, radius: 0.35 }) ??
            model.raycastFromOrigin({ origin: camera.position, direction: ray.ray.direction, maxDistance: 1000, radius: 0.35 });
          if (!hit) continue;
          const point = new THREE.Vector3(hit.x, hit.y, hit.z);
          if (!best || point.distanceTo(camera.position) < best.distanceTo(camera.position)) best = point;
        } catch { /* A scan layer without raycast support cannot provide a surface. */ }
      }
      return best;
    };
    const point = hitAt(x, y);
    if (!point) return false;
    const horizontal = hitAt(x + 8, y) ?? hitAt(x - 8, y);
    const vertical = hitAt(x, y + 8) ?? hitAt(x, y - 8);
    const viewNormal = camera.getWorldDirection(new THREE.Vector3()).negate().normalize();
    const normal = horizontal && vertical
      ? horizontal.clone().sub(point).cross(vertical.clone().sub(point))
      : new THREE.Vector3();
    const neighborsReliable = horizontal && vertical &&
      horizontal.distanceTo(point) < 2.5 && vertical.distanceTo(point) < 2.5 && normal.lengthSq() > 1e-5;
    if (neighborsReliable) {
      normal.normalize();
      if (normal.dot(viewNormal) < 0) normal.negate();
    }
    if (!neighborsReliable || normal.dot(viewNormal) < 0.65) normal.copy(viewNormal);
    // Splat raycasts near roof edges often hit the wall behind one sample.
    // An overhead tap should start with a horizontal cut; the gizmo retains free rotation.
    if (viewNormal.z > 0.75 && normal.z < 0.7) normal.set(0, 0, 1);
    sectionAnchor.copy(point);
    sectionPlaneMesh!.position.copy(point);
    sectionPlaneMesh!.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    planeAzimuth.value = String(Math.round(THREE.MathUtils.radToDeg(Math.atan2(normal.y, normal.x))));
    planeTilt.value = String(Math.round(THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(normal.z, -1, 1)))));
    planeOffset.value = "0";
    document.querySelector<HTMLSelectElement>("#section-plane-side")!.value = "negative";
    planePlacedInView = true;
    modeHelp.textContent = "Roter planet med håndtaket i 3D eller velg retning og helning her.";
    sectionPickPending = false;
    sectionPlaneReady = true;
    host.classList.remove("section-picking");
    sectionPlaneMesh!.visible = true;
    sectionTransform!.attach(sectionPlaneMesh!);
    syncPlaneOutputs();
    updateSection();
    return true;
  };
  for (const button of modeButtons) button.addEventListener("click", () => selectSectionMode(button.dataset.sectionMode as SectionMode));
  for (const button of sectionPanel.querySelectorAll<HTMLButtonElement>("[data-gizmo-mode]")) {
    button.addEventListener("click", () => {
      sectionTransform!.setMode(button.dataset.gizmoMode as "translate" | "rotate" | "scale");
      for (const item of sectionPanel.querySelectorAll<HTMLButtonElement>("[data-gizmo-mode]"))
        item.setAttribute("aria-pressed", String(item === button));
    });
  }
  document.querySelector<HTMLButtonElement>("#section-box-fit")!.addEventListener("click", () => fitBox(true));
  sectionReset.addEventListener("click", () => {
    stopSectionPick();
    for (const control of sectionControls) control.enabled.checked = false;
    sectionPlaneReady = false;
    selectSectionMode("plane");
  });
  if (selectedScan === "bs17-loftet") {
    for (const button of heightView.querySelectorAll<HTMLButtonElement>("button[data-height-view]")) {
      button.addEventListener("click", () => {
        const z = sectionControls[2];
        z.enabled.checked = button.dataset.heightView !== "both";
        z.position.value = "3.5";
        z.side.value = button.dataset.heightView === "hendrix" ? "high" : "low";
        updateSection();
      });
    }
  }
  selectSectionMode("plane");
  syncNoiseMaskUi();
}

function addPointMarker(point: ScanPoint) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `point-target point-target--${point.kind.toLowerCase()}`;
  if (point.sourceCaptureId === "152958") button.classList.add("point-target--adjacent");
  if (point.sourceCaptureId === "112646") button.classList.add("point-target--fagmoebler");
  if (point.sourceCaptureId === "183256") button.classList.add("point-target--outdoor");
  if (point.kind === "GCP") {
    button.classList.add(point.gnss.status === 4 ? "point-target--fixed" :
      point.gnss.status === 1 ? "point-target--single" : "point-target--unknown");
  }
  button.setAttribute("aria-label", `${(point.sourceCaptureId ?? captureId) === "180322" ? "Vis frontbilde" : "Vis bilder og bildeboble"} for ${point.kind} ${point.label} i opptak ${point.sourceCaptureId ?? captureId}`);
  button.title = `${point.kind} · ${point.label} · ${point.sourceCaptureId ?? captureId}`;
  const ring = document.createElement("span");
  ring.className = "point-target__ring";
  button.append(ring);
  if (point.kind !== "HDE") {
    const label = document.createElement("span");
    label.className = "point-target__label";
    label.textContent = point.sourceCaptureId === "152958" ? `H · ${point.label}` :
      point.sourceCaptureId === "112646" ? `F · ${point.label}` :
        point.sourceCaptureId === "183256" ? `U · ${point.label}` : point.label;
    button.append(label);
  }
  button.addEventListener("click", () => showPointAnnotation(point));
  pointOverlay.append(button);
  pointButtons.push({ point, button, world: new THREE.Vector3(...point.position) });
}

function refreshPointCounts() {
  const allPoints = pointButtons.map(({ point }) => point);
  for (const kind of ["GCP", "POI", "HDE", "POV"] as PointKind[]) {
    const count = allPoints.filter((point) => point.kind === kind).length;
    document.getElementById(`${kind.toLowerCase()}-count`)!.textContent = String(count);
    pointToggles[kind].disabled = count === 0;
  }
  const gcps = allPoints.filter((point) => point.kind === "GCP");
  document.querySelector<HTMLElement>("#gcp-status-summary")!.hidden = gcps.length === 0;
  for (const [id, condition] of [
    ["fixed-count", (status: number | null) => status === 4],
    ["single-count", (status: number | null) => status === 1],
    ["unknown-count", (status: number | null) => status !== 4 && status !== 1],
  ] as const) {
    document.getElementById(id)!.textContent = String(gcps.filter((point) => condition(point.gnss.status)).length);
  }
}

async function preparePoints(): Promise<PointData> {
  const [response, photoResponse] = await Promise.all([
    fetch(new URL(`data/bs17-${captureId}-points.json`, document.baseURI)),
    fetch(new URL(`data/bs17-${captureId}-photos.json`, document.baseURI)),
  ]);
  if (!response.ok) throw new Error(`Punktdata svarte med ${response.status}`);
  if (!photoResponse.ok) throw new Error(`Bildeindeks svarte med ${photoResponse.status}`);
  const data = await response.json() as PointData;
  if (data.captureId !== captureId) throw new Error(`Feil opptaks-ID i punktdata: ${data.captureId}`);
  pointPhotos = await photoResponse.json() as PointPhotoData;
  if (pointPhotos.captureId !== data.captureId) throw new Error("Punktbildene hører til et annet opptak");
  for (const point of data.points) {
    if (pointPhotos.photos[point.label]?.length !== (captureId === "180322" ? 1 : 3)) {
      throw new Error(`Mangler bilder for ${point.label}`);
    }
    point.sourceCaptureId = captureId!;
    addPointMarker(point);
  }
  refreshPointCounts();
  return data;
}

async function verifyPoiFrame(data: PointData): Promise<string> {
  const poiPath = selectedScan === "bs17-loftet" ? "local-scan/bs17-loftet/info/poi.json" :
    "local-scan/bs17-default/info/poi.json";
  const response = await fetch(new URL(poiPath, document.baseURI));
  if (!response.ok) throw new Error("POI-referanser mangler i LCC2-eksporten");
  const exported = await response.json() as Poi[];
  const refs = new Map(data.referencePois.map((poi) => [poi.label, poi.position]));
  const residuals = exported.flatMap((poi) => {
    const reference = refs.get(poi.customLabel ?? poi.name ?? "");
    return reference ? [new THREE.Vector3(...poi.position).distanceTo(new THREE.Vector3(...reference))] : [];
  });
  if (residuals.length < 2) throw new Error("For få felles POI-punkter til å verifisere koordinatene");
  const max = Math.max(...residuals);
  if (max > 0.25) throw new Error(`Koordinatene avviker ${max.toFixed(2)} m ved POI; GCP legges ikke over modellen`);
  return `${residuals.length} POI kontrollert, største avvik ${max.toFixed(2)} m`;
}

async function createPointPreview(id: string, size = 0.19) {
  const prefix = new URL(`models/bs17-${id}-preview`, document.baseURI);
  const [metadataResponse, pointsResponse] = await Promise.all([
    fetch(`${prefix.href}.json`), fetch(`${prefix.href}.bin`),
  ]);
  if (!metadataResponse.ok || !pointsResponse.ok) throw new Error("Punktskyforhåndsvisningen mangler");
  const metadata = await metadataResponse.json() as PointPreview;
  if (metadata.captureId !== id || metadata.recordBytes !== 16) {
    throw new Error("Punktsky og GCP har ulik skann-ID eller filformat");
  }
  const bytes = await pointsResponse.arrayBuffer();
  if (bytes.byteLength !== metadata.points * metadata.recordBytes) throw new Error("Punktskyfilen er ufullstendig");
  const view = new DataView(bytes);
  const positions = new Float32Array(metadata.points * 3);
  const colors = new Uint8Array(metadata.points * 3);
  for (let index = 0; index < metadata.points; index += 1) {
    const source = index * 16;
    const target = index * 3;
    positions[target] = view.getFloat32(source, true);
    positions[target + 1] = view.getFloat32(source + 4, true);
    positions[target + 2] = view.getFloat32(source + 8, true);
    colors[target] = view.getUint8(source + 12);
    colors[target + 1] = view.getUint8(source + 13);
    colors[target + 2] = view.getUint8(source + 14);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Uint8BufferAttribute(colors, 3, true));
  geometry.computeBoundingSphere();
  const cloud = new THREE.Points(geometry, new THREE.PointsMaterial({
    size, sizeAttenuation: true, vertexColors: true, transparent: true,
  }));
  return { metadata, cloud };
}

async function loadPointPreview(data: PointData): Promise<PointPreview> {
  const { metadata, cloud } = await createPointPreview(data.captureId);
  const distances = Object.values(metadata.nearestGcpMeters);
  const maxDistance = distances.length ? Math.max(...distances) : 0;
  if (captureId === "102311" && maxDistance > 0.5) throw new Error(`GCP-avvik mot punktskyen er ${maxDistance.toFixed(2)} m`);
  scene.add(cloud);
  if (coordinateGrid) coordinateGrid.visible = false;
  return metadata;
}

function applyExtraVisibility(id: ExtraScanId) {
  const model = extraModels[id];
  const mode = extraScanControls[id].visibility.value;
  if (model) {
    model.visible = mode !== "hidden";
    model.material.opacity = mode === "ghost" ? 0.22 : 1;
    model.material.depthWrite = mode !== "ghost";
  }
  if (id === "183256" && outdoorLccModel) {
    outdoorLccModel.setVisible(mode !== "hidden");
    outdoorLccModel.setAlpha(mode === "ghost" ? 0.2 : 1);
    updateSection();
    updateSplatBudgets();
  }
  updatePointTargets();
}

async function outdoorAlignment() {
  const [outdoorResponse, loftResponse] = await Promise.all([
    fetch(new URL("local-scan/bs17-outdoor/manifest.lcc2", document.baseURI)),
    fetch(new URL("local-scan/bs17-loftet/manifest.lcc2", document.baseURI)),
  ]);
  if (!outdoorResponse.ok || !loftResponse.ok) throw new Error("LCC2-eksport eller Loftet-referanse mangler");
  const outdoor = await outdoorResponse.json() as Manifest;
  const loft = await loftResponse.json() as Manifest;
  if (outdoor.epsg !== 32632 || loft.epsg !== 32632 || outdoor.offset?.length !== 3 || loft.offset?.length !== 3) {
    throw new Error("Opptakene mangler forventet EPSG:32632 og offset");
  }
  const delta = outdoor.offset.map((value, axis) => value - loft.offset![axis]) as [number, number, number];
  return { outdoor, delta };
}

function catalogManifestUrl(id: Bs17CatalogId) {
  return new URL(`local-scan/bs17-catalog/${id}/manifest.lcc2`, document.baseURI).href;
}

async function ensureCatalogOverlay(id: Bs17CatalogId): Promise<void> {
  const controls = catalogControls.get(id);
  if (!controls) throw new Error("Opptaket kan bare åpnes separat");
  if (controls.model) return;
  if (controls.loading) return controls.loading;
  const entry = bs17Catalog.find((candidate) => candidate.id === id)!;
  controls.status.textContent = `Laster ${entry.label} …`;
  const loading = (async () => {
    const [response, referenceResponse] = await Promise.all([
      fetch(catalogManifestUrl(id)),
      fetch(new URL("local-scan/bs17-loftet/manifest.lcc2", document.baseURI)),
    ]);
    if (!response.ok || !referenceResponse.ok) throw new Error("LCC2-eksport eller Loftet-referanse mangler");
    const manifest = await response.json() as Manifest;
    const reference = await referenceResponse.json() as Manifest;
    if (manifest.epsg !== 32632 || reference.epsg !== 32632 ||
      manifest.offset?.length !== 3 || reference.offset?.length !== 3 ||
      !manifest.offset.every(Number.isFinite) || !reference.offset.every(Number.isFinite)) {
      throw new Error("Opptaket har ikke forventet koordinatreferanse");
    }
    const delta = manifest.offset.map((value, axis) => value - reference.offset![axis]) as [number, number, number];
    if (Math.hypot(...delta) > 100) throw new Error("Offset avviker mer enn 100 m fra Loftet");
    controls.bounds = {
      min: manifest.root.boundingBox.min.map((value, axis) => value + delta[axis]) as [number, number, number],
      max: manifest.root.boundingBox.max.map((value, axis) => value + delta[axis]) as [number, number, number],
    };
    if (sectionBounds) {
      sectionBounds.union(new THREE.Box3(new THREE.Vector3(...controls.bounds.min), new THREE.Vector3(...controls.bounds.max)));
      sectionControls.forEach((control, axis) => {
        control.min = Math.min(control.min, controls.bounds!.min[axis]);
        control.max = Math.max(control.max, controls.bounds!.max[axis]);
        control.position.min = String(control.min);
        control.position.max = String(control.max);
      });
    }
    await new Promise<void>((resolve, reject) => {
      const model = LCCRender.load({
        camera, scene, dataPath: catalogManifestUrl(id), renderLib: THREE, renderer, canvas: renderer.domElement,
        modelMatrix: new THREE.Matrix4().makeTranslation(...delta),
        useEnv: false, useIndexDB: false, useLoadingEffect: false,
      }, () => {
        controls.status.textContent = `${entry.label}: 3DGS klar. Koordinat- og høydesamstilling er foreløpig.`;
        updateSection();
        updateSplatBudgets();
        resolve();
      }, (progress) => {
        controls.status.textContent = `Laster ${entry.label}: ${Math.round(progress * 100)} %`;
      }, () => reject(new Error("LCC2 kunne ikke lastes")));
      controls.model = model;
      model.setMaxNodeSplats(300_000);
      model.setMaxDistance(350);
      model.setLodAutoLevelUp(true);
      if (controls.pointMode) model.togglePointsDisplayMode();
      updateSection();
      updateSplatBudgets();
    });
  })();
  controls.loading = loading;
  try { await loading; }
  catch (error) {
    const failedModel = controls.model as LccObject | null;
    failedModel?.setVisible(false);
    controls.model = null;
    throw error;
  }
  finally { controls.loading = null; }
}

function setupCatalogOverlays() {
  for (const [id, controls] of catalogControls) {
    controls.visibility.addEventListener("change", () => {
      if (controls.visibility.value === "hidden") { updateSection(); updateSplatBudgets(); return; }
      void ensureCatalogOverlay(id).then(() => { updateSection(); updateSplatBudgets(); }).catch((error) => {
        controls.visibility.value = "hidden";
        controls.status.textContent = `Kunne ikke vise opptaket: ${error instanceof Error ? error.message : String(error)}`;
      });
    });
    controls.display.addEventListener("change", () => {
      const pointMode = controls.display.value === "points";
      if (controls.model && controls.pointMode !== pointMode) controls.model.togglePointsDisplayMode();
      controls.pointMode = pointMode;
    });
    controls.focus.addEventListener("click", () => {
      void ensureCatalogOverlay(id).then(() => {
        const bounds = controls.bounds!;
        const center = new THREE.Vector3(...bounds.min).add(new THREE.Vector3(...bounds.max)).multiplyScalar(0.5);
        const radius = new THREE.Vector3(...bounds.max).sub(new THREE.Vector3(...bounds.min)).length() / 2;
        setView(center.clone().add(new THREE.Vector3(radius * 0.25, radius * 0.25, radius * 1.3)), center);
      }).catch((error) => { controls.status.textContent = String(error); });
    });
  }
}

async function loadOutdoorLccOverlay(controls: typeof extraScanControls["183256"]) {
  const { delta } = await outdoorAlignment();
  await new Promise<void>((resolve, reject) => {
    const model = LCCRender.load({
      camera, scene, dataPath: new URL("local-scan/bs17-outdoor/manifest.lcc2", document.baseURI).href,
      renderLib: THREE, renderer, canvas: renderer.domElement,
      modelMatrix: new THREE.Matrix4().makeTranslation(...delta),
      useEnv: false, useIndexDB: false, useLoadingEffect: false,
    }, () => {
      updateSplatBudgets();
      updateSection();
      resolve();
    }, (progress) => {
      controls.status.textContent = `Laster utvendig 3DGS: ${Math.round(progress * 100)} %`;
    }, () => reject(new Error("Utvendig LCC2 kunne ikke lastes")));
    outdoorLccModel = model;
    if (outdoorPointMode) model.togglePointsDisplayMode();
    model.setMaxNodeSplats(300_000);
    model.setMaxDistance(350);
    model.setLodAutoLevelUp(true);
    updateSplatBudgets();
    updateSection();
  });
}

async function ensureExtraOverlay(id: ExtraScanId): Promise<void> {
  if (extraModels[id] || (id === "183256" && outdoorLccModel)) return;
  if (extraLoading[id]) return extraLoading[id];
  const controls = extraScanControls[id];
  controls.status.textContent = `Laster ${controls.label} ${id}: modell og punktbilder …`;
  const loading = (async () => {
    const [pointResponse, photoResponse] = await Promise.all([
      fetch(new URL(`data/bs17-${id}-points.json`, document.baseURI)),
      fetch(new URL(`data/bs17-${id}-photos.json`, document.baseURI)),
    ]);
    if (!pointResponse.ok || !photoResponse.ok) throw new Error("Punkt- eller bildeindeks mangler");
    const data = await pointResponse.json() as PointData;
    const photos = await photoResponse.json() as PointPhotoData;
    if (data.captureId !== id || photos.captureId !== id) {
      throw new Error("Skann-ID stemmer ikke mellom punkter og bilder");
    }
    for (const point of data.points) {
      if (photos.photos[point.label]?.length !== 3) throw new Error(`Mangler tre bilder for ${id} ${point.label}`);
    }
    extraPhotos[id] = photos;
    extraPoints[id] = data;
    for (const point of data.points) {
      point.sourceCaptureId = id;
      addPointMarker(point);
    }
    refreshPointCounts();
    if (id === "183256") {
      try {
        await loadOutdoorLccOverlay(controls);
        controls.status.textContent = `Full LCC2/3DGS og ${data.points.length} bildemarkører. EPSG:32632; høydedatum og felles ankere må fortsatt verifiseres.`;
      } catch (error) {
        outdoorLccModel?.setVisible(false);
        outdoorLccModel = null;
        const preview = await createPointPreview(id, 0.11);
        extraModels[id] = preview.cloud;
        scene.add(preview.cloud);
        controls.status.textContent = `LCC2 kunne ikke lastes (${error instanceof Error ? error.message : String(error)}). Viser ${preview.metadata.points.toLocaleString("nb-NO")} LAS-punkter som reserve.`;
      }
    } else {
      const preview = await createPointPreview(id, 0.11);
      extraModels[id] = preview.cloud;
      scene.add(preview.cloud);
      controls.status.textContent = `${preview.metadata.points.toLocaleString("nb-NO")} fargede LAS-punkter og ${data.points.length} bildemarkører. Foreløpig samstilling.`;
    }
    applyExtraVisibility(id);
  })();
  extraLoading[id] = loading;
  try {
    await loading;
  } finally {
    delete extraLoading[id];
  }
}

function setupExtraOverlays() {
  if (selectedScan !== "bs17-loftet") return;
  outdoorDisplay.addEventListener("change", () => {
    const next = outdoorDisplay.value === "points";
    if (outdoorLccModel && outdoorPointMode !== next) outdoorLccModel.togglePointsDisplayMode();
    outdoorPointMode = next;
  });
  for (const id of ["112646", "183256"] as ExtraScanId[]) {
    const controls = extraScanControls[id];
    controls.visibility.addEventListener("change", () => {
      if (controls.visibility.value === "hidden") {
        applyExtraVisibility(id);
        return;
      }
      void ensureExtraOverlay(id).then(() => applyExtraVisibility(id)).catch((error) => {
        controls.visibility.value = "hidden";
        controls.status.textContent = `Kunne ikke vise ${controls.label}: ${error instanceof Error ? error.message : String(error)}`;
      });
    });
    controls.markers.addEventListener("change", () => {
      if (!controls.markers.checked && activePoint?.sourceCaptureId === id) hidePointAnnotation();
      updatePointTargets();
    });
  }

  type AnchorMember = { id: "152950" | ExtraScanId; label: string; scanName: string };
  type Anchor = { title: string; detail: string; members: AnchorMember[] };
  const anchors: Anchor[] = [
    { title: "Loftet 0_1 ↔ Utvendig 0_1", detail: "Fotostøttet kandidat · 11 cm mellom punktene · utvendig GNSS 2", members: [{ id: "183256", label: "0_1", scanName: "Utvendig" }, { id: "152950", label: "0_1", scanName: "Loftet" }] },
    { title: "Loftet 0_5 ↔ Utvendig 0_5 ↔ Fagmøbler1 0_3", detail: "Fotostøttet kandidat ved trappen · Loftet og utvendig 8 cm", members: [{ id: "183256", label: "0_5", scanName: "Utvendig" }, { id: "152950", label: "0_5", scanName: "Loftet" }, { id: "112646", label: "0_3", scanName: "Fagmøbler1" }] },
    { title: "Fagmøbler1 0_1 ↔ Utvendig 0_6", detail: "Fotostøttet kandidat ved inngangen · begge GNSS 4", members: [{ id: "112646", label: "0_1", scanName: "Fagmøbler1" }, { id: "183256", label: "0_6", scanName: "Utvendig" }] },
    { title: "Fagmøbler1 0_6 ↔ Utvendig 0_7", detail: "Fotostøttet kandidat ved innvendig trapp · ingen RTK-fiks ved markering", members: [{ id: "183256", label: "0_7", scanName: "Utvendig" }, { id: "112646", label: "0_6", scanName: "Fagmøbler1" }] },
  ];
  const heading = document.createElement("p");
  heading.textContent = "Felles markører mellom opptakene. Trykk på et anker for å vise skannene; bruk bildeknappene for å sammenligne opptakene:";
  sharedAnchorList.append(heading);
  const photoNavs: HTMLElement[] = [];
  let anchorSelection = 0;
  const openAnchor = async (anchor: Anchor, focus: AnchorMember, selection: number) => {
    await Promise.all(anchor.members.map(async ({ id }) => {
      if (id === "152950") return;
      const controls = extraScanControls[id];
      controls.visibility.value = "visible";
      await ensureExtraOverlay(id);
      applyExtraVisibility(id);
    }));
    if (selection !== anchorSelection) return;
    const point = pointButtons.find(({ point }) => point.sourceCaptureId === focus.id && point.label === focus.label)?.point;
    if (!point) throw new Error(`Fant ikke ${focus.scanName} ${focus.label}`);
    const target = new THREE.Vector3(...point.position);
    setView(target.clone().add(new THREE.Vector3(4, -5, 3)), target);
    showPointAnnotation(point);
  };
  for (const anchor of anchors) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = anchor.title;
    button.title = anchor.detail;
    const photoNav = document.createElement("div");
    photoNav.className = "anchor-photo-nav";
    photoNav.hidden = true;
    photoNavs.push(photoNav);
    const show = (focus: AnchorMember) => {
      for (const nav of photoNavs) nav.hidden = nav !== photoNav;
      const selection = ++anchorSelection;
      void openAnchor(anchor, focus, selection).catch((error) => {
        status.textContent = `Kunne ikke åpne ${anchor.title}: ${error instanceof Error ? error.message : String(error)}`;
      });
    };
    button.addEventListener("click", () => {
      show(anchor.members[0]);
    });
    for (const member of anchor.members) {
      const photoButton = document.createElement("button");
      photoButton.type = "button";
      photoButton.textContent = `Bilde ${member.scanName} ${member.label}`;
      photoButton.addEventListener("click", () => {
        show(member);
      });
      photoNav.append(photoButton);
    }
    sharedAnchorList.append(button, photoNav);
  }
  const note = document.createElement("p");
  note.textContent = "Navn er lokale løpenumre. Koblingene bygger på bilder og koordinater og er ikke uavhengig oppmålte GCP-er.";
  sharedAnchorList.append(note);
  sharedAnchorList.hidden = false;
}
window.addEventListener("resize", resize);
resize();

let frames = 0;
let lastFpsAt = performance.now();
let lastPointTargetUpdateAt = 0;
if (propertyId === "bs17") renderer.setAnimationLoop(() => {
  const now = performance.now();
  updateNavigation(Math.min((now - lastFrameAt) / 1000, 0.05));
  lastFrameAt = now;
  if (isPointScan && now - lastPointTargetUpdateAt >= 33) {
    updatePointTargets();
    if (noiseMaskPicking || maskFor(noiseMaskLayer.value)?.enabled) updateNoiseMaskOverlay();
    lastPointTargetUpdateAt = now;
  }
  if (!bubbleActive) {
    updateScanSectionPlane();
    LCCRender.update();
  }
  if (bimFragments && bimModel?.object.visible && !bimUpdating && now - lastBimUpdateAt >= 250 &&
      (camera.position.distanceToSquared(lastBimCameraPosition) > 0.0001 ||
       camera.quaternion.angleTo(lastBimCameraQuaternion) > 0.0001)) {
    bimUpdating = true;
    lastBimUpdateAt = now;
    lastBimCameraPosition.copy(camera.position);
    lastBimCameraQuaternion.copy(camera.quaternion);
    void bimFragments.update().catch((error) => console.warn("Kunne ikke oppdatere BIM-visningen", error))
      .finally(() => { bimUpdating = false; });
  }
  if (now - lastCollisionCheckAt >= 1000 && scanModel) {
    updateCollisionAvailability();
    lastCollisionCheckAt = now;
  }
  if (bubbleActive) {
    renderer.clippingPlanes = [];
    renderer.render(panoramaScene, panoramaCamera);
  } else {
    renderer.clippingPlanes = sectionPlanes;
    renderer.render(scene, camera);
    if (sectionMode !== "axes" && sectionTransform) {
      renderer.autoClear = false;
      renderer.clippingPlanes = [];
      renderer.clearDepth();
      renderer.render(sectionOverlayScene, camera);
      renderer.autoClear = true;
    }
  }
  frames += 1;
  if (now - lastFpsAt >= 1000) {
    fps.textContent = String(Math.round(frames * 1000 / (now - lastFpsAt)));
    frames = 0;
    lastFpsAt = now;
  }
});

function bimAttribute(data: Record<string, unknown>, key: string): string | null {
  const raw = data[key];
  if (raw == null) return null;
  const value = typeof raw === "object" && "value" in raw ? raw.value : raw;
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function bimScalar(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object" && "value" in value) return bimScalar(value.value);
  return null;
}

function bimFields(value: unknown, output = new Map<string, string[]>(), depth = 0,
  visited = new WeakSet<object>(), budget = { remaining: 400 }): Map<string, string[]> {
  if (!value || depth > 6 || budget.remaining-- <= 0) return output;
  if (Array.isArray(value)) {
    if (visited.has(value)) return output;
    visited.add(value);
    for (const child of value) bimFields(child, output, depth + 1, visited, budget);
    return output;
  }
  if (typeof value !== "object") return output;
  if (visited.has(value)) return output;
  visited.add(value);
  const record = value as Record<string, unknown>;
  const propertyName = bimScalar(record.Name);
  const propertyValue = bimScalar(record.NominalValue) ?? bimScalar(record.Value) ??
    (Array.isArray(record.ListValues) ? record.ListValues.map(bimScalar).filter(Boolean).join(", ") : null);
  if (propertyName && propertyValue) {
    const key = propertyName.trim().toLocaleLowerCase();
    output.set(key, [...(output.get(key) ?? []), propertyValue]);
  }
  for (const [key, child] of Object.entries(record)) {
    const scalar = bimScalar(child);
    if (scalar && key !== "value" && key !== "type") {
      const normalized = key.toLocaleLowerCase();
      output.set(normalized, [...(output.get(normalized) ?? []), scalar]);
    } else if (Array.isArray(child) || (child && typeof child === "object" && !("value" in child))) {
      bimFields(child, output, depth + 1, visited, budget);
    }
  }
  return output;
}

function bimMatchingValues(data: Record<string, unknown>, field: string, name: string, id: number): string[] {
  const fields = bimFields(data);
  const values = (key: string) => fields.get(key.toLocaleLowerCase()) ?? [];
  if (field === "storey") return [];
  if (field === "category") return [bimAttribute(data, "_category") ?? bimAttribute(data, "type") ?? ""];
  if (field === "name") return [...values("name"), ...values("globalid")];
  if (field === "type") return [...values("objecttype"), ...values("predefinedtype"), ...values("type"),
    ...values("relatingtype"), ...values("name")];
  if (field === "layer") return [...(bimLayersById.get(id) ?? []),
    ...[...fields].filter(([key]) => key.includes("layer")).flatMap(([, entries]) => entries)];
  if (field === "system") return [...(bimSystemsById.get(id) ?? []),
    ...[...fields].filter(([key]) => key.includes("system") || key.includes("group"))
      .flatMap(([, entries]) => entries)];
  return values(name.trim());
}

async function loadBimMetadataIndex() {
  try {
    const response = await fetch(new URL("models/BS17-SEMY-ARST-ASBUILT-v2.index.json", document.baseURI));
    if (!response.ok) return;
    const index = await response.json() as { schema?: number; layers?: Record<string, string[]>;
      systems?: Record<string, string[]> };
    if (index.schema !== 1) return;
    for (const [id, names] of Object.entries(index.layers ?? {})) bimLayersById.set(Number(id), names);
    for (const [id, names] of Object.entries(index.systems ?? {})) bimSystemsById.set(Number(id), names);
  } catch { /* A private metadata index is optional. */ }
}

async function restoreBimCategoryVisibility() {
  if (!bimModel || !bimFragments) return;
  bimFilterActive = false;
  await bimModel.setVisible(bimAllGeometryIds, true);
  for (const [toggle, ids] of [
    [showBimSpaces, bimSpaceIds], [showBimShells, bimShellIds], [showBimWalls, bimWallIds],
    [showBimOpenings, bimOpeningIds], [showBimOthers, bimOtherIds],
  ] as const) if (!toggle.checked && ids.length) await bimModel.setVisible(ids, false);
  await bimFragments.update(true);
  updateBimMaterialDepth(bimModel);
}

async function applyBimFilter() {
  if (!bimModel || !bimFragments) { bimFilterStatus.textContent = "Vis BIM-modellen først."; return; }
  const model = bimModel;
  const field = bimFilterField.value;
  const name = bimFilterName.value.trim();
  const needle = bimFilterValue.value.trim().toLocaleLowerCase();
  if (!needle || (field === "property" && !name)) {
    bimFilterStatus.textContent = "Skriv verdi og eventuelt parameternavn.";
    return;
  }
  const request = ++bimFilterRequest;
  bimFilterResults.replaceChildren();
  const ids = bimAllGeometryIds;
  const matches: { id: number; label: string }[] = [];
  let indexedValues = 0;
  const relations: Record<string, { attributes: boolean; relations: boolean }> =
    field === "property" ? { IsDefinedBy: { attributes: true, relations: true } } :
    field === "type" ? { IsTypedBy: { attributes: true, relations: true } } :
      field === "system" ? { HasAssignments: { attributes: true, relations: true } } : {};
  try {
    if (field === "storey" && bimTreeLoading) await bimTreeLoading;
    if ((field === "layer" || field === "system") && bimIndexLoading) await bimIndexLoading;
    for (let start = 0; start < ids.length; start += 20) {
      if (request !== bimFilterRequest) return;
      const chunk = ids.slice(start, start + 20);
      const items = field === "storey" ? [] : await model.getItemsData(chunk, {
        attributesDefault: true, relations,
      });
      for (let index = 0; index < chunk.length; index++) {
        const id = chunk[index];
        const data = (items[index] ?? {}) as Record<string, unknown>;
        const candidates = field === "storey" ? [bimStoreyById.get(id) ?? ""] :
          bimMatchingValues(data, field, name, id);
        if (candidates.some(Boolean)) indexedValues++;
        if (!candidates.some((value) => value.toLocaleLowerCase().includes(needle))) continue;
        matches.push({ id, label: bimAttribute(data, "Name") ?? `${bimStoreyById.get(id) ?? "Objekt"} #${id}` });
      }
      bimFilterStatus.textContent = `Søker i BIM: ${Math.min(start + chunk.length, ids.length)} / ${ids.length} …`;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (request !== bimFilterRequest) return;
    if (indexedValues === 0) {
      await restoreBimCategoryVisibility();
      bimFilterStatus.textContent = `Ingen lesbare verdier for «${field === "property" ? name : bimFilterField.selectedOptions[0].textContent}» i denne Fragments-modellen.`;
      return;
    }
    await model.setVisible(ids, false);
    if (matches.length) await model.setVisible(matches.map((item) => item.id), true);
    await bimFragments.update(true);
    updateBimMaterialDepth(model);
    bimFilterActive = true;
    bimFilterStatus.textContent = `${matches.length} av ${ids.length} BIM-objekter treffer. Filteret overstyrer BIM-lagene midlertidig.`;
    for (const item of matches.slice(0, 60)) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${item.label} · #${item.id}`;
      button.addEventListener("click", () => { void selectBimObject(item.id, button); });
      bimFilterResults.append(button);
    }
    if (matches.length > 60) {
      const note = document.createElement("p");
      note.textContent = `Viser de første 60 av ${matches.length} treff i listen. Alle treff er synlige i 3D.`;
      bimFilterResults.append(note);
    }
  } catch (error) {
    bimFilterStatus.textContent = `Kunne ikke filtrere BIM: ${error instanceof Error ? error.message : String(error)}`;
  }
}

bimFilterField.addEventListener("change", () => {
  const property = bimFilterField.value === "property";
  bimFilterName.hidden = !property;
  bimFilterNameLabel.hidden = !property;
  bimFilterSuggestions.replaceChildren();
  if (bimFilterField.value === "storey") {
    for (const value of [...new Set(bimStoreyById.values())].sort())
      bimFilterSuggestions.append(new Option(value, value));
  }
});
bimFilterForm.addEventListener("submit", (event) => { event.preventDefault(); void applyBimFilter(); });
document.querySelector<HTMLButtonElement>("#bim-filter-mmi300")!.addEventListener("click", () => {
  bimFilterField.value = "property";
  bimFilterField.dispatchEvent(new Event("change"));
  bimFilterName.value = "MMI level";
  bimFilterValue.value = "300";
  void applyBimFilter();
});
document.querySelector<HTMLButtonElement>("#bim-filter-clear")!.addEventListener("click", () => {
  ++bimFilterRequest;
  bimFilterResults.replaceChildren();
  bimFilterStatus.textContent = "Viser BIM-lagene igjen.";
  void restoreBimCategoryVisibility();
});

async function selectBimObject(localId: number, button?: HTMLButtonElement) {
  if (!bimModel) return;
  if (selectedBimButton) selectedBimButton.removeAttribute("aria-current");
  selectedBimButton = button ?? null;
  if (button) button.setAttribute("aria-current", "true");
  const previousId = selectedBimId;
  selectedBimId = localId;
  bimObject.textContent = `Laster objekt ${localId} …`;
  try {
    if (previousId !== null && previousId !== localId) await bimModel.resetColor([previousId]);
    await bimModel.setColor([localId], new THREE.Color(0xffce61));
    if (bimFragments) await bimFragments.update(true);
    const [data] = await bimModel.getItemsData([localId]);
    const attributes = data as Record<string, unknown> | undefined;
    const title = attributes && (bimAttribute(attributes, "Name") || bimAttribute(attributes, "LongName"));
    const guid = attributes && bimAttribute(attributes, "GlobalId");
    const category = attributes && (bimAttribute(attributes, "_category") || bimAttribute(attributes, "type"));
    const heading = document.createElement("strong");
    heading.textContent = title || `Objekt ${localId}`;
    const details = document.createElement("dl");
    for (const [label, value] of [["Type", category], ["Lokal ID", String(localId)], ["GUID", guid]]) {
      if (!value) continue;
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = `${label}:`;
      description.textContent = value;
      row.append(term, description);
      details.append(row);
    }
    bimObject.replaceChildren(heading, details);
  } catch (error) {
    bimObject.textContent = `Kunne ikke lese objekt ${localId}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const bimCategoryNames: Record<string, string> = {
  IFCPROJECT: "Prosjekt", IFCSITE: "Eiendom", IFCBUILDING: "Bygning",
  IFCBUILDINGSTOREY: "Etasje", IFCSPACE: "Rom", IFCROOF: "Tak",
  IFCSLAB: "Dekke", IFCCOVERING: "Kledning", IFCWALL: "Vegg",
  IFCWINDOW: "Vindu", IFCDOOR: "Dør", IFCSTAIR: "Trapp",
  IFCBUILDINGELEMENTPROXY: "Generelt bygningsobjekt",
  IFCBUILDINGELEMENTPART: "Bygningsdel", IFCRAILING: "Rekkverk",
  IFCRAMP: "Rampe", IFCBEAM: "Bjelke", IFCCOLUMN: "Søyle",
  IFCSANITARYTERMINAL: "Sanitærutstyr", IFCFURNITURE: "Inventar",
};

function renderBimTreeNode(node: SpatialTreeItem, parent: HTMLElement, names: Map<number, string>, counters: { storey: number }) {
  if (!node.category && node.children?.length) {
    node.children.forEach((child) => renderBimTreeNode(child, parent, names, counters));
    return;
  }
  const category = node.category ? (bimCategoryNames[node.category.toUpperCase()] ?? node.category.replace(/^IFC/i, "")) : "Objekt";
  const isStoreyGroup = node.category?.toUpperCase() === "IFCBUILDINGSTOREY" && node.localId === null;
  const namedId = node.localId ?? (isStoreyGroup ? null : node.children?.find((child) => !child.category && child.localId !== null)?.localId) ?? null;
  const name = namedId === null ? null : names.get(namedId);
  const label = isStoreyGroup ? `Etasjegruppe ${++counters.storey}` : name ? `${category} · ${name}` : `${category}${node.localId === null ? "" : ` #${node.localId}`}`;
  const children = node.children ?? [];
  if (!children.length) {
    if (node.localId === null) return;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => { void selectBimObject(node.localId!, button); });
    parent.append(button);
    return;
  }
  const branch = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = `${label} (${children.length})`;
  branch.append(summary);
  if (node.localId !== null) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Velg ${label}`;
    button.addEventListener("click", () => { void selectBimObject(node.localId!, button); });
    branch.append(button);
  }
  branch.addEventListener("toggle", () => {
    if (!branch.open || branch.dataset.loaded) return;
    branch.dataset.loaded = "true";
    const list = document.createElement("div");
    children.forEach((child) => renderBimTreeNode(child, list, names, counters));
    branch.append(list);
  });
  parent.append(branch);
}

async function loadBimTree(model: FragmentsModel) {
  bimTree.textContent = "Laster modellstruktur …";
  try {
    const structure = await model.getSpatialStructure();
    const structuralIds: number[] = [];
    const collect = (node: SpatialTreeItem, depth: number, parentStructural = false) => {
      const structural = /^(IFCPROJECT|IFCSITE|IFCBUILDING|IFCBUILDINGSTOREY)$/i.test(node.category ?? "");
      if (node.localId !== null && (structural || parentStructural) && structuralIds.length < 250) structuralIds.push(node.localId);
      if (depth >= 10) return;
      for (const child of node.children ?? []) collect(child, depth + 1, structural);
    };
    collect(structure, 0);
    const names = new Map<number, string>();
    if (structuralIds.length) {
      const data = await model.getItemsData(structuralIds);
      data.forEach((item, index) => {
        const name = bimAttribute(item as Record<string, unknown>, "Name");
        if (name) names.set(structuralIds[index], name);
      });
    }
    bimStoreyById.clear();
    const markStorey = (node: SpatialTreeItem, current: string | null) => {
      let storey = current;
      if (node.category?.toUpperCase() === "IFCBUILDINGSTOREY") {
        const id = node.localId ?? node.children?.find((child) => child.localId !== null)?.localId;
        storey = id === null || id === undefined ? "Etasje" : names.get(id) ?? `Etasje #${id}`;
      }
      if (node.localId !== null && storey) bimStoreyById.set(node.localId, storey);
      for (const child of node.children ?? []) markStorey(child, storey);
    };
    markStorey(structure, null);
    if (bimFilterField.value === "storey") bimFilterField.dispatchEvent(new Event("change"));
    bimTree.replaceChildren();
    renderBimTreeNode(structure, bimTree, names, { storey: 0 });
  } catch (error) {
    bimTree.textContent = `Kunne ikke lese modellstrukturen: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function updateSplatBudgets() {
  const total = Number(detail.value);
  const entries: { id: string; model: LccObject; visible: boolean }[] = [];
  if (scanModel) entries.push({ id: primaryLayerId, model: scanModel,
    visible: selectedScan === "bs17-loftet" ? showLoft.value !== "hidden" : singleVisibility.value !== "hidden" });
  if (adjacentModel) entries.push({ id: "152958", model: adjacentModel, visible: showHendrix.value !== "hidden" });
  if (outdoorLccModel) entries.push({ id: "183256", model: outdoorLccModel,
    visible: extraScanControls["183256"].visibility.value !== "hidden" });
  for (const [id, controls] of catalogControls) {
    if (controls.model) entries.push({ id, model: controls.model,
      visible: controls.visibility.value !== "hidden" });
  }
  const rank = new Map([...modelList.children].map((element, index) =>
    [(element as HTMLElement).dataset.layerId!, index]));
  const visible = entries.filter((entry) => entry.visible)
    .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
  const weights = visible.map((_, index) => 1 / ((index + 1) ** 2));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  for (const entry of entries) {
    // Higher rows receive more detail and composite last in transparent overlaps.
    const position = visible.indexOf(entry);
    const order = position < 0 ? 0 : visible.length - position;
    (entry.model.getInstancedMesh() as THREE.Group).traverse((object) => { object.renderOrder = order; });
    if (!entry.visible) continue;
    const share = weights[position] / weightTotal;
    entry.model.setMaxSplats(Math.max(100_000, Math.round(total * share)));
  }
}

function setupAdjacentOverlay(loftManifest: Manifest) {
  if (selectedScan !== "bs17-loftet") return;
  showLoft.addEventListener("change", () => {
    updateSplatBudgets();
    updateSection();
  });
  showLoftPoints.addEventListener("change", () => {
    if (!showLoftPoints.checked && activePoint?.sourceCaptureId === "152950") hidePointAnnotation();
    updatePointTargets();
  });
  showHendrixPoints.addEventListener("change", () => {
    if (!showHendrixPoints.checked && activePoint?.sourceCaptureId === "152958") hidePointAnnotation();
    updatePointTargets();
  });
  loftDisplay.addEventListener("change", () => {
    const next = loftDisplay.value === "points";
    if (scanModel && loftPointMode !== next) scanModel.togglePointsDisplayMode();
    loftPointMode = next;
  });
  hendrixDisplay.addEventListener("change", () => {
    const next = hendrixDisplay.value === "points";
    if (adjacentModel && hendrixPointMode !== next) adjacentModel.togglePointsDisplayMode();
    hendrixPointMode = next;
  });
  separateScans.addEventListener("change", updateSection);
  scanSeparationHeight.addEventListener("input", () => {
    scanSeparationValue.textContent = `${Number(scanSeparationHeight.value).toFixed(1).replace(".", ",")} m`;
    updateSection();
  });
  showHendrix.addEventListener("change", async () => {
    if (showHendrix.value === "hidden") {
      adjacentModel?.setVisible(false);
      updateSplatBudgets();
      updateSection();
      hendrixStatus.textContent = "Hendrix er skjult. Samstillingen og GCP-kandidatene er bevart.";
      return;
    }
    if (adjacentModel) {
      adjacentModel.setVisible(true);
      updateSplatBudgets();
      updateSection();
      hendrixStatus.textContent = "Hendrix vises i felles LCC2-koordinatramme. Felles GCP-er er foreløpige kandidater.";
      return;
    }
    if (adjacentLoading) return;
    adjacentLoading = true;
    hendrixStatus.textContent = "Kontrollerer Hendrix 152958 og felles koordinatramme …";
    try {
      const [manifestResponse, pointsResponse, photosResponse, alignmentResponse] = await Promise.all([
        fetch(new URL("local-scan/bs17-hendrix/manifest.lcc2", document.baseURI)),
        fetch(new URL("data/bs17-152958-points.json", document.baseURI)),
        fetch(new URL("data/bs17-152958-photos.json", document.baseURI)),
        fetch(new URL("data/bs17-152958-alignment.json", document.baseURI)),
      ]);
      if (![manifestResponse, pointsResponse, photosResponse, alignmentResponse].every((response) => response.ok)) {
        throw new Error("Hendrix-eksporten eller kontrollfilene mangler");
      }
      const [manifest, data, photos, alignment] = await Promise.all([
        manifestResponse.json() as Promise<Manifest>, pointsResponse.json() as Promise<PointData>,
        photosResponse.json() as Promise<PointPhotoData>, alignmentResponse.json() as Promise<ScanAlignment>,
      ]);
      if (manifest.epsg !== 32632 || loftManifest.epsg !== manifest.epsg ||
        data.captureId !== "152958" || photos.captureId !== data.captureId ||
        alignment.referenceCaptureId !== "152950" || alignment.adjacentCaptureId !== "152958" ||
        alignment.commonPoiCount < 3 || alignment.maxPoiResidualM > 0.25) {
        throw new Error("Opptaks-ID, koordinatsystem eller POI-kontroll stemmer ikke");
      }
      const offsetDelta = manifest.offset!.map((value, axis) => value - loftManifest.offset![axis]);
      if (offsetDelta.some((value, axis) => Math.abs(value - alignment.adjacentOffsetMinusLoftOffsetM[axis]) > 0.002)) {
        throw new Error("LCC2-offset er endret siden samstillingen ble beregnet");
      }
      hendrixPhotos = photos;
      for (const point of data.points) {
        if (photos.photos[point.label]?.length !== 3) throw new Error(`Mangler bilder for Hendrix ${point.label}`);
        point.sourceCaptureId = "152958";
        point.position = point.position.map((value, axis) =>
          value + alignment.rawToExportTranslationM[axis] + offsetDelta[axis]) as [number, number, number];
        addPointMarker(point);
      }
      gcpMatchList.replaceChildren();
      const heading = document.createElement("p");
      heading.textContent = `${alignment.gcpCandidates.length} mulige felles GCP-er (navn må bekreftes i bilder):`;
      gcpMatchList.append(heading);
      for (const pair of alignment.gcpCandidates) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `H ${pair.adjacentLabel} ↔ L ${pair.loftLabel} · ${pair.distance3dM.toFixed(2)} m`;
        button.title = `Hendrix status ${pair.adjacentGnssStatus ?? "ukjent"}, Loftet status ${pair.loftGnssStatus ?? "ukjent"}`;
        button.addEventListener("click", () => {
          const point = data.points.find((candidate) => candidate.label === pair.adjacentLabel);
          if (point) showPointAnnotation(point);
        });
        gcpMatchList.append(button);
      }
      gcpMatchList.hidden = false;
      updatePointTargets();
      const matrix = new THREE.Matrix4().makeTranslation(...offsetDelta as [number, number, number]);
      const model = LCCRender.load({
        camera, scene, dataPath: new URL("local-scan/bs17-hendrix/manifest.lcc2", document.baseURI).href,
        renderLib: THREE, renderer, canvas: renderer.domElement, modelMatrix: matrix,
        useEnv: false, useIndexDB: false, useLoadingEffect: false,
      }, () => {
        updateSplatBudgets();
        updateSection();
        hendrixStatus.textContent = `Hendrix er lastet. ${alignment.commonPoiCount} interne POI-er stemmer med egen eksport innen ${alignment.maxPoiResidualM.toFixed(2)} m. Felles GCP-er er kandidater, ikke bekreftet navngivning.`;
      }, (progress) => {
        hendrixStatus.textContent = `Laster Hendrix: ${Math.round(progress * 100)} %`;
      }, () => {
        hendrixStatus.textContent = "Hendrix-modellen kunne ikke lastes.";
      });
      adjacentModel = model;
      if (hendrixPointMode) model.togglePointsDisplayMode();
      updateSection();
      model.setMaxNodeSplats(300_000);
      model.setMaxDistance(250);
      model.setLodAutoLevelUp(true);
      updateSplatBudgets();
    } catch (error) {
      showHendrix.value = "hidden";
      hendrixStatus.textContent = `Kunne ikke legge til Hendrix: ${error instanceof Error ? error.message : String(error)}`;
      console.error(error);
    } finally {
      adjacentLoading = false;
    }
  });
}

function setupBimOverlay(manifest: Manifest) {
  if (selectedScan !== "bs17-loftet") return;
  bimPanel.hidden = false;
  bimVisibility.addEventListener("change", () => {
    const visible = bimVisibility.value !== "hidden";
    bimOpacity.value = bimVisibility.value === "ghost" ? "0.2" : "0.65";
    bimOpacity.disabled = bimVisibility.value === "ghost";
    bimOpacity.dispatchEvent(new Event("input"));
    if (showBim.checked !== visible) {
      showBim.checked = visible;
      showBim.dispatchEvent(new Event("change"));
    } else if (visible) {
      bimOpacity.dispatchEvent(new Event("change"));
    }
  });
  for (const [toggle, ids, label] of [
    [showBimSpaces, () => bimSpaceIds, "Romvolumer"],
    [showBimShells, () => bimShellIds, "Tak og dekker"],
    [showBimWalls, () => bimWallIds, "Vegger"],
    [showBimOpenings, () => bimOpeningIds, "Vinduer og dører"],
    [showBimOthers, () => bimOtherIds, "Andre bygningsdeler"],
  ] as const) {
    toggle.addEventListener("change", async () => {
      if (!bimModel || !bimFragments || !ids().length) return;
      toggle.disabled = true;
      try {
        if (bimFilterActive) {
          ++bimFilterRequest;
          bimFilterResults.replaceChildren();
          await restoreBimCategoryVisibility();
        }
        await bimModel.setVisible(ids(), toggle.checked);
        await bimFragments.update(true);
        updateBimMaterialDepth(bimModel);
        bimLayerStatus.textContent = `${label}: ${toggle.checked ? "vist" : "skjult"}.`;
      } catch (error) {
        toggle.checked = !toggle.checked;
        bimLayerStatus.textContent = `Kunne ikke endre ${label.toLowerCase()}: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        toggle.disabled = false;
      }
    });
  }
  bimOpacity.addEventListener("input", () => {
    bimOpacityValue.textContent = `${Math.round(Number(bimOpacity.value) * 100)} %`;
  });
  bimOpacity.addEventListener("change", async () => {
    if (!bimModel || !bimFragments) return;
    try {
      await bimModel.setOpacity(undefined, Number(bimOpacity.value));
      await bimFragments.update(true);
      updateBimMaterialDepth(bimModel);
    } catch (error) {
      console.warn("Kunne ikke justere BIM-synlighet", error);
    }
  });
  bimLight.addEventListener("input", () => {
    const level = Number(bimLight.value);
    bimLightValue.textContent = `${Math.round(level * 100)} %`;
    bimAmbientLight.intensity = 1.1 * level;
    bimSunlight.intensity = 0.7 * level;
  });
  showBim.addEventListener("change", async () => {
    bimOpacityField.hidden = !showBim.checked;
    bimExplorer.hidden = !showBim.checked;
    if (!showBim.checked) {
      if (bimModel) bimModel.object.visible = false;
      bimStatus.textContent = "BIM-laget er skjult. Plasseringen er foreløpig og ikke kontrollert mot felles referansepunkt.";
      return;
    }
    if (bimModel) {
      bimModel.object.visible = true;
      bimStatus.textContent = "BIM-laget vises med foreløpig koordinatsamstilling.";
      return;
    }
    if (bimLoading) return;
    bimLoading = true;
    bimStatus.textContent = "Laster ARST-modellen …";
    try {
      if (manifest.epsg !== 32632 || !manifest.offset?.every(Number.isFinite)) {
        throw new Error("Skannets koordinatreferanse er ikke som forventet");
      }
      const response = await fetch(new URL("models/BS17-SEMY-ARST-ASBUILT-v2.frag", document.baseURI));
      if (!response.ok) throw new Error(`BIM-filen svarte med ${response.status}`);
      bimStatus.textContent = "BIM-fil hentet. Klargjør modellmotor …";
      const workerUrl = new URL(fragmentsWorkerUrl, document.baseURI);
      workerUrl.searchParams.set("hemy", "20261006");
      const fragments = new FragmentsModels(workerUrl.href, { maxWorkers: 2 });
      fragments.settings.autoCoordinate = false;
      const modelBytes = new Uint8Array(await response.arrayBuffer());
      bimStatus.textContent = `BIM-fil lastet (${(modelBytes.byteLength / 1_000_000).toFixed(1)} MB). Leser geometri …`;
      const model = await fragments.load(modelBytes, {
        modelId: "BS17-SEMY-ARST-ASBUILT.frag", camera,
      });
      bimStatus.textContent = "Geometri lest. Kontrollerer koordinater …";
      const coordinates = await model.getCoordinates();
      if (coordinates.length < 3 || !coordinates.slice(0, 3).every(Number.isFinite)) {
        throw new Error("BIM-modellen mangler lesbare koordinater");
      }
      const [east, north, height] = manifest.offset;
      const [fragmentEast, fragmentHeight, fragmentNorth] = coordinates;
      const shift = new THREE.Vector3(-fragmentEast - east, fragmentNorth - north, -fragmentHeight - height);
      if (Math.max(Math.abs(shift.x), Math.abs(shift.y), Math.abs(shift.z)) > 100) {
        throw new Error("BIM- og skannkoordinatene ligger for langt fra hverandre");
      }
      model.object.rotation.x = Math.PI / 2;
      model.object.position.copy(shift);
      model.object.updateMatrixWorld(true);
      model.useCamera(camera);
      model.getClippingPlanesEvent = () => sectionPlanes;
      model.onViewUpdated.add(() => updateBimMaterialDepth(model));
      scene.add(model.object);
      await model.setOpacity(undefined, Number(bimOpacity.value));
      const [spacesByCategory, shellsByCategory, wallsByCategory, openingsByCategory, geometryIds] = await Promise.all([
        model.getItemsOfCategories([/^IFCSPACE$/i]),
        model.getItemsOfCategories([/^IFCROOF$/i, /^IFCSLAB$/i, /^IFCCOVERING$/i]),
        model.getItemsOfCategories([/^IFCWALL(?:STANDARDCASE)?$/i]),
        model.getItemsOfCategories([/^IFCWINDOW$/i, /^IFCDOOR$/i]),
        model.getItemsIdsWithGeometry(),
      ]);
      bimAllGeometryIds = geometryIds;
      const geometrySet = new Set(geometryIds);
      const onlyGeometry = (categoryIds: Record<string, number[]>) =>
        [...new Set(Object.values(categoryIds).flat())].filter((id) => geometrySet.has(id));
      bimSpaceIds = onlyGeometry(spacesByCategory);
      bimShellIds = onlyGeometry(shellsByCategory);
      bimWallIds = onlyGeometry(wallsByCategory);
      bimOpeningIds = onlyGeometry(openingsByCategory);
      const filteredIds = new Set([...bimSpaceIds, ...bimShellIds, ...bimWallIds, ...bimOpeningIds]);
      bimOtherIds = geometryIds.filter((id) => !filteredIds.has(id));
      if (bimSpaceIds.length && !showBimSpaces.checked) await model.setVisible(bimSpaceIds, false);
      if (bimShellIds.length && !showBimShells.checked) await model.setVisible(bimShellIds, false);
      if (bimWallIds.length && !showBimWalls.checked) await model.setVisible(bimWallIds, false);
      if (bimOpeningIds.length && !showBimOpenings.checked) await model.setVisible(bimOpeningIds, false);
      if (bimOtherIds.length && !showBimOthers.checked) await model.setVisible(bimOtherIds, false);
      bimSpacesCount.textContent = String(bimSpaceIds.length);
      bimShellsCount.textContent = String(bimShellIds.length);
      bimWallsCount.textContent = String(bimWallIds.length);
      bimOpeningsCount.textContent = String(bimOpeningIds.length);
      bimOthersCount.textContent = String(bimOtherIds.length);
      bimLayerStatus.textContent = "Velg hvilke BIM-lag som skal vises over skannet.";
      await fragments.update(true);
      updateBimMaterialDepth(model);
      bimFragments = fragments;
      bimModel = model;
      bimIndexLoading = loadBimMetadataIndex();
      updateSection();
      bimTreeLoading = loadBimTree(model);
      model.object.visible = showBim.checked;
      lastBimCameraPosition.copy(camera.position);
      lastBimCameraQuaternion.copy(camera.quaternion);
      bimStatus.textContent = "Ny ARST-IFC vises foreløpig. Den oppgir EPSG:32632 og har romobjekter, men koordinattransformasjon og høydedatum må kontrolleres før måling.";
    } catch (error) {
      showBim.checked = false;
      bimVisibility.value = "hidden";
      bimOpacityField.hidden = true;
      bimStatus.textContent = `Kunne ikke vise BIM: ${error instanceof Error ? error.message : String(error)}`;
      console.error(error);
    } finally {
      bimLoading = false;
    }
  });
}

async function openScan() {
  try {
    let pointData: PointData | null = null;
    let fitMarkers: (() => void) | null = null;
    if (isPointScan) {
      pointData = await preparePoints();
      if (selectedScan === "bs17-loftet") setupExtraOverlays();
      const bounds = new THREE.Box3().setFromPoints(pointData.points.map((point) => new THREE.Vector3(...point.position)));
      bounds.getCenter(scanCenter);
      const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 8);
      moveSpeed = Math.max(radius * 0.1, 2);
      fitMarkers = () => {
        pressed.clear();
        setView(scanCenter.clone().add(new THREE.Vector3(radius * 0.15, -radius * 0.2, radius * 2.8)), scanCenter);
      };
      coordinateGrid = new THREE.GridHelper(Math.ceil(radius * 4), Math.ceil(radius * 4), 0x58636d, 0x39424b);
      coordinateGrid.rotation.x = Math.PI / 2;
      coordinateGrid.position.set(scanCenter.x, scanCenter.y, bounds.min.z - 0.03);
      scene.add(coordinateGrid);
      fitMarkers();
      status.textContent = `Viser ${pointData.points.length} registrerte punkter i lokale koordinater. Laster skann …`;
    }
    if (isRawLasScan) {
      if (fitMarkers) resetView.addEventListener("click", fitMarkers);
      const preview = await loadPointPreview(pointData!);
      status.textContent = `${scanName.textContent}: ${preview.points.toLocaleString("nb-NO")} fargede LAS-punkter og ${pointData!.points.length} registrerte punkter. Foreløpig plassering i Loftets ramme.`;
      loadTime.textContent = `${((performance.now() - started) / 1000).toFixed(1)} s`;
      document.querySelector<HTMLElement>("#detail-field")!.hidden = true;
      updateCollisionAvailability();
      return;
    }
    const response = await fetch(modelUrl);
    if (isPointScan && response.status === 404) {
      if (fitMarkers) resetView.addEventListener("click", fitMarkers);
      const preview = await loadPointPreview(pointData!);
      status.textContent = selectedScan === "bs17-loftet"
        ? `Loftet 152950: ${preview.points.toLocaleString("nb-NO")} LAS-punkter og ${pointData!.points.length} registrerte punkter. 3DGS-eksporten er ennå ikke tilgjengelig lokalt.`
        : `Punktsky 102311 og ${pointData!.points.length} registrerte punkter er klare. ${preview.points.toLocaleString("nb-NO")} fargede punkter; største GCP-avstand til råskannet ${Math.max(...Object.values(preview.nearestGcpMeters)).toFixed(2)} m.`;
      loadTime.textContent = `${((performance.now() - started) / 1000).toFixed(1)} s`;
      document.querySelector<HTMLElement>("#detail-field")!.hidden = true;
      updateCollisionAvailability();
      return;
    }
    if (!response.ok) throw new Error(`Skannfilen svarte med ${response.status}`);
    const manifest = await response.json() as Manifest;
    let modelTranslation: [number, number, number] = [0, 0, 0];
    if (selectedScan === "bs17-outdoor") {
      const alignment = await outdoorAlignment();
      if (JSON.stringify(alignment.outdoor.offset) !== JSON.stringify(manifest.offset)) {
        throw new Error("Utvendig LCC2-offset er endret under innlasting");
      }
      modelTranslation = alignment.delta;
    }
    if (catalogScan?.aligned) {
      const referenceResponse = await fetch(new URL("local-scan/bs17-loftet/manifest.lcc2", document.baseURI));
      if (!referenceResponse.ok) throw new Error("Loftet-referansen mangler");
      const reference = await referenceResponse.json() as Manifest;
      if (manifest.epsg !== 32632 || reference.epsg !== 32632 ||
        manifest.offset?.length !== 3 || reference.offset?.length !== 3) {
        throw new Error("Opptaket har ikke forventet koordinatreferanse");
      }
      modelTranslation = manifest.offset.map((value, axis) => value - reference.offset![axis]) as [number, number, number];
      if (Math.hypot(...modelTranslation) > 100) throw new Error("Offset avviker mer enn 100 m fra Loftet");
    }
    setupBimOverlay(manifest);
    setupAdjacentOverlay(manifest);
    let pointFrameVerified = false;
    if (pointData && selectedScan !== "bs17-outdoor" && selectedScan !== "boiler") {
      try {
        const check = await verifyPoiFrame(pointData);
        pointFrameVerified = true;
        status.textContent = `GCP-koordinater kontrollert: ${check}. Laster skannet …`;
      } catch (error) {
        for (const kind of ["GCP", "POI", "HDE", "POV"] as PointKind[]) {
          pointGroups[kind].visible = false;
          pointToggles[kind].checked = false;
          pointToggles[kind].disabled = true;
        }
        status.textContent = `${error instanceof Error ? error.message : String(error)}. Laster skannet uten punktmarkører …`;
      }
    }
    const { min, max } = manifest.root.boundingBox;
    const translatedBounds: Bounds = {
      min: min.map((value, axis) => value + modelTranslation[axis]) as [number, number, number],
      max: max.map((value, axis) => value + modelTranslation[axis]) as [number, number, number],
    };
    setupSection(translatedBounds);
    const center = new THREE.Vector3(
      (translatedBounds.min[0] + translatedBounds.max[0]) / 2,
      (translatedBounds.min[1] + translatedBounds.max[1]) / 2,
      (translatedBounds.min[2] + translatedBounds.max[2]) / 2,
    );
    const radius = new THREE.Vector3(
      max[0] - min[0], max[1] - min[1], max[2] - min[2],
    ).length() / 2;
    const fitModel = () => {
      pressed.clear();
      setView(center.clone().add(new THREE.Vector3(radius * 0.25, radius * 0.22, radius * 1.15)), center);
    };
    const fitView = (pointFrameVerified || selectedScan === "boiler") && fitMarkers ? fitMarkers : fitModel;
    if (fitView === fitModel) {
      moveSpeed = Math.max(radius * 0.1, 2);
    }
    resetView.addEventListener("click", fitView);
    if (coordinateGrid) coordinateGrid.visible = false;
    fitView();

    const model = LCCRender.load({
      camera,
      scene,
      dataPath: modelUrl,
      modelMatrix: new THREE.Matrix4().makeTranslation(...modelTranslation),
      renderLib: THREE,
      renderer,
      canvas: renderer.domElement,
      useEnv: false,
      useIndexDB: false,
      useLoadingEffect: false,
    }, () => {
      updateSplatBudgets();
      fitView();
      status.textContent = isPointScan
        ? selectedScan === "bs17-outdoor" ? "Utvendig 3DGS er klar med bildemarkører. EPSG:32632 er angitt; felles ankere og høydedatum er foreløpige." :
          selectedScan === "boiler" ? "Boiler room er klar med fem lokale POI-bilder. Samstilling mot øvrige BS17-opptak er ennå ikke verifisert." :
          (showGcps.disabled ? "Skannet er klart. GCP-overlegget er skjult fordi koordinatene ikke ble verifisert." : selectedScan === "bs17-loftet" ? "Loftets 3DGS er klar med kontrollpunkter og bildebobler. Plassering er kontrollert mot POI-punkter." : "Skann og GCP-punkter er klare. Plassering er kontrollert mot POI-punkter.")
        : "Skannet er klart. Klikk i visningen for å styre med mus og tastatur.";
      loadTime.textContent = `${((performance.now() - started) / 1000).toFixed(1)} s`;
      points.disabled = false;
      updateCollisionAvailability();
    }, (progress) => {
      status.textContent = `Laster skann: ${Math.round(progress * 100)} %`;
    }, () => {
      if (selectedScan === "bs17-outdoor" && pointData) {
        void loadPointPreview(pointData).then((preview) => {
          status.textContent = `Utvendig LCC2 kunne ikke lastes. Viser ${preview.points.toLocaleString("nb-NO")} LAS-punkter som reserve.`;
        }).catch((error) => { status.textContent = `Utvendig skann kunne ikke lastes: ${String(error)}`; });
      } else status.textContent = "Skannet kunne ikke lastes. Se feilen i nettleserkonsollen.";
    });
    scanModel = model;
    if (selectedScan === "bs17-loftet") {
      for (const [id, visibility] of [
        ["152958", showHendrix],
        ["183256", extraScanControls["183256"].visibility],
        ["112646", extraScanControls["112646"].visibility],
      ] as const) {
        if (selectedLayerIds.has(id)) {
          visibility.value = savedModelPreferences.visibility?.[id] ?? "visible";
          visibility.dispatchEvent(new Event("change"));
        }
      }
      for (const [id, controls] of catalogControls) {
        if (!selectedLayerIds.has(id)) continue;
        controls.visibility.value = savedModelPreferences.visibility?.[id] ?? "visible";
        controls.visibility.dispatchEvent(new Event("change"));
      }
      if (bimVisibility.value !== "hidden") bimVisibility.dispatchEvent(new Event("change"));
    }
    if (!singleLayerPanel.hidden) {
      if (singleDisplay.value === "points") {
        model.togglePointsDisplayMode();
        pointMode = true;
        points.textContent = "Bytt til splatvisning";
      }
      singleVisibility.addEventListener("change", () => {
        updateSection();
        updateSplatBudgets();
      });
      singleDisplay.addEventListener("change", () => {
        const next = singleDisplay.value === "points";
        if (pointMode !== next) model.togglePointsDisplayMode();
        pointMode = next;
        points.textContent = pointMode ? "Bytt til splatvisning" : "Bytt til punktvisning";
      });
    }
    if (selectedScan === "bs17-loftet" && loftPointMode) model.togglePointsDisplayMode();
    updateSection();
    updateCollisionAvailability();

    model.setMaxNodeSplats(500_000);
    model.setMaxDistance(250);
    model.setLodAutoLevelUp(true);
    updateSplatBudgets();
    detail.addEventListener("change", updateSplatBudgets);
    points.addEventListener("click", () => {
      model.togglePointsDisplayMode();
      pointMode = !pointMode;
      if (!singleLayerPanel.hidden) singleDisplay.value = pointMode ? "points" : "splat";
      points.textContent = pointMode ? "Bytt til splatvisning" : "Bytt til punktvisning";
    });
  } catch (error) {
    status.textContent = `Kunne ikke starte skannvisningen: ${error instanceof Error ? error.message : String(error)}`;
    console.error(error);
  }
}

initViewerSidebar();
document.querySelector<HTMLButtonElement>("#mobile-layers-button")!.addEventListener("click", (event) => {
  const button = event.currentTarget as HTMLElement;
  const rect = button.getBoundingClientRect();
  showModelContextMenu(rect.left, rect.top - 8);
});

if (propertyId === "bs17") {
  for (const card of modelCards) {
    const id = card.dataset.layerId!;
    const visibility = visibilityForLayer(id);
    if (visibility && savedModelPreferences.visibility?.[id])
      visibility.value = savedModelPreferences.visibility[id];
    const display = card.querySelector<HTMLSelectElement>(".layer-display");
    if (display && savedModelPreferences.display?.[id])
      display.value = savedModelPreferences.display[id];
    const marker = card.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (marker && savedModelPreferences.markers?.[id] !== undefined)
      marker.checked = savedModelPreferences.markers[id];
  }
  if (savedModelPreferences.detail) detail.value = savedModelPreferences.detail;
  if (savedModelPreferences.separateScans !== undefined) separateScans.checked = savedModelPreferences.separateScans;
  if (savedModelPreferences.separationHeight) scanSeparationHeight.value = savedModelPreferences.separationHeight;
  loftPointMode = loftDisplay.value === "points";
  hendrixPointMode = hendrixDisplay.value === "points";
  outdoorPointMode = outdoorDisplay.value === "points";
  for (const controls of catalogControls.values()) controls.pointMode = controls.display.value === "points";
  setupCatalogOverlays();
  void openScan();
}
