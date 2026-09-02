import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  compileUsingDeclarations,
  DISPOSER_PARAMETER,
  supportsNativeUsing,
} from "./using-compiler.mjs";

const LIBCASCADE_VERSION = "3.0.2";
const LIBCASCADE_CDN_BASE = `https://cdn.jsdelivr.net/npm/libcascade@${LIBCASCADE_VERSION}/dist/`;
const LINEAR_DEFLECTION = 0.1;
const ANGULAR_DEFLECTION = 0.5;
const DEFAULT_MODEL_COLOR = 0xd4a72c;
const DEFAULT_MODEL_METALNESS = 0.2;
const DEFAULT_CODE = `// The initialized libcascade instance is available as "oc".
// Assign one TopoDS_Shape or an array of shapes to "result".
using box = new oc.BRepPrimAPI_MakeBox(60, 40, 20);
result = box.Shape();`;

const dom = {
  root: document.documentElement,
  body: document.body,
  codeEditor: document.querySelector("#codeEditor"),
  exampleSelect: document.querySelector("#exampleSelect"),
  runButton: document.querySelector("#runButton"),
  errorPanel: document.querySelector(".error-panel"),
  errorLog: document.querySelector("#errorLog"),
  errorCount: document.querySelector("#errorCount"),
  codeHighlight: document.querySelector("#codeHighlight"),
  codeHighlightCode: document.querySelector("#codeHighlight code"),
  wasmBadge: document.querySelector("#wasmBadge"),
  runtimeBadge: document.querySelector("#runtimeBadge"),
  modelMeta: document.querySelector("#modelMeta"),
  viewer: document.querySelector("#viewer"),
  viewerCanvas: document.querySelector("#viewerCanvas"),
  axisCanvas: document.querySelector("#axisCanvas"),
  emptyState: document.querySelector("#emptyState"),
  viewerStatus: document.querySelector("#viewerStatus"),
  statusText: document.querySelector("#statusText"),
  exportMenu: document.querySelector("#exportMenu"),
  themeToggle: document.querySelector("#themeToggle"),
  exportButtons: [...document.querySelectorAll("[data-export]")],
};

let ocPromise;
let runtimePreloadPromise;
let runtimeReady = false;
let runNumber = 0;
let busy = false;
let currentModel = null;
let currentSceneRoot = null;
let errorTotal = 0;

let renderer;
let scene;
let camera;
let controls;
let modelGroup;
let gltfLoader;

class PipelineError extends Error {
  constructor(phase, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "PipelineError";
    this.phase = phase;
  }
}

function setStatus(message, state = "ready") {
  dom.statusText.textContent = message;
  dom.viewerStatus.dataset.state = state;
  dom.runtimeBadge.textContent = message;
}

function setWasmStatus() {
  dom.wasmBadge.textContent = "WASM · single-threaded";
}

