# FBX Motion Viewer specifications

## Scope

Version 0.2 is an English, dark desktop web application for local VFX/mocap review.
Target platforms: Chrome on macOS, Windows, Linux. Primary sources: Maya / MotionBuilder.
Runtime: React UI + TypeScript + Vite + Three.js WebGLRenderer (WebGL 2).
No upload backend or persistent user settings. v0.2 adds review controls and local WebCodecs/mediabunny preview export; see [v0.2](v0.2.md).

## Offline distribution

- Build the same `dist/` used for future static online hosting.
- Package separate official Node 24 runtimes for macOS arm64/x64, Windows x64/arm64, and glibc Linux x64/arm64.
- Verify runtime archives against the official version-specific SHA-256 list before packaging. Ship runtime and frontend third-party licenses.
- Deliver ZIP + SHA-256 file. Recipients extract the full ZIP and run the OS launcher; no Node installation, npm, build tools or internet required at runtime.
- The launcher starts a static-only server bound to `127.0.0.1` on a free port and opens the default browser. Chrome can open the printed URL instead.
- Serve only built application files. No uploads, remote fetch, directory listings, path traversal, symlink escape or LAN binding. Reject unexpected Host/Origin and non-GET/HEAD requests.
- Production CSP allows only same-origin fetches (bundled WASM), same-origin workers and WASM compilation. External connections are blocked. Embedded texture images remain allowed.
- Keep the terminal running while using the viewer; Ctrl+C stops it. No auto-update. Replace the full release folder for upgrades.
- Packages are not signed/notarized; OS first-run protections may require user action. Do not disable or automatically bypass OS protections.
- Packaging runs on macOS/Linux with tar/unzip/zip. Only the Apple Silicon Mac package has been execution-tested locally; other targets require real-machine acceptance.
- This is deployment packaging for v0.1, not a v0.2 feature or a desktop Electron app.

## Input and privacy

- One `.fbx` at a time through file picker or drop. Maximum 500 MiB; reject larger/empty/non-FBX inputs before allocating an ArrayBuffer.
- Support skeleton-only and skinned mesh with skeleton. Retain the previous asset on failed replacement. Pause the old asset during loading.
- Multiple Animation Clips / Takes appear in a selector. Select the first take initially; stop and seek to zero when selecting another.
- Use FBXLoader take-range trimming or ufbx trim_start_time to normalize nonzero take starts to local zero.
- v0.1.1: binary FBX below 6400 / ASCII below 7000 use the bundled ufbx WASM worker. See [legacy reader](legacy-fbx.md).
- Embedded textures take precedence. External references are not fetched, including HTTP(S), relative paths and file URLs.
- Raster data URIs / local blob images are permitted; missing or undecodable texture materials become neutral gray and generate asset notices.
- Do not upload FBX, textures, filenames or motion data. No analytics or external fonts. Development requests stay on localhost.
- Reading, parsing and rendering occur in browser memory. No localStorage or IndexedDB file retention.

## Time contract

The authoritative time is seconds, represented by a JavaScript number. Do not accumulate rounded UI frame numbers into playback time.

| UI FPS | Internal rate |
|---|---|
| 23.976 | 24000 / 1001 |
| 24 | 24 |
| 25 | 25 |
| 29.97 | 30000 / 1001 |
| 30 | 30 (default) |
| 50 | 50 |
| 59.94 | 60000 / 1001 |
| 60 | 60 |

- Start Frame = 0 for v0.1. Frame conversion functions accept a future start-frame offset.
- Normal frame display: `startFrame + floor(timeSeconds × fps)` with numerical tolerance.
- Frame seek: `(frame - startFrame) / fps`, clamped to `[0, duration]`.
- End Frame: `startFrame + ceil(duration × fps)` with numerical tolerance.
- Display exact end as End Frame; an off-grid final sample evaluates exactly at clip duration.
- Frame step samples the adjacent integer frame. At either boundary it clamps; it does not wrap even with Loop ON.
- Scrub and frame step pause playback. Changing FPS preserves time and playing state.
- Loop playback wraps the clock; non-looping playback holds the exact endpoint and pauses.
- Play at the endpoint restarts at zero. No-animation and zero-duration assets disable transport.
- Pause and seek must work after reaching a non-looping end. The mixer remains at timeScale=1; the controller owns playback state.
- Hidden-tab elapsed time is ignored on return. Frame stepping is independent of monitor refresh and render FPS.
- Source FBX time mode and source frame numbering are not inferred. No SMPTE drop-frame timecode.

## Viewport and camera

- Alt + left drag = Orbit; Alt + middle drag = Pan; Alt + right drag = Dolly.
- Wheel / trackpad scroll zoom. Touch handling uses OrbitControls' standard gestures.
- F = Auto Fit. Maintain view direction, set target and distance from posed mesh vertices and bone positions. Update near/far planes.
- Auto Fit never moves or scales the FBX. It operates on the current pose, not the entire motion range.
- Mesh, Bones and Grid independently toggle. Mesh rendering layers preserve descendant bones and animation updates.
- SkeletonHelper defaults to depth-tested; v0.2 X-Ray disables depth testing independently of Bones visibility.
- Disable bind-pose frustum culling for skinned meshes to avoid disappearing animated geometry.
- Display filename, take, mesh/bone/take counts, Timeline FPS, Render FPS, Current Frame and End Frame.
- Space = Play/Pause, Left/Right = frame step, Home/End = timeline endpoints. Form controls retain their own keyboard behavior.

## Architecture and lifecycle

- React owns layout and controls. `ViewerEngine` owns renderer, scene, camera, render loop and asset lifecycle.
- `AssetInstance` owns the FBX root, SkeletonHelper and PlaybackController. This boundary can later host two independent A/B assets.
- `PlaybackController.seek(seconds)` evaluates absolute time independently of real-time playback, used by the offline frame-by-frame export loop.
- `FbxAssetLoader` owns validation, texture URL policy and fallback materials. Loading is serialized because FBXLoader has shared parser internals.
- Dispose geometry/materials/textures/skeletons, mixer bindings, helpers, controls, observers and animation loops when replacing or unmounting assets.
- React StrictMode must not duplicate canvas or event listeners. Late load results after unmount are discarded and disposed.
- Keep versioned dependencies and lockfile; use project-local Node 24 without replacing global Homebrew Node.

## Validation boundaries

Unit tests use original synthetic ASCII FBX including skin weights and multiple takes with a nonzero take start, and verify actual evaluated poses.
Chrome E2E verifies file input/drop, transport, FPS changes, take selection, fallback/network behavior, embedded PNG, navigation and replacement.
Tests do not establish binary-FBX compatibility for every exporter, 500MB performance, driver compatibility, or Windows/Linux hardware behavior.
Legacy FBX parsing/baking uses a cancellable disposable Worker. Modern FBXLoader parsing and parts of Three.js construction remain synchronous. Public legacy mesh/skin/take fixtures and Maya reference geometry are tested; a local production FBX 6000 skeleton is an opt-in test.
