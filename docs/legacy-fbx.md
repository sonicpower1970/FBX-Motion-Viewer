# Legacy FBX compatibility — v0.1.1

The reader is part of the Viewer. Users drop an FBX as before. No Blender, Autodesk SDK, conversion application, server upload, or internet connection is needed at runtime. No converted FBX/glTF file is written.

## Routing and architecture

- Three.js 0.186.0 FBXLoader remains the default reader.
- Binary versions below 6400 and ASCII versions below 7000 are routed to ufbx 0.23.0. Header inspection uses at most 64 KiB.
- `loadLegacyFbx` transfers the file ArrayBuffer to one disposable Worker. `ufbx_load_memory` decodes it in WebAssembly. The C library is compiled with `UFBX_NO_STDIO` and `FILESYSTEM=0`; external-file loading is disabled.
- The Worker returns typed arrays by transfer, then terminates, releasing the WASM heap. Cancellation or errors also terminate it. The old asset is retained until the new asset is ready.
- `buildLegacyScene` constructs Three.js nodes, bones, triangle geometry, materials, Skeletons and AnimationClips. FBX geometry transforms use helper nodes; scale inheritance uses ufbx compensation with helper fallback. Axis conversion targets right-handed Y-up without normalizing scene units. Auto Fit still changes only the camera.
- Every take starts at viewer time zero. Transform tracks are baked with `resample_rate=120` and `minimum_sample_rate=120`. The latter is necessary: setting only resample_rate preserves many existing 30fps keys, leaving larger interpolation discrepancies between source frames.
- Quaternion rotation tracks and linear translation/scale tracks feed the existing AnimationMixer. Timeline FPS stays independent. The bake is an approximation between samples, not exact FBX curve evaluation at every possible time.
- Embedded raster image bytes become temporary blob URLs. FBX filename/URL strings are never used as fetch URLs. Missing, unsupported or undecodable images get neutral materials and notices.

## Privacy and deployment

The only new fetch is the bundled WASM code. The offline server permits same-origin static GET/HEAD requests and serves `.wasm` as `application/wasm`. Its CSP allows same-origin workers and `wasm-unsafe-eval` for WASM compilation, but does not allow JavaScript `unsafe-eval` or external connections. There is no upload endpoint. Workers receive the same production CSP as other assets.

## Rebuild the WASM artifact

Normal `npm run build` uses the checked-in generated JS/WASM and needs no C toolchain. Do not edit generated artifacts manually.

For maintainers, install official Emscripten **4.0.23** in `.tools/emsdk` (or supply `EMCC`), activate it within that SDK directory, then:

```sh
sh scripts/build-ufbx.sh
sh scripts/with-node.sh npm run check
sh scripts/with-node.sh npm run test:e2e
```

Source: `native/ufbx_bridge.c` + unmodified `vendor/ufbx/ufbx.c` / `ufbx.h`. Output: `src/viewer/legacy/generated/ufbx.js` and `.wasm`. SDK activation does not require adding anything to shell startup files or replacing Homebrew Node. Emscripten itself uses its private tools.

Optional local production test (the file is not copied or uploaded):

```sh
FBX_LEGACY_SAMPLE='/absolute/path/to/legacy_motion.fbx' sh scripts/with-node.sh npm run test:e2e
```

This opt-in regression expects the verified 25-bone, one-take sample. Public Maya FBX 6100 fixtures provide repeatable skin/take coverage without production data. A numerical test compares all converted skinned vertices with Maya reference OBJ frame 10 (tolerance 0.0001 scene units, in both set directions).

## Limits and acceptance

- Tested FBX 6000 production sample is skeleton-only. A real FBX 6000 skinned production file still needs acceptance; public FBX 6100 mesh/skin animation is covered separately.
- No universal old-FBX compatibility guarantee or MotionBuilder reference-pose certification for the production sample.
- Skinning uses the strongest four normalized weights, matching the practical Three.js path. Dual quaternion skinning is approximated with linear skinning; multiple skin deformers use the first. These produce notices.
- Blend shapes are currently not transferred on the legacy path and produce a notice. Basic diffuse materials/first UV set are supported; layered/procedural materials are approximated, not faithfully reproduced. Material/camera/light/constraint animation is not transferred. FBX cameras are not imported.
- Upstream Unicode warnings are surfaced; successful geometry/animation import does not prove every string survived unchanged.
- 500 MiB is an input cap, not a memory/performance guarantee. WASM heap is capped at 2 GiB; parser result/temp budgets are 768/512 MiB; bake result/temp budgets are 512/512 MiB; transferred typed arrays cap at 768 MiB. Maximum 100,000 scene nodes and 10 million triangles per mesh. Input, WASM and Three.js/GPU memory may coexist.
- Legacy parsing/baking can be cancelled. Main-thread Three.js construction and the existing modern FBXLoader remain synchronous in parts.
- Packaging is provided for six OS/CPU combinations; only Apple Silicon Mac Chrome is tested here.
