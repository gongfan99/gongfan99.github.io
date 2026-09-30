import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

const viewDefinitions = [
  { label: "IN USE / THREE-QUARTER", direction: [3.2, 2.1, 3.5] },
  { label: "SIDE PROFILE", direction: [0, 0.4, 4] },
  { label: "FRONT EDGE", direction: [4, 0.5, 0] },
  { label: "REAR EDGE", direction: [-4, 0.5, 0] },
  { label: "OPPOSITE PROFILE", direction: [0, 0.4, -4] },
  { label: "LOW THREE-QUARTER", direction: [-3.2, 1, 3.5] },
];

const grid = document.querySelector("#view-grid");
const fileInput = document.querySelector("#file-input");
const downloadButton = document.querySelector("#download-button");
const titleInput = document.querySelector("#sheet-title");
const status = document.querySelector("#model-status");
const materialSummary = document.querySelector("#material-summary");
const settingsDialog = document.querySelector("#settings-dialog");
const materialSelect = document.querySelector("#material-select");
const colorInput = document.querySelector("#color-input");
const colorValue = document.querySelector("#color-value");
const useColor = document.querySelector("#use-color");
const toast = document.querySelector("#toast");
const dropOverlay = document.querySelector("#drop-overlay");

const views = [];
let sourceModel;
let sourceIsSample = false;
let originalByMesh = new WeakMap();
let customMaterials = [];
let renderPending = false;
let toastTimeout;
let loadToken = 0;
let dragDepth = 0;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("visible"), 3800);
}

function requestRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    views.forEach((view) => {
      const width = view.stage.clientWidth;
      const height = view.stage.clientHeight;
      if (!width || !height) return;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      view.renderer.setPixelRatio(pixelRatio);
      view.renderer.setSize(width, height, false);
      const aspect = width / height;
      const halfHeight = Math.max(1.62, 1.78 / aspect);
      view.camera.left = -halfHeight * aspect;
      view.camera.right = halfHeight * aspect;
      view.camera.top = halfHeight;
      view.camera.bottom = -halfHeight;
      view.camera.updateProjectionMatrix();
      view.renderer.render(view.scene, view.camera);
    });
  });
}

function makeView(definition, index) {
  const card = document.createElement("article");
  card.className = "view-card";
  card.innerHTML = `<div class="view-top"><span>VIEW ${String(index + 1).padStart(2, "0")}</span><span class="cross" aria-hidden="true">+</span></div><div class="view-stage" aria-label="3D view ${index + 1}"></div><div class="view-caption"><span class="view-index">${String(index + 1).padStart(2, "0")}</span><input class="view-label" aria-label="Description for view ${index + 1}" maxlength="90" spellcheck="false"><span class="edit-mark" aria-hidden="true">✎</span></div>`;
  const label = card.querySelector(".view-label");
  label.value = definition.label;
  grid.append(card);

  const stage = card.querySelector(".view-stage");
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  });
  renderer.setClearColor(0xffffff, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  stage.append(renderer.domElement);

  const scene = new THREE.Scene();
  const ambient = new THREE.HemisphereLight(0xffffff, 0xd8c8b1, 1.55);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xf2e1c9, 0.8);
  scene.add(fill);

  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 100);
  camera.position
    .set(...definition.direction)
    .normalize()
    .multiplyScalar(5);
  camera.lookAt(0, 0, 0);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.enablePan = false;
  controls.minZoom = 0.55;
  controls.maxZoom = 4;
  const keyOffset = new THREE.Vector3(-3, 4, 1.5);
  const fillOffset = new THREE.Vector3(3, 1, 0);
  function syncLights() {
    ambient.position.copy(camera.position);
    key.position
      .copy(keyOffset)
      .applyQuaternion(camera.quaternion)
      .add(camera.position);
    fill.position
      .copy(fillOffset)
      .applyQuaternion(camera.quaternion)
      .add(camera.position);
  }
  syncLights();
  controls.addEventListener("change", () => {
    syncLights();
    requestRender();
  });
  const view = { stage, renderer, scene, camera, controls, model: null };
  views.push(view);
  new ResizeObserver(requestRender).observe(stage);
}