function refreshControls() {
  dom.runButton.disabled = busy || !runtimeReady;
  dom.runButton.classList.toggle("is-running", busy);
  dom.runButton.setAttribute("aria-busy", String(busy));
  dom.exportButtons.forEach((button) => {
    button.disabled = busy || !currentModel;
  });
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

const JAVASCRIPT_KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "finally",
  "for",
  "from",
  "function",
  "get",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "of",
  "return",
  "set",
  "static",
  "super",
  "switch",
  "throw",
  "try",
  "typeof",
  "using",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

const JAVASCRIPT_LITERALS = new Set([
  "false",
  "null",
  "this",
  "true",
  "undefined",
]);

function escapeHtml(value) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

function syntaxToken(className, value) {
  return `<span class="syntax-${className}">${escapeHtml(value)}</span>`;
}

function highlightJavaScript(source) {
  let html = "";
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (character === "/" && nextCharacter === "/") {
      const end = source.indexOf("\n", index);
      const commentEnd = end === -1 ? source.length : end;
      html += syntaxToken("comment", source.slice(index, commentEnd));
      index = commentEnd;
      continue;
    }

    if (character === "/" && nextCharacter === "*") {
      const end = source.indexOf("*/", index + 2);
      const commentEnd = end === -1 ? source.length : end + 2;
      html += syntaxToken("comment", source.slice(index, commentEnd));
      index = commentEnd;
      continue;
    }

    if (character === "'" || character === '"' || character === "`") {
      const quote = character;
      let end = index + 1;
      while (end < source.length) {
        if (source[end] === "\\") {
          end += 2;
          continue;
        }
        if (source[end] === quote) {
          end += 1;
          break;
        }
        end += 1;
      }
      html += syntaxToken("string", source.slice(index, end));
      index = end;
      continue;
    }

    const number = source
      .slice(index)
      .match(/^(?:0[bBoOxX][\da-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?n?)/i);
    if (number) {
      html += syntaxToken("number", number[0]);
      index += number[0].length;
      continue;
    }

    const identifier = source.slice(index).match(/^[A-Za-z_$][\w$]*/);
    if (identifier) {
      const word = identifier[0];
      const tokenClass = JAVASCRIPT_KEYWORDS.has(word)
        ? "keyword"
        : JAVASCRIPT_LITERALS.has(word)
          ? "literal"
          : word === "oc"
            ? "builtin"
            : "identifier";
      html +=
        tokenClass === "identifier"
          ? escapeHtml(word)
          : syntaxToken(tokenClass, word);
      index += word.length;
      continue;
    }

    if (/[+\-*/%=!<>&|^~?:]/.test(character)) {
      let end = index + 1;
      while (end < source.length && /[+\-*/%=!<>&|^~?:]/.test(source[end])) {
        end += 1;
      }
      html += syntaxToken("operator", source.slice(index, end));
      index = end;
      continue;
    }

    html += escapeHtml(character);
    index += 1;
  }

  return html || " ";
}

function syncCodeHighlight() {
  if (!dom.codeHighlight) return;
  dom.codeHighlight.style.transform = `translate(${-dom.codeEditor.scrollLeft}px, ${-dom.codeEditor.scrollTop}px)`;
}

function updateCodeHighlight() {
  dom.codeHighlightCode.innerHTML = highlightJavaScript(dom.codeEditor.value);
  syncCodeHighlight();
}

function updateErrorPanel(message = "No errors yet.") {
  dom.errorPanel.dataset.state = errorTotal > 0 ? "error" : "empty";
  dom.errorLog.textContent = message;
  dom.errorCount.textContent = String(errorTotal);
  dom.errorLog.scrollTop = dom.errorLog.scrollHeight;
}

function clearErrors() {
  errorTotal = 0;
  updateErrorPanel();
}

function reportError(phase, error) {
  errorTotal += 1;
  const message = formatError(error);
  updateErrorPanel(`${phase}: ${message}`);
  console.error(`[${phase}]`, error);
}

function formatError(error) {
  if (error instanceof PipelineError) {
    return error.message;
  }
  if (error && typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function getOc() {
  if (!ocPromise) {
    ocPromise = createSingleInstanceFromInitializer()
      .then((instance) => {
        runtimeReady = true;
        return instance;
      })
      .catch((error) => {
        ocPromise = undefined;
        runtimeReady = false;
        throw error;
      });
  }

  return ocPromise;
}

async function createSingleInstanceFromInitializer() {
  const initializerUrl = `${LIBCASCADE_CDN_BASE}init.single.js`;
  const { createInstance } = await import(initializerUrl);
  if (typeof createInstance !== "function") {
    throw new Error(
      `The libcascade initializer did not export createInstance: ${initializerUrl}`,
    );
  }
  return createInstance();
}

function preloadRuntimeOnInteraction() {
  if (runtimePreloadPromise || ocPromise) return;

  if (!busy) {
    setStatus("Loading libcascade…", "working");
  }

  runtimePreloadPromise = getOc()
    .then(() => {
      setWasmStatus();
      refreshControls();
      if (!busy) {
        setStatus("Ready to run", "ready");
      }
    })
    .catch((error) => {
      runtimePreloadPromise = undefined;
      runtimeReady = false;
      refreshControls();
      if (!busy) {
        reportError("Initialize", error);
        setStatus("Initialize failed", "error");
      }
    });
}

function initializeRuntimePreload() {
  [
    "pointerdown",
    "keydown",
    "focusin",
    "input",
    "change",
    "mousemove",
    "scroll",
  ].forEach((eventName) => {
    dom.body.addEventListener(eventName, preloadRuntimeOnInteraction, {
      capture: true,
    });
  });
}

function disposeUsingResource(value) {
  if (value == null) return;
  if (typeof value !== "object" && typeof value !== "function") {
    throw new TypeError("using resources must be objects or functions.");
  }

  const symbolDisposer =
    typeof Symbol.dispose === "symbol" ? value[Symbol.dispose] : undefined;
  const disposer =
    typeof symbolDisposer === "function"
      ? symbolDisposer
      : typeof value.delete === "function"
        ? value.delete
        : undefined;

  if (typeof disposer !== "function") {
    throw new TypeError(
      "using resource does not implement Symbol.dispose or delete().",
    );
  }
  disposer.call(value);
}

async function executeUserCode(oc, executableSource) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const parameters = ["oc"];
  const values = [oc];
  if (executableSource.usesUsing) {
    parameters.push(DISPOSER_PARAMETER);
    values.push(disposeUsingResource);
  }
  const runner = new AsyncFunction(
    ...parameters,
    `"use strict";\nlet result;\n${executableSource.code}\nreturn result;`,
  );
  return runner(...values);
}

function normalizeShapes(oc, value) {
  const shapes = Array.isArray(value) ? value : [value];
  if (shapes.length === 0) {
    throw new Error("result must contain at least one TopoDS_Shape.");
  }

  if (!oc.TopoDS_Shape) {
    throw new Error(
      "The loaded libcascade build does not expose TopoDS_Shape.",
    );
  }

  for (const [index, shape] of shapes.entries()) {
    if (!(shape instanceof oc.TopoDS_Shape)) {
      throw new Error(`result[${index}] is not a TopoDS_Shape.`);
    }
    if (shape.IsNull()) {
      throw new Error(`result[${index}] is a null TopoDS_Shape.`);
    }
  }

  return shapes;
}

function disposeNative(value, seen = new Set()) {
  if (
    !value ||
    (typeof value !== "object" && typeof value !== "function") ||
    seen.has(value)
  ) {
    return;
  }
  seen.add(value);

  try {
    const disposer =
      typeof Symbol.dispose === "symbol" ? value[Symbol.dispose] : undefined;
    if (typeof disposer === "function") {
      disposer.call(value);
    } else if (typeof value.delete === "function") {
      value.delete();
    }
  } catch (error) {
    console.warn("Failed to dispose a libcascade resource", error);
  }
}

function disposeNativeList(values) {
  const seen = new Set();
  for (const value of values) {
    disposeNative(value, seen);
  }
}

function createXcafDocument(oc, shapes) {
  const docName = new oc.TCollection_ExtendedString("document", true);
  let doc;
  try {
    doc = new oc.TDocStd_Document(docName);
  } finally {
    disposeNative(docName);
  }

  try {
    // libcascade returns the XCAFDoc_ShapeTool wrapper directly here; unlike
    // some OCCT Handle-returning APIs, this binding does not expose `.get()`.
    const shapeTool = oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main());
    for (const [index, shape] of shapes.entries()) {
      const label = shapeTool.AddShape(shape, true, false);
      const name = new oc.TCollection_ExtendedString(
        `Shape ${index + 1}`,
        true,
      );
      try {
        oc.TDataStd_Name.Set(label, name);
      } finally {
        disposeNative(name);
      }
    }
    return doc;
  } catch (error) {
    disposeNative(doc);
    throw error;
  }
}

function tessellateShapes(oc, shapes) {
  for (const shape of shapes) {
    const mesh = new oc.BRepMesh_IncrementalMesh(
      shape,
      LINEAR_DEFLECTION,
      false,
      ANGULAR_DEFLECTION,
      false,
    );
    try {
      if (typeof mesh.IsDone === "function" && !mesh.IsDone()) {
        throw new Error("OCCT did not finish tessellating a shape.");
      }
    } finally {
      disposeNative(mesh);
    }
  }

  computeShapeNormals(oc, shapes);
}

function computeShapeNormals(oc, shapes) {
  if (typeof oc.BRepLib_ToolTriangulatedShape?.ComputeNormals !== "function") {
    throw new Error(
      "The loaded libcascade build does not expose BRepLib_ToolTriangulatedShape.ComputeNormals.",
    );
  }

  for (const shape of shapes) {
    const explorer = new oc.TopExp_Explorer(
      shape,
      oc.TopAbs_ShapeEnum.TopAbs_FACE,
    );
    try {
      while (explorer.More()) {
        let current;
        let face;
        let location;
        let triangulationResult;
        let connectivity;
        try {
          current = explorer.Current();
          face = oc.TopoDS.Face(current);
          location = new oc.TopLoc_Location();
          triangulationResult = oc.BRep_Tool.Triangulation(face, location, 0);
          const triangulation =
            triangulationResult?.returnValue ?? triangulationResult;
          if (triangulation && !triangulation.IsNull?.()) {
            connectivity = new oc.Poly_Connect();
            oc.BRepLib_ToolTriangulatedShape.ComputeNormals(
              face,
              triangulation,
              connectivity,
            );
          }
        } finally {
          disposeNative(connectivity);
          disposeNative(triangulationResult);
          disposeNative(location);
          disposeNative(face);
          disposeNative(current);
        }
        explorer.Next();
      }
    } finally {
      disposeNative(explorer);
    }
  }
}

function uniquePath(extension, id) {
  return `/libcascade-${id}.${extension}`;
}

function readAndUnlink(oc, path) {
  try {
    const rawBytes = oc.FS.readFile(path);
    const bytes = Uint8Array.from(rawBytes);
    if (bytes.byteLength === 0) {
      throw new Error(`Generated file is empty: ${path}`);
    }
    return bytes;
  } finally {
    try {
      oc.FS.unlink(path);
    } catch {
      // The primary error, if any, is more useful than a cleanup error.
    }
  }
}

function writeGlb(oc, doc, id) {
  const path = uniquePath("glb", id);
  const fileName = new oc.TCollection_AsciiString(path);
  const writer = new oc.RWGltf_CafWriter(fileName, true);
  const metadata = new oc.TColStd_IndexedDataMapOfStringString();
  const progress = new oc.Message_ProgressRange();

  try {
    if (!writer.Perform(doc, metadata, progress)) {
      throw new Error("RWGltf_CafWriter failed to write the GLB.");
    }
    return readAndUnlink(oc, path);
  } finally {
    disposeNative(progress);
    disposeNative(metadata);
    disposeNative(writer);
    disposeNative(fileName);
    try {
      oc.FS.unlink(path);
    } catch {
      // readAndUnlink already removed the file in the normal path.
    }
  }
}

function writeStep(oc, doc, id) {
  const path = uniquePath("step", id);
  const writer = new oc.STEPCAFControl_Writer();
  const progress = new oc.Message_ProgressRange();

  try {
    oc.Interface_Static.SetIVal("write.step.schema", 5);
    if (!writer.Perform(doc, path, progress)) {
      throw new Error("STEPCAFControl_Writer failed to write the STEP file.");
    }
    return readAndUnlink(oc, path);
  } finally {
    disposeNative(progress);
    disposeNative(writer);
    try {
      oc.FS.unlink(path);
    } catch {
      // readAndUnlink already removed the file in the normal path.
    }
  }
}

function writeStl(oc, shapes, id) {
  const path = uniquePath("stl", id);
  let stlShape = shapes[0];
  let compound;
  let builder;

  try {
    if (shapes.length > 1) {
      compound = new oc.TopoDS_Compound();
      builder = new oc.TopoDS_Builder();
      builder.MakeCompound(compound);
      for (const shape of shapes) {
        builder.Add(compound, shape);
      }
      stlShape = compound;
    }

    if (!oc.StlAPI.Write(stlShape, path, false)) {
      throw new Error("StlAPI failed to write the binary STL file.");
    }
    return readAndUnlink(oc, path);
  } finally {
    disposeNative(builder);
    disposeNative(compound);
    try {
      oc.FS.unlink(path);
    } catch {
      // readAndUnlink already removed the file in the normal path.
    }
  }
}

function bytesForArrayBuffer(bytes) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

function parseGlb(bytes) {
  return new Promise((resolve, reject) => {
    gltfLoader.parse(bytesForArrayBuffer(bytes), "", resolve, reject);
  });
}

function createStagedScene(gltf) {
  const root = new THREE.Group();
  root.name = "libcascade model";
  root.add(gltf.scene);

  // RWGltf_CafWriter preserves OCCT's Z-up convention. The viewer is Y-up.
  root.rotation.x = -Math.PI / 2;
  root.updateMatrixWorld(true);

  let renderableCount = 0;
  root.traverse((object) => {
    if (object.isMesh && object.geometry) {
      renderableCount += 1;
      object.castShadow = true;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if (!material) continue;
        material.color?.set(DEFAULT_MODEL_COLOR);
        if ("metalness" in material) {
          material.metalness = DEFAULT_MODEL_METALNESS;
        }
        material.side = THREE.DoubleSide;
        material.needsUpdate = true;
      }
    }
  });

  if (renderableCount === 0) {
    disposeThreeObject(root);
    throw new Error("The GLB contains no renderable mesh.");
  }

  return root;
}

