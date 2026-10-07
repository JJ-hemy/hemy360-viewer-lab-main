type DemoProject = { id: string; name: string; children?: DemoProject[]; proposed?: boolean; source?: "faro" };
type JobwalkCapture = { version: number; capturedAt: string; image: string; original: string };
type JobwalkPoint = { id: string; floor: string; x: number; y: number; sourceUrl: string; captures: JobwalkCapture[] };

// Hemy Projects names and parent links come from the supplied screenshot.
// JobWalk is a separate FARO source project grouped under Office to Retail Space in this demo.
// No Dynamics record IDs or project-specific URLs were supplied.
const bs17Projects: DemoProject[] = [
  { id: "main", name: "BS17 - Construction Project: Main Project", children: [
    { id: "objectification", name: "BS17 - Objektifisering av skannede Hard Assets", proposed: true },
    { id: "facade", name: "BS17 - Construction Project: Facade", children: [
      { id: "facade-info", name: "BS17 - Information Management: Facade" },
    ] },
    { id: "retail", name: "BS17 - Construction Project: Office to Retail Space", children: [
      { id: "jobwalk", name: "BS17 - CP: Office to Retail Space (JobWalk)", source: "faro" },
      { id: "fiber", name: "BS17 - Construction Project: New fiber distribution cabinet in the basement" },
      { id: "access", name: "BS17 - Construction Project: Access Control", children: [
        { id: "access-info", name: "BS17 - Information Management: Access Control" },
      ] },
      { id: "alarm", name: "BS17 - Construction Project: Fire Alarm", children: [
        { id: "alarm-info", name: "BS17 - Information Management: Fire Alarm" },
      ] },
      { id: "retail-info", name: "BS17 - Information Management: Office to Retail Space" },
    ] },
  ] },
  { id: "ntc-extra", name: "BS17 - Construction Project - Tilleggs lokale NTC Services AS", children: [
    { id: "ntc-extra-info", name: "BS17 - Information Management - Tilleggs lokale NTC Services AS" },
  ] },
  { id: "entrance", name: "BS17 - Construction Project: Baldakin Installation at Entrance" },
  { id: "cooling", name: "BS17 - Construction Project - NTC Services AS: Replacement of Cooling Units" },
  { id: "geothermal", name: "BS17 - Construction Project: Geothermal Heating/Heat Pump" },
  { id: "roofing", name: "BS17 - Construction Project: Roofing Assessment and Rehabilitation for Solar Panel Installation" },
];