viewDefinitions.forEach(makeView);

function makeSampleModel() {
  // A small bent stand gives the sheet a useful preview before a file is loaded.
  const outline = new THREE.Shape();
  outline.moveTo(-1.08, -0.83);
  outline.lineTo(-0.12, 0.82);
  outline.quadraticCurveTo(0.04, 1.08, 0.23, 0.95);
  outline.lineTo(1.02, -0.62);
  outline.quadraticCurveTo(1.19, -0.92, 1.45, -0.84);
  outline.quadraticCurveTo(1.7, -0.79, 1.79, -0.49);
  outline.quadraticCurveTo(1.84, -0.39, 1.95, -0.45);
  outline.quadraticCurveTo(2.05, -0.51, 2, -0.62);
  outline.quadraticCurveTo(1.86, -1.03, 1.49, -1.05);
  outline.lineTo(-1.05, -1.05);
  outline.quadraticCurveTo(-1.26, -1.04, -1.08, -0.83);
  const hole = new THREE.Path();
  hole.moveTo(-0.78, -0.82);
  hole.lineTo(0.05, 0.62);
  hole.quadraticCurveTo(0.11, 0.72, 0.17, 0.61);
  hole.lineTo(0.88, -0.82);
  hole.closePath();
  outline.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth: 0.52,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.045,
    bevelThickness: 0.045,
    curveSegments: 16,
  });
  geometry.computeVertexNormals();
  const material = new THREE.MeshPhysicalMaterial({
    color: "#ddc7a7",
    roughness: 0.72,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, material));
  return group;
}

function normalizedModel(rawModel) {
  // CAD exports can include curve and vertex primitives over the shaded mesh.
  // The sheet is a surface study, so remove those overlays before framing it.
  const overlays = [];
  rawModel.traverse((child) => {
    if (child.isLine || child.isPoints) overlays.push(child);
  });
  overlays.forEach((child) => child.parent?.remove(child));
  const box = new THREE.Box3().setFromObject(rawModel);
  if (box.isEmpty())
    throw new Error("This GLB does not contain visible geometry.");
  const size = box.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(largest) || largest <= 0)
    throw new Error("This GLB has invalid geometry.");
  const center = box.getCenter(new THREE.Vector3());
  const wrapper = new THREE.Group();
  const scale = 2.65 / largest;
  wrapper.add(rawModel);
  wrapper.scale.setScalar(scale);
  wrapper.position.copy(center).multiplyScalar(-scale);
  return wrapper;
}