function cameraStateFor(root, preserveView = false) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) {
    throw new Error("Could not calculate bounds for the generated model.");
  }

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 1);
  const distance =
    (maxDimension / (2 * Math.tan(THREE.MathUtils.degToRad(45) / 2))) * 1.35;
  const direction = new THREE.Vector3(1.15, 0.9, 1.15).normalize();
  const view =
    preserveView && camera && controls
      ? (() => {
          const cameraOffset = camera.position.clone().sub(controls.target);
          return {
            center,
            position: center.clone().add(cameraOffset),
          };
        })()
      : {
          center,
          position: center.clone().add(direction.multiplyScalar(distance)),
        };

  return {
    center: view.center,
    position: view.position,
    near: Math.max(maxDimension / 1000, 0.01),
    far: Math.max(maxDimension * 100, 1000),
    size,
  };
}

function applyCameraState(state) {
  camera.up.set(0, 1, 0);
  camera.near = state.near;
  camera.far = state.far;
  camera.position.copy(state.position);
  camera.updateProjectionMatrix();
  controls.target.copy(state.center);
  controls.update();
  drawAxisGizmo();
}

function disposeThreeObject(root) {
  if (!root) return;
  root.traverse((object) => {
    if (object.geometry) {
      object.geometry.dispose();
    }
    if (object.material) {
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value && typeof value === "object" && value.isTexture) {
            value.dispose();
          }
        }
        material.dispose();
      }
    }
  });
}