export function initViewerSidebar() {
  const panel = document.querySelector<HTMLElement>("#scan-pilot > .panel")!;
  const projectSelect = document.querySelector<HTMLSelectElement>("#project-select")!;
  const projectNote = document.querySelector<HTMLElement>("#project-selection-note")!;
  const projectById = new Map<string, { project: DemoProject; parent?: DemoProject }>();

  function addProject(project: DemoProject, depth = 0, parent?: DemoProject) {
    projectById.set(project.id, { project, parent });
    const option = new Option(`${"　".repeat(depth)}${depth ? "↳ " : ""}${project.name}${project.proposed ? " · forslag" : ""}`, project.id);
    projectSelect.add(option);
    for (const child of [...(project.children ?? [])].sort((a, b) => a.name.localeCompare(b.name, "nb")))
      addProject(child, depth + 1, project);
  }
  for (const root of [...bs17Projects].sort((a, b) => a.id === "main" ? -1 : b.id === "main" ? 1 : a.name.localeCompare(b.name, "nb")))
    addProject(root);
  projectSelect.value = "objectification";
  function updateProjectNote() {
    const selected = projectById.get(projectSelect.value);
    if (!selected) return;
    projectNote.textContent = selected.project.source === "faro"
      ? `JobWalk-prosjekt fra FARO Sphere XG under «${selected.parent?.name}». 172 kartpunkter er hentet inn; historiske 360-opptak er under overføring. Ikke opprettet i Hemy Projects.`
      : selected.project.proposed
        ? `Foreslått underprosjekt under «${selected.parent?.name}». Ikke opprettet i Hemy Projects.`
        : selected.parent ? `Overprosjekt: ${selected.parent.name}` : "Hovedprosjekt eller prosjekt uten overprosjekt vist i kilden.";
  }
  projectSelect.addEventListener("change", updateProjectNote);
  updateProjectNote();

  const jobwalkPanel = document.querySelector<HTMLDialogElement>("#jobwalk-map-panel")!;
  const jobwalkFloorSelect = document.querySelector<HTMLSelectElement>("#jobwalk-floor-select")!;
  const jobwalkFloorImage = document.querySelector<HTMLImageElement>("#jobwalk-floor-image")!;
  const jobwalkMap = document.querySelector<HTMLElement>("#jobwalk-map")!;
  const jobwalkStatus = document.querySelector<HTMLElement>("#jobwalk-map-status")!;
  const jobwalkPoints = document.querySelector<HTMLElement>("#jobwalk-map-points")!;
  const floorCounts: Record<string, number> = { "01": 67, "02": 100, "03": 5 };
  let jobwalkManifest: { waypoints: JobwalkPoint[] } | undefined;
  let openPanorama: ((id: string, captures: JobwalkCapture[]) => void) | undefined;
  async function showJobwalkFloor(floor: string) {
    if (!(floor in floorCounts)) return;
    jobwalkStatus.textContent = "Laster bildepunkt …";
    jobwalkPoints.replaceChildren();
    jobwalkFloorImage.src = new URL(`jobwalk/bs17-office-retail/floor-${floor}.webp`, document.baseURI).href;
    jobwalkFloorImage.alt = `JobWalk plantegning ${floor}. FLOOR`;
    jobwalkMap.setAttribute("aria-label", `JobWalk ${floor}. FLOOR med omtrentlige bildepunkt`);
    try {
      if (!jobwalkManifest) {
        const response = await fetch(new URL("jobwalk/bs17-office-retail/manifest.json", document.baseURI));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        jobwalkManifest = await response.json() as { waypoints: JobwalkPoint[] };
      }
      const points = jobwalkManifest.waypoints.filter((point) => point.floor === floor);
      if (points.length !== floorCounts[floor]) throw new Error("Antall bildepunkt stemmer ikke med JobWalk-eksporten");
      points.forEach((point, index) => {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
        const marker = document.createElement("button");
        marker.className = "jobwalk-map-point";
        marker.type = "button";
        if (point.captures.length) {
          marker.classList.add("jobwalk-map-point-local");
          marker.addEventListener("click", async () => {
            if (!openPanorama) openPanorama = (await import("./jobwalk-panorama")).initJobwalkPanorama();
            openPanorama(point.id, point.captures);
          });
        } else {
          marker.classList.add("jobwalk-map-point-pending");
          marker.addEventListener("click", () => {
            jobwalkStatus.textContent = `${point.id}: 360-bildet er ennå ikke importert til Hemy360. Punktet blir værende på dette kartet.`;
          });
        }
        marker.style.left = `${point.x * 100}%`;
        marker.style.top = `${point.y * 100}%`;
        marker.setAttribute("aria-label", point.captures.length
          ? `Åpne JobWalk punkt ${index + 1}`
          : `JobWalk punkt ${index + 1}: 360-bildet er ikke importert`);
        marker.title = point.captures.length
          ? `${point.id} · ${point.captures.length} opptak i Hemy360`
          : `${point.id} · 360-bilde ikke importert`;
        jobwalkPoints.append(marker);
      });
      const localCount = points.filter((point) => point.captures.length).length;
      jobwalkStatus.textContent = `${jobwalkPoints.childElementCount} punkter fra ${floor}. FLOOR · ${localCount} med egne 360-bilder. Historiske opptak flyttes fortløpende til Hemy360.`;
    } catch (error) {
      jobwalkStatus.textContent = `Kunne ikke laste bildepunkt: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  document.querySelector<HTMLButtonElement>("#jobwalk-map-close")!.addEventListener("click", () => jobwalkPanel.close());
  jobwalkFloorSelect.addEventListener("change", () => void showJobwalkFloor(jobwalkFloorSelect.value));
  document.querySelector<HTMLButtonElement>("#jobwalk-map-open")!.addEventListener("click", async () => {
    jobwalkPanel.showModal();
    await showJobwalkFloor(jobwalkFloorSelect.value);
  });
  projectSelect.addEventListener("change", () => {
    if (projectSelect.value === "jobwalk" && !jobwalkPanel.open)
      document.querySelector<HTMLButtonElement>("#jobwalk-map-open")!.click();
  });

  const scanGroup = document.createElement("details");
  scanGroup.id = "scan-tools-group";
  scanGroup.className = "sidebar-group";
  scanGroup.open = true;
  scanGroup.innerHTML = '<summary>3D-skann og lag</summary><div class="sidebar-group-body"></div>';
  const bimGroup = document.createElement("details");
  bimGroup.id = "bim-tools-group";
  bimGroup.className = "sidebar-group";
  bimGroup.innerHTML = '<summary>BIM og modelltre</summary><div class="sidebar-group-body"></div>';
  const scanBody = scanGroup.querySelector<HTMLElement>(".sidebar-group-body")!;
  const bimBody = bimGroup.querySelector<HTMLElement>(".sidebar-group-body")!;
  const firstScanField = document.querySelector<HTMLElement>("#scan-field")!;
  panel.insertBefore(scanGroup, firstScanField);
  scanGroup.after(bimGroup);
  for (const selector of [
    "#scan-field", "#scan-layer-picker", "#single-layer-panel", "#adjacent-panel",
    "#noise-mask-panel", "#gcp-panel", "#detail-field", "#section-panel",
    ".wheel-speed-field", "#reset-view", "#points", ".toggle[for='collision']",
    "#collision-status", ".controls-guide", "#status", ".metrics", "#scan-note",
  ]) {
    const item = panel.querySelector<HTMLElement>(selector);
    if (item && item.parentElement === panel) scanBody.append(item);
  }
  const bimPanel = panel.querySelector<HTMLElement>("#bim-panel");
  if (bimPanel) bimBody.append(bimPanel);

  const host = document.querySelector<HTMLElement>("#scan-pilot")!;
  const grip = document.querySelector<HTMLElement>("#sidebar-resize-handle")!;
  const storageKey = "hemy360-viewer-sidebar-width-v1";
  let width = 350;
  try {
    const saved = Number(localStorage.getItem(storageKey));
    if (Number.isFinite(saved) && saved >= 260 && saved <= 600) width = saved;
  } catch { /* Width still works without browser storage. */ }
  function setWidth(next: number) {
    width = Math.max(260, Math.min(600, Math.round(next)));
    host.style.setProperty("--viewer-sidebar-width", `${width}px`);
    grip.setAttribute("aria-valuenow", String(width));
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }
  function saveWidth() {
    try { localStorage.setItem(storageKey, String(width)); } catch { /* Optional preference. */ }
  }
  setWidth(width);
  let startX = 0;
  let startWidth = width;
  grip.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    startX = event.clientX; startWidth = width;
    grip.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  grip.addEventListener("pointermove", (event) => {
    if (grip.hasPointerCapture(event.pointerId)) setWidth(startWidth + event.clientX - startX);
  });
  grip.addEventListener("pointerup", (event) => {
    if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
    saveWidth();
  });
  grip.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    setWidth(width + (event.key === "ArrowRight" ? 20 : -20));
    saveWidth(); event.preventDefault();
  });

  const canvasHost = document.querySelector<HTMLElement>("#canvas-host")!;
  const sectionPanel = document.querySelector<HTMLElement>("#section-panel")!;
  const sectionHome = sectionPanel.parentElement!;
  const mobileTools = document.createElement("nav");
  mobileTools.id = "mobile-viewer-tools";
  mobileTools.setAttribute("aria-label", "Verktøy for mobilvisning");
  mobileTools.innerHTML = '<button id="mobile-layers-button" type="button">Lag</button><button id="mobile-section-button" type="button">Snitt</button><button id="mobile-section-options-button" type="button">Snittvalg</button><button id="mobile-fit-button" type="button">Tilpass</button>';
  canvasHost.append(mobileTools);

  const sectionDialog = document.createElement("dialog");
  sectionDialog.id = "mobile-section-dialog";
  sectionDialog.setAttribute("aria-label", "Snittplan");
  sectionDialog.innerHTML = '<div class="mobile-dialog-heading"><strong>Snittplan</strong><button type="button" aria-label="Lukk snittplan">×</button></div><p id="mobile-section-unavailable" hidden>Snittplan blir tilgjengelige når skannet er lastet.</p>';
  document.body.append(sectionDialog);
  const unavailable = sectionDialog.querySelector<HTMLElement>("#mobile-section-unavailable")!;
  const closeSection = () => sectionDialog.close();
  sectionDialog.querySelector("button")!.addEventListener("click", closeSection);
  sectionDialog.addEventListener("close", () => {
    if (sectionPanel.parentElement === sectionDialog) sectionHome.append(sectionPanel);
  });
  mobileTools.querySelector<HTMLButtonElement>("#mobile-section-button")!.addEventListener("click", () => {
    if (!sectionPanel.hidden) {
      document.dispatchEvent(new Event("viewer:pick-section-plane"));
      return;
    }
    unavailable.hidden = false;
    sectionDialog.showModal();
  });
  mobileTools.querySelector<HTMLButtonElement>("#mobile-section-options-button")!.addEventListener("click", () => {
    unavailable.hidden = !sectionPanel.hidden;
    if (!sectionPanel.hidden) sectionDialog.append(sectionPanel);
    sectionDialog.showModal();
  });
  mobileTools.querySelector<HTMLButtonElement>("#mobile-fit-button")!.addEventListener("click", () => {
    document.querySelector<HTMLButtonElement>("#reset-view")?.click();
  });
}
