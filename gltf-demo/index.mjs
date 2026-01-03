import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import MainModule from "gltf_draco_transcoder";

// WASM module instance
let wasmModule = null;

// Application state
let compressionLevel = 7;
let positionQuantization = 11;
let environmentBrightness = 0.5; // 0.0 to 1.0

// Syncing flag to prevent infinite recursion
let isSyncing = false;

// UI elements
let leftCanvas, rightCanvas;
let leftScene, rightScene;
let leftCamera, rightCamera;
let leftRenderer, rightRenderer;
let leftControls, rightControls;
let leftModel, rightModel;

// Performance metrics
let compressionTime = 0;
let decompressionTime = 0;

// Current GLTF data
let currentRawGltf = null;
let currentCompressedGltf = null;
let originalRawGltf = null;
let originalCompressedGltf = null;

// Constants
const MODEL_NAME = "currentModel";

// DOM elements
let dropZone, settingsBtn, settingsDialog;
let compressionLevelInput, positionQuantizationInput;
let compressionLevelValue, positionQuantizationValue;
let compressionTimeEl, decompressionTimeEl;
let leftSizeEl, leftGzipEl, rightSizeEl, rightGzipEl;
let leftDownloadBtn, rightDownloadBtn;

// Initialize WASM module
async function initWasm() {
  try {
    wasmModule = await MainModule();
    console.log("WASM module loaded successfully");
  } catch (error) {
    console.error("Failed to load WASM module:", error);
  }
}

// Draco detection function (GLB format only)
function isDracoCompressed(gltfBuffer) {
  try {
    // Verify GLB magic header
    const dataView = new DataView(gltfBuffer);
    const magic = String.fromCharCode(
      ...new Uint8Array(gltfBuffer.slice(0, 4))
    );
    if (magic !== "glTF") {
      throw Error("no magic word glTF found in the file");
    }

    // GLB format: skip header and find JSON chunk
    let offset = 12; // After header
    while (offset < gltfBuffer.byteLength) {
      const chunkLength = dataView.getUint32(offset, true);
      const chunkType = dataView.getUint32(offset + 4, true);
      offset += 8;

      if (chunkType === 0x4e4f534a) {
        // JSON chunk
        const jsonData = gltfBuffer.slice(offset, offset + chunkLength);
        const textDecoder = new TextDecoder();
        const jsonString = textDecoder.decode(jsonData);
        const gltf = JSON.parse(jsonString);

        // Traverse all meshes and primitives to check for Draco compression
        if (gltf.meshes) {
          for (const mesh of gltf.meshes) {
            if (mesh.primitives) {
              for (const primitive of mesh.primitives) {
                if (
                  primitive.extensions &&
                  primitive.extensions.KHR_draco_mesh_compression
                ) {
                  return true;
                }
              }
            }
          }
        }

        return false;
      }

      offset += chunkLength;
    }
  } catch (error) {
    console.error("Error detecting Draco compression:", error);
  }
  return false;
}

// Compression/decompression functions
async function compressGltf(rawGltf) {
  if (!wasmModule) await initWasm();
  const startTime = performance.now();
  const compressed = wasmModule.compress_gltf(rawGltf, {
    compression_level: compressionLevel,
    quantization_position: positionQuantization,
  });
  const endTime = performance.now();
  compressionTime = endTime - startTime;
  return compressed;
}

async function decompressGltf(compressedGltf) {
  if (!wasmModule) await initWasm();
  const startTime = performance.now();
  const decompressed = wasmModule.decompress_gltf(compressedGltf);
  const endTime = performance.now();
  decompressionTime = endTime - startTime;
  return decompressed;
}

// Calculate file sizes
async function calculateSizes(buffer) {
  const rawSize = buffer.byteLength;
  let gzipSize = rawSize; // Fallback

  if ("CompressionStream" in window) {
    try {
      const compressed = await compressGzip(buffer);
      gzipSize = compressed.byteLength;
    } catch (error) {
      console.warn("Gzip compression failed, using fallback:", error);
    }
  }

  return {
    raw: (rawSize / 1024).toFixed(1),
    gzip: (gzipSize / 1024).toFixed(1),
  };
}

// Compress using CompressionStream API
async function compressGzip(buffer) {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();

  // Write the buffer to the compression stream
  writer.write(new Uint8Array(buffer));
  writer.close();

  // Read the compressed result
  const chunks = [];
  let totalSize = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalSize += value.length;
  }

  // Combine all chunks into a single buffer
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result.buffer;
}