function disposeModel(model) {
  if (!model) return;
  disposeNativeList(model.shapes);
  disposeNative(model.doc);
}

function cssColor(variable, fallback) {
  return (
    getComputedStyle(dom.root).getPropertyValue(variable).trim() || fallback
  );
}

function resizeViewer() {
  const width = Math.max(1, dom.viewer.clientWidth);
  const height = Math.max(1, dom.viewer.clientHeight);
  const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  drawAxisGizmo();
}

function drawArrow(ctx, from, to, color, label, darkMode) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = 5;
  ctx.save();
  ctx.strokeStyle = darkMode ? "rgba(255,255,255,.92)" : "rgba(0,0,0,.72)";
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - head * Math.cos(angle - Math.PI / 6),
    to.y - head * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    to.x - head * Math.cos(angle + Math.PI / 6),
    to.y - head * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
  ctx.font = "600 11px Inter, ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3;
  ctx.strokeStyle = darkMode ? "rgba(18,18,18,.92)" : "rgba(245,245,245,.96)";
  ctx.strokeText(label, to.x + Math.cos(angle) * 7, to.y + Math.sin(angle) * 7);
  ctx.fillStyle = color;
  ctx.fillText(label, to.x + Math.cos(angle) * 7, to.y + Math.sin(angle) * 7);
  ctx.restore();
}

