# libcascade playground

This is a browser-native ESM SPA. It does not use Vite or a frontend bundler. The page loads the single-threaded libcascade 3.0.2 build and three.js 0.185.1 from pinned jsDelivr URLs.

## Run locally

Use Python's static development server:

```text
python -m http.server 5173
```

Open <http://localhost:5173>.

The app itself runs in the browser. Python is only used as a local static file server; production can use any static host that serves the documented CSP headers.

Editor code receives the initialized libcascade instance as `oc` and must assign a `TopoDS_Shape` or `TopoDS_Shape[]` to `result`. The code is trusted local code and is evaluated on the main thread.

## Examples

The example dropdown loads these editor snippets from the same-origin `examples/` directory:

- `box.mjs`
- `sphere.mjs`
- `cylinder.mjs`
- `boolean-cut.mjs`
- `filleted-box.mjs`
- `loft.mjs`
- `gear.mjs`
- `multiple-shapes.mjs`
- `compound.mjs`
- `gordon-surface.mjs`
- `thread.mjs` — a helical thread using the OCCT 8 `TKHelix` toolkit

Selecting an example replaces the editor contents but does not run the code automatically.

## Safari compatibility

The editor may use synchronous `using name = expression;` declarations for libcascade resources. Before each run, the app probes native `using` and `Symbol.dispose` support. Native-capable browsers execute the original source; other browsers compile the declarations into scoped `try/finally` cleanup blocks.

The compatibility compiler supports simple identifier declarations in nested blocks and functions. It reports clear errors for `await using`, destructuring, multiple declarators, `for`-header declarations, and missing semicolons. Cleanup uses `Symbol.dispose` when available and falls back to libcascade's `.delete()` wrapper method.