// Center camera on model
function centerCamera(camera, controls, object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  const cameraDistance = Math.abs(maxDim / Math.sin(fov));

  // Position camera to frame the object
  camera.position.copy(center);
  camera.position.z += cameraDistance * 1.3;
  camera.lookAt(center);
  camera.updateProjectionMatrix();

  // Set controls target and update
  controls.target.copy(center);
  controls.update();
}

// Create a simple environment map
function createSimpleEnvironmentMap() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Helper function to adjust color brightness
  const adjustBrightness = (hexColor, brightness) => {
    // Convert hex to RGB
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);

    // Apply brightness multiplier
    const newR = Math.round(Math.min(255, r * brightness));
    const newG = Math.round(Math.min(255, g * brightness));
    const newB = Math.round(Math.min(255, b * brightness));

    // Convert back to hex
    return `#${newR.toString(16).padStart(2, "0")}${newG
      .toString(16)
      .padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
  };

  // Create a gradient background with brightness adjustment
  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, adjustBrightness("#4a5568", environmentBrightness)); // Dark gray at top
  gradient.addColorStop(
    0.5,
    adjustBrightness("#2d3748", environmentBrightness)
  ); // Medium gray in middle
  gradient.addColorStop(1, adjustBrightness("#1a202c", environmentBrightness)); // Darker gray at bottom

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Create cube texture from canvas
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;

  return texture;
}

// Initialize Three.js scenes
function initScenes() {
  // Get canvases from HTML
  leftCanvas = document.getElementById("left-canvas");
  rightCanvas = document.getElementById("right-canvas");

  // Create scenes
  leftScene = new THREE.Scene();
  rightScene = new THREE.Scene();

  // Create a simple environment map
  const envMap = createSimpleEnvironmentMap();
  leftScene.background = envMap;
  rightScene.background = envMap;

  // Apply environment map for reflections
  leftScene.environment = envMap;
  rightScene.environment = envMap;

  // Create cameras
  const aspect = 1.0;
  leftCamera = new THREE.PerspectiveCamera(50, aspect, 0.001, 100);
  rightCamera = new THREE.PerspectiveCamera(50, aspect, 0.001, 100);

  // Create renderers
  leftRenderer = new THREE.WebGLRenderer({
    canvas: leftCanvas,
    antialias: true,
    alpha: true,
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.NoToneMapping,
  });
  rightRenderer = new THREE.WebGLRenderer({
    canvas: rightCanvas,
    antialias: true,
    alpha: true,
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.NoToneMapping,
  });

  onWindowResize();

  // Create controls
  leftControls = new OrbitControls(leftCamera, leftCanvas);
  rightControls = new OrbitControls(rightCamera, rightCanvas);

  // Synchronize controls (prevent infinite recursion)
  leftControls.addEventListener("change", () => {
    if (!isSyncing) {
      isSyncing = true;
      rightCamera.position.copy(leftCamera.position);
      rightCamera.quaternion.copy(leftCamera.quaternion);
      rightControls.target.copy(leftControls.target);
      rightControls.update();
      isSyncing = false;
    }
  });

  rightControls.addEventListener("change", () => {
    if (!isSyncing) {
      isSyncing = true;
      leftCamera.position.copy(rightCamera.position);
      leftCamera.quaternion.copy(rightCamera.quaternion);
      leftControls.target.copy(rightControls.target);
      leftControls.update();
      isSyncing = false;
    }
  });

  // Add lights
  const ambientLight = new THREE.AmbientLight(0xffff00, 0.3);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);

  directionalLight.position.set(1, 3, 1);
  directionalLight2.position.set(-1, 3, 0);

  leftScene.add(ambientLight.clone());
  leftScene.add(directionalLight.clone());
  leftScene.add(directionalLight2.clone());
  leftScene.add(hemisphereLight.clone());

  rightScene.add(ambientLight.clone());
  rightScene.add(directionalLight.clone());
  rightScene.add(directionalLight2.clone());
  rightScene.add(hemisphereLight.clone());
}

// Load GLTF model
async function loadGltfModel(gltfBuffer, scene, camera, controls) {
  try {
    const loader = new GLTFLoader();

    // Always provide DRACOLoader to handle both raw and compressed files
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(
      "https://cdn.jsdelivr.net/npm/three@0.182.0/examples/jsm/libs/draco/gltf/"
    );
    loader.setDRACOLoader(dracoLoader);

    // Use parseAsync to load directly from ArrayBuffer
    const gltf = await loader.parseAsync(gltfBuffer, "");

    gltf.scene.traverse((child) => {
      if (child.isMesh) {
        if (
          child.material.isMeshStandardMaterial ||
          child.material.isMeshPhysicalMaterial
        ) {
          child.material.roughness = 0.6;
          child.material.metalness = 0.2;
          child.material.needsUpdate = true; // Important: Mark material for update
        } else {
          console.warn(
            "Material is not a PBR material, cannot set roughness/metalness:",
            child.material
          );
          // Optional: Replace with MeshStandardMaterial if needed
          // const newMaterial = new THREE.MeshStandardMaterial({ map: child.material.map });
          // child.material = newMaterial;
          // child.material.roughness = 0.5;
          // child.material.metalness = 0.8;
          // child.material.needsUpdate = true;
        }
        if (!child.geometry.attributes.normal) {
          child.geometry.computeVertexNormals();
        }
      }
    });

    // Clear previous model by name
    const existingModel = scene.getObjectByName(MODEL_NAME);
    if (existingModel) {
      scene.remove(existingModel);
    }

    // Assign name to the new model and add it
    gltf.scene.name = MODEL_NAME;
    scene.add(gltf.scene);

    // Center camera on the loaded model
    centerCamera(camera, controls, gltf.scene);

    return gltf.scene;
  } catch (error) {
    console.error("Error loading GLTF model:", error);
    throw error;
  }
}

// Update models
async function updateModels(rawGltf, compressedGltf) {
  try {
    leftModel = await loadGltfModel(
      rawGltf,
      leftScene,
      leftCamera,
      leftControls
    );
    rightModel = await loadGltfModel(
      compressedGltf,
      rightScene,
      rightCamera,
      rightControls
    );

    // Update UI with sizes and times
    updateUI();
  } catch (error) {
    console.error("Error loading models:", error);
  }
}

// Initialize UI elements
function initUI() {
  dropZone = document.getElementById("drop-zone");
  settingsBtn = document.getElementById("settings-btn");
  settingsDialog = document.getElementById("settings-dialog");
  compressionLevelInput = document.getElementById("compression-level");
  positionQuantizationInput = document.getElementById("position-quantization");
  compressionLevelValue = document.getElementById("compression-level-value");
  positionQuantizationValue = document.getElementById(
    "position-quantization-value"
  );
  compressionTimeEl = document.getElementById("compression-time");
  decompressionTimeEl = document.getElementById("decompression-time");
  leftSizeEl = document.getElementById("left-size");
  leftGzipEl = document.getElementById("left-gzip");
  rightSizeEl = document.getElementById("right-size");
  rightGzipEl = document.getElementById("right-gzip");
  leftDownloadBtn = document.getElementById("left-download");
  rightDownloadBtn = document.getElementById("right-download");

  // Settings dialog events
  settingsBtn.addEventListener("click", () => {
    settingsDialog.classList.remove("hidden");
  });

  document.getElementById("settings-cancel").addEventListener("click", () => {
    settingsDialog.classList.add("hidden");
    // Reset values
    compressionLevelInput.value = compressionLevel;
    positionQuantizationInput.value = positionQuantization;
    updateSliderValues();
  });

  document.getElementById("settings-save").addEventListener("click", () => {
    compressionLevel = parseInt(compressionLevelInput.value);
    positionQuantization = parseInt(positionQuantizationInput.value);
    settingsDialog.classList.add("hidden");
  });

  // Slider value updates
  compressionLevelInput.addEventListener("input", updateSliderValues);
  positionQuantizationInput.addEventListener("input", updateSliderValues);

  // Download buttons
  leftDownloadBtn.addEventListener("click", () =>
    downloadFile(originalRawGltf, "raw.glb")
  );
  rightDownloadBtn.addEventListener("click", () =>
    downloadFile(originalCompressedGltf, "compressed.glb")
  );

  updateSliderValues();
}

function updateSliderValues() {
  compressionLevelValue.textContent = compressionLevelInput.value;
  positionQuantizationValue.textContent = positionQuantizationInput.value;
}

// Download file
function downloadFile(buffer, filename) {
  if (!buffer) return;
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Update UI elements
async function updateUI() {
  if (compressionTimeEl)
    compressionTimeEl.textContent = compressionTime.toFixed(0);
  if (decompressionTimeEl)
    decompressionTimeEl.textContent = decompressionTime.toFixed(0);

  if (originalRawGltf && leftSizeEl && leftGzipEl) {
    const sizes = await calculateSizes(originalRawGltf);
    leftSizeEl.textContent = sizes.raw;
    leftGzipEl.textContent = sizes.gzip;
  }

  if (originalCompressedGltf && rightSizeEl && rightGzipEl) {
    const sizes = await calculateSizes(originalCompressedGltf);
    rightSizeEl.textContent = sizes.raw;
    rightGzipEl.textContent = sizes.gzip;
  }
}

// Handle file drop
async function handleFileDrop(file) {
  try {
    const buffer = await file.arrayBuffer();
    const isCompressed = isDracoCompressed(buffer);

    if (isCompressed) {
      // Store original compressed file
      originalCompressedGltf = buffer;

      // Measure decompression time
      const decompressStart = performance.now();
      originalRawGltf = await decompressGltf(buffer);
      decompressionTime = performance.now() - decompressStart;

      // Also measure compression time for the decompressed file
      const compressStart = performance.now();
      const recompressedGltf = await compressGltf(originalRawGltf);
      compressionTime = performance.now() - compressStart;

      // Create processed versions for display
      currentCompressedGltf = originalCompressedGltf;
      currentRawGltf = originalRawGltf;
    } else {
      // Store original raw file
      originalRawGltf = buffer;

      // Measure compression time
      const compressStart = performance.now();
      originalCompressedGltf = await compressGltf(buffer);
      compressionTime = performance.now() - compressStart;

      // Also measure decompression time for the compressed file
      const decompressStart = performance.now();
      const reDecompressedGltf = await decompressGltf(originalCompressedGltf);
      decompressionTime = performance.now() - decompressStart;

      // Create processed versions for display
      currentRawGltf = originalRawGltf;
      currentCompressedGltf = originalCompressedGltf;
    }

    await updateModels(currentRawGltf, currentCompressedGltf);
  } catch (error) {
    console.error("Error processing dropped file:", error);
  }
}

// Initialize drag and drop
function initDragDrop() {
  let dragCounter = 0;

  document.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) {
      dropZone.classList.add("opacity-100");
      dropZone.classList.remove("pointer-events-none");
    }
  });

  document.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      dropZone.classList.remove("opacity-100");
      dropZone.classList.add("pointer-events-none");
    }
  });

  document.addEventListener("dragover", (e) => {
    e.preventDefault();
  });

  document.addEventListener("drop", (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropZone.classList.remove("opacity-100");
    dropZone.classList.add("pointer-events-none");

    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].name.endsWith(".glb")) {
      handleFileDrop(files[0]);
    }
  });
}

// Load initial model
async function loadInitialModel() {
  try {
    const response = await fetch("./vase.glb");
    const buffer = await response.arrayBuffer();
    await handleFileDrop(new File([buffer], "vase.glb"));
  } catch (error) {
    console.error("Error loading initial model:", error);
  }
}

// Handle window resize
function onWindowResize() {
  const leftWidth = leftCanvas.clientWidth;
  const leftHeight = leftCanvas.clientHeight;
  const rightWidth = rightCanvas.clientWidth;
  const rightHeight = rightCanvas.clientHeight;

  // Update renderer sizes
  leftRenderer.setSize(leftWidth, leftHeight, false);
  rightRenderer.setSize(rightWidth, rightHeight, false);

  if (leftCanvas.width !== leftWidth || leftCanvas.height !== leftHeight) {
    leftCanvas.width = leftWidth;
    leftCanvas.height = leftHeight;
  }

  if (rightCanvas.width !== rightWidth || rightCanvas.height !== rightHeight) {
    rightCanvas.width = rightWidth;
    rightCanvas.height = rightHeight;
  }

  // Update camera aspect ratios
  leftCamera.aspect = leftWidth / leftHeight;
  rightCamera.aspect = rightWidth / rightHeight;
  leftCamera.updateProjectionMatrix();
  rightCamera.updateProjectionMatrix();
}

// Main initialization
async function init() {
  await initWasm();
  initScenes();
  initUI();
  initDragDrop();
  await loadInitialModel();

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
    leftControls.update();
    rightControls.update();
    leftRenderer.render(leftScene, leftCamera);
    rightRenderer.render(rightScene, rightCamera);
  }
  animate();

  // Add window resize listener
  window.addEventListener("resize", onWindowResize);
}

// Start the application
init();