function drawAxisGizmo() {
  if (!camera || !dom.axisCanvas) return;
  const canvas = dom.axisCanvas;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.scale(dpr, dpr);

  const screenWidth = rect.width;
  const screenHeight = rect.height;
  const center = new THREE.Vector2(screenWidth / 2, screenHeight / 2 + 3);
  const length = Math.min(screenWidth, screenHeight) * 0.31;
  const inverseCamera = camera.quaternion.clone().invert();
  const axes = [
    { vector: new THREE.Vector3(1, 0, 0), color: "#ef4444", label: "X" },
    { vector: new THREE.Vector3(0, 1, 0), color: "#22c55e", label: "Y" },
    { vector: new THREE.Vector3(0, 0, 1), color: "#3b82f6", label: "Z" },
  ]
    .map((axis) => {
      const view = axis.vector.clone().applyQuaternion(inverseCamera);
      return {
        ...axis,
        depth: view.z,
        endpoint: new THREE.Vector2(
          center.x + view.x * length,
          center.y - view.y * length,
        ),
      };
    })
    .sort((a, b) => a.depth - b.depth);

  const darkMode = dom.root.classList.contains("dark");
  for (const axis of axes) {
    drawArrow(ctx, center, axis.endpoint, axis.color, axis.label, darkMode);
  }
  ctx.fillStyle = darkMode ? "#fafafa" : "#171717";
  ctx.beginPath();
  ctx.arc(center.x, center.y, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function initViewer() {
  renderer = new THREE.WebGLRenderer({
    canvas: dom.viewerCanvas,
    antialias: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(cssColor("--color-background", "#f5f5f5"));

  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
  camera.position.set(100, 80, 100);
  camera.up.set(0, 1, 0);

  controls = new OrbitControls(camera, dom.viewerCanvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 0);
  controls.addEventListener("change", drawAxisGizmo);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 2.1));
  const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
  keyLight.position.set(80, 120, 100);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xffffff, 1.1);
  fillLight.position.set(-70, 30, -90);
  scene.add(fillLight);

  modelGroup = new THREE.Group();
  scene.add(modelGroup);
  gltfLoader = new GLTFLoader();

  renderer.setAnimationLoop(() => {
    renderer.render(scene, camera);
  });

  new ResizeObserver(resizeViewer).observe(dom.viewer);
  resizeViewer();
  drawAxisGizmo();
}

function updateTheme() {
  scene.background.set(cssColor("--color-background", "#f5f5f5"));
  dom.themeToggle.setAttribute(
    "aria-label",
    dom.root.classList.contains("dark")
      ? "Switch to light theme"
      : "Switch to dark theme",
  );
  drawAxisGizmo();
}

function setTheme(theme) {
  dom.root.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem("libcascade-theme", theme);
  } catch {
    // Theme persistence is optional in restricted browser contexts.
  }
  updateTheme();
}

