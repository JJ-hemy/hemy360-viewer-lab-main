import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LCCRender } from "../vendor/xgrids-web-sdk/lcc-sdk-three.js";
import "./sol-viewer.css";

type Bounds = { min: [number,number,number]; max: [number,number,number] };
type Manifest = { epsg?: number; root: { boundingBox: Bounds } };
const options = {
  sol20: { title: "Sol20 · Viewer Lab", name: "Sol20 · exterior LCC2 scan", path: "local-scan/sol20/manifest.lcc2" },
  "sol24-26": { title: "Sol24–26 · Viewer Lab", name: "Sol24–26 · exterior LCC2 scan", path: "local-scan/sol24-26/manifest.lcc2" },
} as const;
type Property = keyof typeof options;
const query = new URLSearchParams(location.search);
const property: Property = query.get("property") === "sol24-26" ? "sol24-26" : "sol20";
const current = options[property];
const propertySelect = document.querySelector<HTMLSelectElement>("#property")!;
propertySelect.value = property;
propertySelect.addEventListener("change", () => {
  if (propertySelect.value === "bs17") location.assign("lcc2.html?scan=bs17-loftet&theme=hemy&lang=en");
  else location.assign(`sol-viewer.html?property=${propertySelect.value}`);
});
document.querySelector<HTMLElement>("#title")!.textContent = current.title;
document.querySelector<HTMLElement>("#model-name")!.textContent = current.name;
document.title = `Hemy360 · ${property === "sol20" ? "Sol20" : "Sol24–26"}`;
const status = document.querySelector<HTMLElement>("#status")!;
const host = document.querySelector<HTMLElement>("#canvas-host")!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15191e);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 5000);
camera.up.set(0,0,1);
const renderer = new THREE.WebGLRenderer({ antialias:false, powerPreference:"high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
host.append(renderer.domElement);
const controls = new OrbitControls(camera,renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.2;
controls.maxDistance = 3000;
controls.screenSpacePanning = true;
const resize = () => {const w=host.clientWidth,h=host.clientHeight; camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();renderer.setSize(w,h,false);};
new ResizeObserver(resize).observe(host);
resize();
let fit = () => {};
document.querySelector<HTMLButtonElement>("#fit")!.addEventListener("click",()=>fit());
document.querySelector<HTMLButtonElement>("#mobile-fit")!.addEventListener("click",()=>fit());
document.querySelector<HTMLButtonElement>("#show-info")!.addEventListener("click",()=>document.querySelector(".sidebar")!.classList.toggle("open"));
const manifestUrl = new URL(current.path,document.baseURI).href;
async function start(){
  const response=await fetch(manifestUrl);
  if(!response.ok) throw new Error(`The model manifest returned ${response.status}`);
  const manifest=await response.json() as Manifest;
  const {min,max}=manifest.root.boundingBox;
  const center=new THREE.Vector3((min[0]+max[0])/2,(min[1]+max[1])/2,(min[2]+max[2])/2);
  const radius=new THREE.Vector3(max[0]-min[0],max[1]-min[1],max[2]-min[2]).length()/2;
  fit=()=>{controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(radius*.45,-radius*.8,radius*.75));camera.near=Math.max(radius/10000,.01);camera.far=Math.max(radius*20,1000);camera.updateProjectionMatrix();controls.update();};
  fit();
  document.querySelector<HTMLElement>("#model-context")!.textContent=manifest.epsg===32632
    ? "The export declares EPSG:32632. Alignment with the project models has not been verified."
    : "The export uses a local coordinate system (EPSG 0). Alignment with the project models has not been verified.";
  const model=LCCRender.load({camera,scene,dataPath:manifestUrl,modelMatrix:new THREE.Matrix4(),renderLib:THREE,renderer,canvas:renderer.domElement,useEnv:false,useIndexDB:false,useLoadingEffect:false},
    ()=>{model.setMaxNodeSplats(400_000);model.setMaxSplats(matchMedia("(max-width: 720px)").matches?750_000:1_800_000);status.textContent="The 3D scan is ready. Drag to rotate; use two fingers to zoom and pan.";},
    progress=>{status.textContent=`Loading scan: ${Math.round(progress*100)}%`;},
    ()=>{status.textContent="Could not load the scan. Try refreshing the page.";});
  renderer.setAnimationLoop(()=>{controls.update();LCCRender.update();renderer.render(scene,camera);});
}
void start().catch(error=>{status.textContent=`Could not open the model: ${String(error)}`;});
