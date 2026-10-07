import * as THREE from "three";

export type JobwalkCapture = {
  version: number;
  capturedAt: string;
  image: string;
  original: string;
};

export function initJobwalkPanorama() {
  const dialog = document.querySelector<HTMLDialogElement>("#jobwalk-photo-panel")!;
  const host = document.querySelector<HTMLElement>("#jobwalk-photo-view")!;
  const title = document.querySelector<HTMLElement>("#jobwalk-photo-title")!;
  const status = document.querySelector<HTMLElement>("#jobwalk-photo-status")!;
  const versionSelect = document.querySelector<HTMLSelectElement>("#jobwalk-photo-version")!;
  const originalLink = document.querySelector<HTMLAnchorElement>("#jobwalk-photo-original")!;
  document.querySelector<HTMLButtonElement>("#jobwalk-photo-close")!.addEventListener("click", () => dialog.close());

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.domElement.style.touchAction = "none";
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(10, 64, 48).scale(-1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  scene.add(sphere);
  const pointers = new Map<number, { x: number; y: number }>();
  let lon = 0;
  let lat = 0;
  let distance = 0;
  let captures: JobwalkCapture[] = [];

  function render() {
    if (!dialog.open) return;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const phi = THREE.MathUtils.degToRad(90 - lat);
    const theta = THREE.MathUtils.degToRad(lon);
    camera.lookAt(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    renderer.render(scene, camera);
  }
  new ResizeObserver(render).observe(host);
  function loadVersion(index: number) {
    const capture = captures[index];
    if (!capture) return;
    status.textContent = `Laster versjon ${capture.version} …`;
    originalLink.href = new URL(`jobwalk/bs17-office-retail/${capture.original}`, document.baseURI).href;
    originalLink.download = capture.original.split("/").pop() ?? "jobwalk-original.jpeg";
    const imageUrl = new URL(`jobwalk/bs17-office-retail/${capture.image}`, document.baseURI).href;
    new THREE.TextureLoader().load(imageUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = sphere.material as THREE.MeshBasicMaterial;
      material.map?.dispose();
      material.map = texture;
      material.needsUpdate = true;
      status.textContent = `Versjon ${capture.version} · ${new Date(capture.capturedAt).toLocaleString("nb-NO")}`;
      render();
    }, undefined, () => { status.textContent = "Kunne ikke laste 360-bildet."; });
  }
  versionSelect.addEventListener("change", () => loadVersion(Number(versionSelect.value)));
  renderer.domElement.addEventListener("pointerdown", (event) => {
    renderer.domElement.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    distance = 0;
  });
  renderer.domElement.addEventListener("pointermove", (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      lon -= (event.clientX - previous.x) * 0.16;
      lat = THREE.MathUtils.clamp(lat + (event.clientY - previous.y) * 0.16, -85, 85);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const next = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance) camera.fov = THREE.MathUtils.clamp(camera.fov * distance / next, 30, 100);
      distance = next;
    }
    render();
  });
  for (const type of ["pointerup", "pointercancel"])
    renderer.domElement.addEventListener(type, (event: Event) => {
      pointers.delete((event as PointerEvent).pointerId);
      distance = 0;
    });
  renderer.domElement.addEventListener("wheel", (event) => {
    event.preventDefault();
    camera.fov = THREE.MathUtils.clamp(camera.fov + event.deltaY * 0.04, 30, 100);
    render();
  }, { passive: false });
  return (waypointId: string, nextCaptures: JobwalkCapture[]) => {
    captures = nextCaptures;
    title.textContent = `${waypointId} · 360°`;
    versionSelect.replaceChildren();
    captures.forEach((capture, index) => {
      const label = `v${capture.version} · ${new Date(capture.capturedAt).toLocaleString("nb-NO")}`;
      versionSelect.add(new Option(label, String(index)));
    });
    lon = 0;
    lat = 0;
    camera.fov = 75;
    dialog.showModal();
    loadVersion(captures.length - 1);
    render();
  };
}