function initializeTheme() {
  let theme;
  try {
    theme = localStorage.getItem("libcascade-theme");
  } catch {
    theme = null;
  }
  if (!theme) {
    theme = matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  dom.root.classList.toggle("dark", theme === "dark");
}

function updateModelMeta(model) {
  dom.modelMeta.textContent = model
    ? `${model.shapes.length} shape${model.shapes.length === 1 ? "" : "s"}`
    : "No model loaded";
  dom.emptyState.hidden = Boolean(model);
}

function commitStage(stage) {
  const previousModel = currentModel;
  if (currentSceneRoot) {
    modelGroup.remove(currentSceneRoot);
    disposeThreeObject(currentSceneRoot);
  }

  modelGroup.add(stage.scene);
  currentSceneRoot = stage.scene;
  currentModel = {
    oc: stage.oc,
    shapes: stage.shapes,
    doc: stage.doc,
    glbBytes: stage.glbBytes,
    cameraState: stage.cameraState,
  };
  applyCameraState(stage.cameraState);
  updateModelMeta(currentModel);
  disposeModel(previousModel);
}

function disposeStage(stage) {
  if (!stage) return;
  if (stage.scene && stage.scene !== currentSceneRoot) {
    disposeThreeObject(stage.scene);
  }
  disposeNativeList(stage.shapes || []);
  disposeNative(stage.doc);
}

async function runScript() {
  if (busy) return;
  busy = true;
  refreshControls();
  clearErrors();
  setStatus("Loading libcascade…", "working");
  let phase = "Initialize";
  let stage;
  const id = ++runNumber;

  try {
    await nextFrame();
    const oc = await getOc();
    setWasmStatus();

    let executableSource = {
      code: dom.codeEditor.value,
      usesUsing: false,
    };
    if (!supportsNativeUsing()) {
      phase = "Compile";
      setStatus("Compiling script…", "working");
      executableSource = compileUsingDeclarations(dom.codeEditor.value);
    }

    phase = "Execute";
    setStatus("Running script…", "working");
    const rawResult = await executeUserCode(oc, executableSource);

    phase = "Validate";
    const shapes = normalizeShapes(oc, rawResult);
    stage = {
      oc,
      shapes,
      doc: null,
      glbBytes: null,
      scene: null,
      cameraState: null,
    };

    phase = "XCAF";
    setStatus("Creating XCAF document…", "working");
    stage.doc = createXcafDocument(oc, shapes);

    phase = "Tessellate";
    setStatus("Tessellating geometry…", "working");
    await nextFrame();
    tessellateShapes(oc, shapes);

    phase = "GLB";
    setStatus("Writing GLB…", "working");
    await nextFrame();
    stage.glbBytes = writeGlb(oc, stage.doc, id);

    phase = "Viewer";
    setStatus("Preparing viewer…", "working");
    await nextFrame();
    const gltf = await parseGlb(stage.glbBytes);
    stage.scene = createStagedScene(gltf);
    stage.cameraState = cameraStateFor(stage.scene, Boolean(currentModel));

    // Viewer parsing and camera preparation succeeded. Commit all new state at once.
    commitStage(stage);
    stage = null;
    setStatus("Model ready", "ready");
  } catch (error) {
    const wrapped =
      error instanceof PipelineError
        ? error
        : new PipelineError(phase, formatError(error), error);
    reportError(wrapped.phase, wrapped);
    setStatus(`${wrapped.phase} failed`, "error");
    disposeStage(stage);
  } finally {
    busy = false;
    refreshControls();
  }
}

function downloadBytes(bytes, filename, mimeType) {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function exportCurrent(format) {
  if (busy || !currentModel) return;
  busy = true;
  refreshControls();
  const id = ++runNumber;
  const phase = format.toUpperCase();

  try {
    setStatus(`Exporting ${phase}…`, "working");
    await nextFrame();
    let bytes;
    let filename;
    let mimeType;

    if (format === "glb") {
      bytes = currentModel.glbBytes;
      filename = "libcascade-model.glb";
      mimeType = "model/gltf-binary";
    } else if (format === "step") {
      bytes = writeStep(currentModel.oc, currentModel.doc, id);
      filename = "libcascade-model.step";
      mimeType = "application/step";
    } else {
      bytes = writeStl(currentModel.oc, currentModel.shapes, id);
      filename = "libcascade-model.stl";
      mimeType = "model/stl";
    }

    if (!bytes?.byteLength) {
      throw new Error(`${phase} export returned an empty file.`);
    }
    downloadBytes(bytes, filename, mimeType);
    setStatus(`${phase} downloaded`, "ready");
    dom.exportMenu.open = false;
  } catch (error) {
    reportError(phase, error);
    setStatus(`${phase} failed`, "error");
  } finally {
    busy = false;
    refreshControls();
  }
}

function initializeEditor() {
  dom.codeEditor.value = DEFAULT_CODE;
  updateCodeHighlight();
  dom.codeEditor.addEventListener("input", updateCodeHighlight);
  dom.codeEditor.addEventListener("scroll", syncCodeHighlight);
  dom.codeEditor.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      runScript();
    }
  });
}

