# libcascade CAD playground

## Mission

Build a browser-only single-page application (SPA) that lets a user write JavaScript which creates OpenCASCADE geometry, runs that code locally, converts the result to an XCAF document, tessellates it to GLB, and displays the model with three.js. The same successful model must be exportable as GLB, STEP, or STL.

The application is a small CAD scripting playground, not a server-backed CAD service. Geometry generation, tessellation, rendering, and export must happen in the browser.

## Visual direction

Follow [DESIGN.md](./DESIGN.md) for the visual system. It captures the typography, light/dark color tokens, 4px spacing rhythm, radii, borders, controls, responsive behavior, and viewer/editor styling inspired by [libcascade.xyz](https://www.libcascade.xyz/). Update `DESIGN.md` when a visual decision intentionally changes the system.

## Product contract

### Layout

- Use a two-pane layout: code on the left and the 3D viewer on the right.
- The left pane contains a JavaScript `<textarea>` and a prominent `RUN` button above it. Place an example dropdown immediately before `RUN`; it loads predefined `.mjs` files from the same-origin `examples/` directory into the editor and does not auto-run them.
- At the bottom of the left pane, include a small, scrollable, monospace error window. Clear it when a new run starts, show the latest run's syntax/runtime/OCCT/conversion errors there, keep it visible after the run finishes, and auto-scroll to the newest message. Give it an accessible label such as `Errors` and use `role="log"` with an appropriate live region.
- The right pane contains the three.js viewer and an export menu in its header.
- Show a compact status area for loading, running, tessellating, rendering, exporting, and error states.
- Disable `RUN` until libcascade initialization has completed and while a run is in progress. Disable exports until a successful model exists.
- Preserve the editor contents across runs and do not replace a valid displayed model when a later run fails.
- The layout must resize cleanly. On narrow screens, stack the panes vertically while keeping both controls usable.
- Support `Ctrl+Enter` / `Cmd+Enter` as a convenience shortcut for `RUN`.

### User code contract

The editor contains JavaScript, not a module. The application injects the initialized libcascade instance as `oc`. The code must assign the final value to `result`:

```js
using box = new oc.BRepPrimAPI_MakeBox(60, 40, 20);
result = box.Shape();
```

The contract is:

- `result` is either one `TopoDS_Shape` or an array of `TopoDS_Shape` values.
- `TopoDS_Compound` is supported because it is a `TopoDS_Shape`. Compounds are expanded into XCAF assembly structure by passing `makeAssembly = true` when they are added to the document.
- A single shape is treated as a one-item array internally.
- Arrays must be non-empty and must contain only valid shapes; nested arrays, `null`, `undefined`, and arbitrary objects are errors.
- Code may be synchronous or use `await`.
- The app owns the model after the code returns. User code must not dispose the shape assigned to `result` before returning it.
- Provide a working sample in the initial editor contents, and document that OCCT objects are disposable and should be scoped carefully with `using` where supported.
- Do not require users to import libcascade or three.js in the editor. The runtime provides `oc`; the app owns conversion, rendering, and export.

When native `using` support is unavailable, compile the editor source with the browser compatibility transformer described below, then execute the resulting code as an async function with a predeclared `result` binding. When native support is available, execute the original editor source. Surface compile, syntax, runtime, and OCCT/WASM exceptions as readable messages. Do not silently treat a missing result as an empty model.

### Safari `using` compatibility

- Keep the readable synchronous `using name = expression;` syntax in the editor and built-in examples.
- Probe native support with `supportsNativeUsing()` before constructing the dynamic `AsyncFunction`; execute the original source when supported and compile only when native syntax or `Symbol.dispose` is unavailable.
- Lower each declaration to a lexically scoped `try/finally` cleanup block. Dispose resources in reverse declaration order and run cleanup when the body returns, throws, breaks, or continues.
- The compatibility compiler supports simple identifier declarations in top-level code, nested blocks, loops, and helper functions. It must ignore matching text inside comments, strings, templates, and regular expressions.
- The first version rejects `await using`, destructuring, multiple declarators, `for`-header declarations, and declarations without semicolons with a source-located compile error.
- Generated cleanup must call `Symbol.dispose` when available and fall back to the libcascade wrapper's `.delete()` method when the browser does not provide `Symbol.dispose`.
- Keep the compiler small and browser-native; do not add a bundler or an external parser solely for this compatibility layer.

User-authored code is trusted code for this local playground. It must not be described as a security sandbox: code running in the main thread can access the page, perform network requests, and consume CPU or memory. If untrusted multi-user code becomes a requirement, add a separate sandboxed execution design before shipping that feature.

Executing editor text through `AsyncFunction` or `Function` requires a Content Security Policy that permits dynamic evaluation. The deployed CSP must allow the pinned jsDelivr script origin, JavaScript evaluation through `'unsafe-eval'`, WebAssembly evaluation through `'wasm-unsafe-eval'` where the browser distinguishes it, and libcascade WASM fetches. Configure `connect-src` for any network destinations intentionally available to trusted user code. Document and test the final CSP rather than assuming a strict no-eval policy will work.

## libcascade loading

- Load libcascade directly in the browser from jsDelivr. This app does not use Vite or another bundler for libcascade resolution.
- Pin the jsDelivr package version in one configuration constant. Do not use an unversioned `latest` URL in production.
- The current documented package release is `3.0.2`; keep the version easy to update after checking the package API and generated artifacts.
- Load only the single-threaded WASM build.
- Keep loading deferred until the first meaningful user interaction rather than page load. Pointer/touch, mouse movement, scrolling, keyboard, focus, or input interaction may begin initialization; `RUN` must await and reuse the same in-flight promise instead of starting a second initialization.
- Dynamically import `https://cdn.jsdelivr.net/npm/libcascade@<version>/dist/init.single.js` and use its initializer. Let it resolve the adjacent single-threaded glue and WASM assets from the same pinned jsDelivr package.
- Memoize the initialized `oc` instance. A run must reuse the same WASM instance instead of creating a new C++ heap for every click.
- Start libcascade loading on the first meaningful user interaction, but show a clear loading state and handle initialization failures.

## Execution architecture

For simplicity, run libcascade initialization, user-code execution, XCAF conversion, tessellation, GLB generation, and file export on the main thread. Keep the libcascade instance, OCCT shapes, XCAF document, generated bytes, and three.js viewer in the same browser realm. Do not introduce an application-managed execution worker or message-passing protocol for this version.

This deliberate tradeoff keeps the implementation easy to understand and avoids transferring or recreating native OCCT objects. A boolean or fine tessellation may temporarily block the page, so update the status and disable `RUN` and exports before starting expensive work, yield at clearly separated asynchronous phases where possible, and restore the controls in `finally` blocks. Do not claim that the main-thread execution is a security sandbox or that it guarantees a responsive UI.

Prevent overlapping runs with a single in-flight operation. Treat each run as a transaction: stage its source shapes, XCAF document, GLB bytes, parsed three.js scene, and camera-fit bounds separately. Commit all of them together only after code execution, conversion, GLB writing, GLB parsing, and viewer preparation have succeeded. A failed run must dispose its staged resources and leave the last valid model, scene, and exports intact.

## Geometry pipeline

Implement the following flow for every successful `RUN`:

1. Initialize or reuse the selected libcascade instance.
2. Execute the editor code and obtain `result`.
3. Normalize and validate `result` as `TopoDS_Shape[]`. Every item must be a libcascade `TopoDS_Shape` wrapper and must satisfy `shape.IsNull() === false`. Preserve repeated array entries as repeated top-level parts, but track returned wrapper objects by JavaScript identity so each distinct wrapper is disposed exactly once.
4. Create an XCAF document and obtain its shape tool:

   ```js
   using docName = new oc.TCollection_ExtendedString('document', true);
   const doc = new oc.TDocStd_Document(docName);
   const shapeTool = oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main());
   ```

5. Add every shape to the XCAF document with `shapeTool.AddShape(shape, true, false)`, where the second argument is `makeAssembly = true`. This expands `TopoDS_Compound` values into XCAF assembly structure. Keep array items as separate top-level parts; do not fuse them merely for display. Give parts stable default names such as `Shape 1`, `Shape 2`, and so on if the UI does not yet support user-supplied names.
6. Tessellate every shape with `BRepMesh_IncrementalMesh`. Start with documented defaults of `linearDeflection = 0.1`, `isRelative = false`, and `angularDeflection = 0.5`. Keep these values in configuration so they can later become UI controls. Pass `inParallel = false`, then compute each face's nodal normals with `BRepLib_ToolTriangulatedShape.ComputeNormals` before writing GLB. With the libcascade V3 bindings, retrieve each face triangulation with `BRep_Tool.Triangulation(face, new oc.TopLoc_Location(), 0)` and use the envelope's `returnValue` when present.
7. Write the XCAF document to a unique temporary path in the libcascade virtual filesystem with `RWGltf_CafWriter`.
8. Check the writer result, read the GLB bytes with `oc.FS.readFile`, then unlink the temporary path. Do not leave generated files in the WASM filesystem.
9. Keep the new GLB bytes staged rather than replacing the current downloadable GLB immediately.
10. Parse the staged bytes with `GLTFLoader`, prepare the loaded scene for the Y-up viewer, verify that it contains renderable content, compute its bounds, and calculate the camera-fit state without removing the current model.
11. Atomically commit the staged source shapes, XCAF document, GLB bytes, parsed scene, and camera state. Only after the new state is visible and exportable should the app dispose the previous source model, XCAF document, object URLs, and three.js resources.

The GLB is a display artifact. STEP and STL exports must be generated from the retained source geometry/XCAF document, not by converting the GLB back into CAD data.

## Three.js viewer

- Create a WebGL renderer, scene, perspective camera, lights, and `OrbitControls`.
- Parse the returned GLB with `GLTFLoader.parse` and add the resulting scene to the viewer.
- Apply the viewer's default golden appearance to rendered mesh materials with `metalness = 0.2`, and render them double-sided so open surfaces such as the Gordon example are visible from both sides. This is a viewer-only presentation choice; do not mutate the staged GLB bytes or add a user-facing color contract yet.
- Fit the camera to the loaded model, provide a sensible default camera for the first model, and support orbit/zoom/pan controls.
- Use a Y-up viewer: set the camera and controls to `(0, 1, 0)` and convert the loaded OCCT/GLB scene to Y-up exactly once. When the writer output is Z-up, rotate the loaded scene root by `-Math.PI / 2` around X for display. This viewer-only transform must not mutate the stored GLB bytes used by `Export GLB`. Do not add a ground plane or grid.
- Add a small orientation-axis symbol in the bottom-right corner of the viewer. It must have a transparent background, remain a fixed screen-space size, label the X, Y, and Z axes, and rotate in sync with the main camera so it always communicates the current view orientation. Use conventional axis colors (X red, Y green, Z blue), with Y representing the viewer's up axis. Keep it visually separate from the model scene and make it non-interactive with `pointer-events: none` unless axis-click view snapping is intentionally added later.
- Resize the renderer and camera from a `ResizeObserver` on the viewer pane; do not rely only on `window.resize`.
- Before replacing a model, remove it and dispose geometries, materials, textures, and related resources. Revoke the previous GLB `ObjectURL` when one is used.
- Show an empty-state message before the first successful run and an actionable error overlay/status when GLB parsing fails.
- Keep rendering deterministic enough for repeated runs: clear the old scene model before adding the new one and do not accumulate lights, controls, or animation loops.

## Export menu

The right-pane export menu must provide:

- `Export GLB` — download the exact GLB bytes produced by the most recent successful run. Do not regenerate the model just to download it. Use `model/gltf-binary` and a predictable filename such as `libcascade-model.glb`.

- `Export STEP` — preserve exact BRep/XCAF geometry and assembly parts. Use `STEPCAFControl_Writer.Perform` for the retained XCAF document, select a documented STEP schema (AP214 is the default), check the writer result, read the virtual filesystem bytes, and unlink the temporary file. A single-shape `STEPControl_Writer` path is acceptable only when it is deliberately used and both transfer and write statuses are checked.
- `Export STL` — export the complete current model as one STL download. If the result contains one shape, pass that shape to the STL writer. If it contains multiple shapes, first create a temporary `TopoDS_Compound` with `TopoDS_Builder` or `BRep_Builder`, add every result shape to it without fusing them, and pass the compound to `StlAPI.Write`. Call `StlAPI.Write(stlShape, path, false)` so the output is binary, check its boolean result, then dispose the temporary compound after copying the file bytes.

For all three formats:

- Reject export when there is no successful model.
- Use unique virtual filesystem paths for generated GLB, STEP, and STL files and always clean them up after copying their bytes. Downloading the already stored GLB must reuse those bytes and must not create another virtual file.
- Reject zero-byte output and report the failed phase.
- Trigger a browser download from a `Blob` with an appropriate MIME type: `model/gltf-binary` for GLB, `application/step` for STEP, and `model/stl` or `application/octet-stream` for STL.
- Use predictable filenames: `libcascade-model.glb`, `libcascade-model.step`, and `libcascade-model.stl`.
- Keep export errors visible without destroying the currently displayed model.

## Resource and error handling

- Treat every libcascade wrapper as a native-memory resource. Follow the package's `Symbol.dispose` conventions and keep objects alive for as long as exports need them.
- User code owns and must dispose all intermediate OCCT wrappers that it does not return. Once execution returns successfully, the app owns each distinct wrapper present in `result`; repeated array references are disposed only once.
- During a run, register all app-created native wrappers as staged resources. Release temporary strings, labels or handles where owned, meshers, writers, progress objects, metadata maps, compounds, and failed XCAF documents in `finally` blocks. On successful commit, retain only the current source shapes and XCAF document needed for export, then dispose the previous committed model exactly once.
- Always unlink temporary `oc.FS` paths after copying their bytes.
- Do not retain stale GLB object URLs, scenes, or WASM documents after replacement. Replace the stored GLB bytes only after a successful run; the export menu must always refer to the displayed model.
- Catch and label errors by phase: `Initialize`, `Compile`, `Execute`, `Validate`, `XCAF`, `Tessellate`, `GLB`, `STEP`, `STL`, or `Viewer`.
- Show concise user-facing errors in the scrollable error window at the bottom of the left pane, and keep detailed diagnostics available in a collapsible area or the console.
- A failed run must not clear the last valid model or make exports point at partially generated data.

## Suggested implementation boundaries

Keep responsibilities separated so the app remains easy to test:

- `libcascade-runtime`: pinned single-threaded jsDelivr module loading, instance memoization, and CSP/runtime diagnostics.
- `using-compiler`: browser-native transformation of supported synchronous `using` declarations into scoped `try/finally` cleanup blocks.
- `code-runner`: compiled async editor-code evaluation and `result` normalization/validation.
- `cad-pipeline`: XCAF document construction, tessellation, GLB generation, and source-model ownership.
- `exporters`: GLB/STEP/STL byte generation and virtual filesystem cleanup.
- `viewer`: three.js scene lifecycle, camera fitting, resize handling, and disposal.
- `ui`: editor, run state, export menu, status messages, and downloads.

Implement this as a small browser-native ESM SPA served by a static web server. Do not introduce Vite or a large UI framework solely for the split-pane shell.

## Acceptance criteria

The implementation is complete when all of the following work in a real browser:

1. The app loads without requiring a server-side Node runtime.
2. The app loads the single-threaded WASM build and can run the sample.
3. A sample producing one shape displays an orbitable model.
4. A sample producing multiple shapes displays all shapes.
5. A sample producing a `TopoDS_Compound` expands it as an XCAF assembly, displays all children, preserves the assembly in STEP, and includes all children in STL.
6. Sync code, async code, supported `using` code, compiler diagnostics for unsupported `using` forms, syntax errors, runtime errors, empty results, null `TopoDS_Shape` wrappers, and invalid result types produce understandable status messages.
7. A successful run produces a non-empty GLB and atomically updates the source model, downloadable bytes, and viewer without leaking the previous model.
8. A staged GLB parse/viewer failure preserves the previous displayed model and all previous exports.
9. GLB export downloads the same non-empty GLB represented by the displayed model.
10. STEP export opens as a non-empty STEP file in a compatible CAD viewer.
11. STL export contains all result shapes and opens as a non-empty binary STL file in a compatible mesh viewer.
12. An asymmetric test model confirms that the three.js viewer and camera controls are consistently Y-up without a ground plane or grid.
13. The transparent bottom-right axis symbol remains legible, labels X/Y/Z correctly, shows Y as up in the default view, and stays synchronized while the camera orbits.
14. Repeated successful runs, failed runs, and exports do not grow the virtual filesystem or accumulate OCCT/WebGL resources.
15. The UI clearly reports that application geometry work runs on the main thread, prevents overlapping runs, and preserves the last valid model after errors.
16. The deployed CSP permits the pinned jsDelivr modules, dynamic trusted-code execution, and WebAssembly without unrelated policy exceptions.

## References

- [libcascade on jsDelivr](https://www.jsdelivr.com/package/npm/libcascade)
- [libcascade npm quickstart](https://libcascade.vercel.app/docs/package/getting-started/quick-start-npm)
- [GLB export guidance](https://libcascade.vercel.app/docs/package/guides/export-gltf)
- [STEP export guidance](https://libcascade.vercel.app/docs/package/guides/export-step)