function releasePreviousModel() {
  for (const view of views) {
    if (view.model) view.scene.remove(view.model);
    view.model = null;
  }
  customMaterials.forEach((material) => material.dispose());
  customMaterials = [];
  if (sourceModel) {
    const geometries = new Set();
    const materials = new Set();
    sourceModel.traverse((child) => {
      if (!child.isMesh) return;
      geometries.add(child.geometry);
      const list = Array.isArray(child.material)
        ? child.material
        : [child.material];
      list.forEach((material) => materials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }
}

function installModel(rawModel, sample = false) {
  const normalized = normalizedModel(rawModel);
  releasePreviousModel();
  sourceModel = normalized;
  sourceIsSample = sample;
  originalByMesh = new WeakMap();
  for (const view of views) {
    view.model = cloneSkeleton(sourceModel);
    view.scene.add(view.model);
    view.model.traverse((child) => {
      if (child.isMesh) originalByMesh.set(child, child.material);
    });
    view.controls.reset();
  }
  applyAppearance();
  requestRender();
}

const finishes = {
  matte: { roughness: 0.96, metalness: 0, clearcoat: 0 },
  satin: { roughness: 0.5, metalness: 0.02, clearcoat: 0.18 },
  metal: { roughness: 0.35, metalness: 0.82, clearcoat: 0 },
  gloss: { roughness: 0.13, metalness: 0, clearcoat: 0.9 },
};

function createStyledMaterial(original, finish, tint) {
  const p = finishes[finish] || {
    roughness: original.roughness ?? 0.65,
    metalness: original.metalness ?? 0,
    clearcoat: original.clearcoat ?? 0,
  };
  const material = new THREE.MeshPhysicalMaterial({
    color: tint
      ? new THREE.Color(colorInput.value)
      : original.color?.clone() || new THREE.Color("#ffffff"),
    map: tint ? null : original.map || null,
    normalMap: original.normalMap || null,
    aoMap: original.aoMap || null,
    emissive: original.emissive?.clone() || new THREE.Color(0x000000),
    emissiveMap: original.emissiveMap || null,
    transparent: original.transparent,
    opacity: original.opacity,
    alphaTest: original.alphaTest,
    side: original.side,
    roughness: p.roughness,
    metalness: p.metalness,
    clearcoat: p.clearcoat,
  });
  material.name = `Character sheet / ${finish}`;
  return material;
}

function applyAppearance() {
  customMaterials.forEach((material) => material.dispose());
  customMaterials = [];
  const finish = materialSelect.value;
  const tint = useColor.checked;
  const cache = new Map();
  views.forEach((view) =>
    view.model?.traverse((child) => {
      if (!child.isMesh) return;
      const original = originalByMesh.get(child);
      const styleOne = (material) => {
        if (finish === "original" && !tint) return material;
        if (!cache.has(material)) {
          const replacement = createStyledMaterial(material, finish, tint);
          cache.set(material, replacement);
          customMaterials.push(replacement);
        }
        return cache.get(material);
      };
      child.material = Array.isArray(original)
        ? original.map(styleOne)
        : styleOne(original);
    }),
  );
  const finishLabel =
    finish === "original"
      ? "ORIGINAL GLB"
      : materialSelect.selectedOptions[0].textContent.toUpperCase();
  materialSummary.innerHTML = `MATERIAL <span class="footer-slash">/</span> ${tint ? colorInput.value.toUpperCase() + ", " : ""}${finishLabel}`;
  requestRender();
}

function resetAppearance(quiet = false) {
  materialSelect.value = "original";
  useColor.checked = false;
  colorInput.value = sourceIsSample ? "#ddc7a7" : "#ffffff";
  colorValue.textContent = colorInput.value.toUpperCase();
  applyAppearance();
  if (!quiet) showToast("Original colors and materials restored.");
}

async function loadFile(file, { initial = false } = {}) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".glb")) {
    showToast("Please choose a .glb file.");
    return;
  }
  const token = ++loadToken;
  status.textContent = `Loading ${file.name}…`;
  try {
    const buffer = await file.arrayBuffer();
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath(
      "https://cdn.jsdelivr.net/npm/three@0.182.0/examples/jsm/libs/draco/gltf/",
    );
    loader.setDRACOLoader(draco);
    const gltf = await loader.parseAsync(buffer, "");
    draco.dispose();
    if (token !== loadToken) return;
    installModel(gltf.scene);
    titleInput.value = file.name
      .replace(/\.glb$/i, "")
      .replace(/[_-]+/g, " ")
      .toUpperCase();
    status.textContent = `${file.name} · ${formatBytes(file.size)}`;
    resetAppearance(true);
    if (!initial) showToast("GLB loaded in all six views.");
  } catch (error) {
    console.error(error);
    status.textContent = "Could not load GLB · choose another file";
    showToast(error?.message || "Could not load this GLB file.");
  } finally {
    fileInput.value = "";
  }
}

function formatBytes(bytes) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

document
  .querySelector("#upload-button")
  .addEventListener("click", () => fileInput.click());