async function loadExample(filename) {
  if (!filename) return;

  const exampleName =
    dom.exampleSelect.selectedOptions[0]?.textContent || "Example";
  try {
    const response = await fetch(`./examples/${filename}`, {
      cache: "no-cache",
    });
    if (!response.ok) {
      throw new Error(`Could not load ${exampleName} (${response.status}).`);
    }

    dom.codeEditor.value = (await response.text()).replace(/^\uFEFF/, "");
    dom.codeEditor.scrollTop = 0;
    dom.codeEditor.scrollLeft = 0;
    updateCodeHighlight();
    clearErrors();
    dom.codeEditor.focus();
    dom.codeEditor.scrollTop = 0;
    dom.codeEditor.scrollLeft = 0;
    syncCodeHighlight();
    setStatus(
      runtimeReady ? `${exampleName} loaded` : "Loading libcascade…",
      runtimeReady ? "ready" : "working",
    );
  } catch (error) {
    reportError("Example", error);
    setStatus("Example failed", "error");
  }
}

function initializeExamples() {
  dom.exampleSelect.addEventListener("change", () =>
    loadExample(dom.exampleSelect.value),
  );
}

initializeTheme();
initializeEditor();
initializeExamples();
initializeRuntimePreload();
setWasmStatus();
initViewer();
updateTheme();
updateModelMeta(null);
refreshControls();

dom.runButton.addEventListener("click", runScript);
dom.themeToggle.addEventListener("click", () => {
  setTheme(dom.root.classList.contains("dark") ? "light" : "dark");
});
dom.exportButtons.forEach((button) => {
  button.addEventListener("click", () => exportCurrent(button.dataset.export));
});