downloadButton.addEventListener("click", async () => {
  if (downloadButton.disabled) return;
  downloadButton.disabled = true;
  const oldLabel = downloadButton.querySelector("span").textContent;
  downloadButton.querySelector("span").textContent = "EXPORTING…";
  try {
    if (!window.html2canvas)
      throw new Error("PNG export is unavailable. Please reload the page.");
    await document.fonts.ready;
    views.forEach((view) => view.renderer.render(view.scene, view.camera));
    const sheet = document.querySelector(".sheet");
    const titleForExport = titleInput.value;
    const labelsForExport = [...document.querySelectorAll(".view-label")].map(
      (input) => input.value,
    );
    const canvas = await window.html2canvas(sheet, {
      backgroundColor: "#f3f0e9",
      scale: 2,
      useCORS: true,
      scrollX: 0,
      scrollY: -window.scrollY,
      logging: false,
      onclone: (clonedDocument) => {
        const clonedButton = clonedDocument.querySelector("#download-button");
        clonedButton.disabled = false;
        clonedButton.querySelector("span").textContent = oldLabel;
        const replaceInput = (input, value) => {
          const text = clonedDocument.createElement("span");
          text.className = `${input.className} export-text`;
          text.textContent = value;
          input.replaceWith(text);
        };
        replaceInput(
          clonedDocument.querySelector("#sheet-title"),
          titleForExport,
        );
        clonedDocument
          .querySelectorAll(".view-label")
          .forEach((input, index) =>
            replaceInput(input, labelsForExport[index]),
          );
      },
    });
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("Could not create the PNG file.");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(titleInput.value.trim() || "character-sheet").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-sheet.png`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    showToast("Character sheet saved as PNG.");
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Could not export PNG.");
  } finally {
    downloadButton.disabled = false;
    downloadButton.querySelector("span").textContent = oldLabel;
  }
});
fileInput.addEventListener("change", () => loadFile(fileInput.files[0]));
document
  .querySelector("#settings-button")
  .addEventListener("click", () => settingsDialog.showModal());
document
  .querySelector("#close-settings")
  .addEventListener("click", () => settingsDialog.close());
document
  .querySelector("#done-settings")
  .addEventListener("click", () => settingsDialog.close());
settingsDialog.addEventListener("click", (event) => {
  if (event.target === settingsDialog) settingsDialog.close();
});
document
  .querySelector("#reset-appearance")
  .addEventListener("click", () => resetAppearance());
materialSelect.addEventListener("change", applyAppearance);
useColor.addEventListener("change", applyAppearance);
colorInput.addEventListener("input", () => {
  colorValue.textContent = colorInput.value.toUpperCase();
  useColor.checked = true;
  applyAppearance();
});

document.addEventListener("dragenter", (event) => {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  dragDepth++;
  dropOverlay.hidden = false;
});
document.addEventListener("dragover", (event) => {
  if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
});
document.addEventListener("dragleave", (event) => {
  if (!event.dataTransfer?.types.includes("Files")) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.hidden = true;
});
document.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  dropOverlay.hidden = true;
  loadFile(event.dataTransfer?.files[0]);
});

async function loadInitialModel() {
  const tokenAtStart = loadToken;
  try {
    const response = await fetch("./phone-stand.glb");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (tokenAtStart !== loadToken) return;
    await loadFile(
      new File([blob], "phone-stand.glb", { type: "model/gltf-binary" }),
      { initial: true },
    );
  } catch (error) {
    console.error("Could not load phone-stand.glb:", error);
    if (tokenAtStart !== loadToken) return;
    installModel(makeSampleModel(), true);
    status.textContent =
      "Built-in GLB could not be loaded · drop a GLB to begin";
    materialSummary.innerHTML =
      'MATERIAL <span class="footer-slash">/</span> WARM BEIGE, SATIN';
  }
}

loadInitialModel();
