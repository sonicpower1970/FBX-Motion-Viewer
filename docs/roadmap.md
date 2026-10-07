# Roadmap

## v0.1 — Local motion review (implemented)

- FBX drop / file picker, skeleton-only and skinned mesh.
- Take selection, AnimationMixer playback, Play/Pause and Loop.
- Frame step, exact-time scrubbing, eight Timeline FPS choices and frame readouts.
- Maya-style Orbit/Pan/Dolly, wheel zoom, current-pose Auto Fit.
- Independent Mesh/Bones/Grid toggles, filename, render FPS, warnings.
- Embedded textures, local fallback policy, no external FBX transmission.
- English dark UI, localhost development, project-scoped Node 24.
- Offline distribution ZIPs with a bundled local runtime and launchers for Mac / Windows / Linux; no recipient-side Node installation.

Before production acceptance: validate representative Maya/MotionBuilder binary FBX, actual 500MB assets, and Chrome on Windows/Linux. Record load time, peak memory, playback responsiveness, exporter settings and unsupported features.

## v0.1.1 — Legacy FBX compatibility (implemented)

- Integrated ufbx 0.23.0 WASM worker; automatic old-version routing, no external converter.
- Bone/mesh/skin conversion, multiple takes, 120Hz transform baking, local embedded textures and notices.
- Cancel pending legacy load, retain prior asset, terminate workers and release memory.
- Bundled WASM and third-party notices in offline packages.
- Verified production FBX 6000 skeleton and public Maya FBX 6100 skin/takes; Maya reference vertex comparison.
- Remaining acceptance: FBX 6000 production skin, exporter-specific transforms, 500MB performance and other OS hardware.

## v0.2 — Review controls and preview export (implemented)

- Playback Speed: 0.25× / 0.5× / 1× / 2×; frame-step timing unchanged.
- X-Ray Bone display, independent of Bones visibility.
- Ground shadows with asset-sized, moving directional shadow volume.
- Ground-plane Follow Camera, user navigation, Fit, scrub/step and loop-boundary rebase.
- Offline exact-time H.264 MP4 export using WebCodecs + mediabunny, full selected take including final pose, no UI/audio.
- 720p, 1080p and rendered viewport resolution; Timeline FPS; export Follow and full state restoration.
- Progress, cancellation, capability errors, bounded output and local download. No ffmpeg.wasm.

See [v0.2 behavior, limits and acceptance checklist](v0.2.md).

## v0.3.0 — Batch export

- Sequential multi-FBX → MP4 using the existing ViewerEngine, offline renderer and encoder.
- Per-file metadata FPS AUTO, explicit 30 fps fallback, first/default take.
- Fixed FIT + FOLLOW, 1080p/720p, shared Burn-in, one output folder.
- Progress, independent failure, retry failed, cancellation and per-job disposal.
- Original Viewer state isolation; no changes to Single Export composition or timeline policy.

See [v0.3.0 validation and usage](v0.3.0.md).

## v0.4.0 — Viewport background and still capture

- DARK / LIGHT changes only viewport background and helper contrast; application UI stays dark.
- PNG capture preserves the current frame, camera and Follow composition; static FBX supported.
- Shared guide projection and Burn-in path with MP4; guide ON captures 1920×1080.
- Single and Batch MP4 inherit the selected background; existing Batch workflow retained.
- v0.3.0 remains available as a previous release.

See [v0.4.0 implementation and validation](v0.4.0.md).

## After v0.4.0 — Review workflows

- Root Motion Trail without modifying original root motion.
- FBX scene information.
- Camera presets; selectable Follow target and Follow 3D.
- Optional smooth/cumulative root-motion loop review.
- Adjustable ground height, expanded shadow bounds and streaming movie output.
- UI preferences persistence.
- Two-FBX A/B comparison using independent AssetInstance objects and an explicit synchronized time policy.
- User-defined Start Frame such as 0 / 1 / 1001.
- Depending on workload results: off-main-thread parsing, cancellation, improved huge-file handling and full-motion-range Fit.

Future items below are not implemented in v0.2.

## Distribution follow-up

- Verify Intel Mac / Windows / Linux launchers and browser behavior on actual target machines.
- If wider distribution requires it, add signed/notarized installers or launchers.
- Online hosting may be added later using the existing frontend `dist/`. Retain browser-local FBX processing and the external-texture policy. No hosting or upload service is currently configured.

## v0.2.1 UX

- Follow activation fits the current pose once.
- Shader infinite ground grid with configurable internal spacing/fade.
- Single EXPORT MP4 action, native save picker when available and automatic browser download fallback.
- Progress and cancellation/failure/success status, full state restoration.

## v0.2.2

- Follow loop boundary: exact START Fit and reference reset.
- Follow export: independent START Fit and deterministic frame-based movement.
- Composition-only 16:9 HTML Frame Guide with resize support and extensible ratio catalog.

## v0.2.3

- Independent Filename / Frame Burn-in switches for viewport and MP4.
- Shared basename-only, responsive Canvas renderer with measured filename fit and Timeline frame formatting.
- Exact-time offline compositing before encoding; Frame Guide remains excluded.

## v0.2.4

- Single BURN-IN ON/OFF for filename and frame in both Viewer and MP4.
- Original four-corner SVG Frame Guide toggle with tooltip and pressed highlight.
- Ratio catalog and unchanged guide renderer retained for future aspect selection.

## v0.2.5

- Preserve FOLLOW OFF camera across loop and export; guide-aware one-shot FIT for FOLLOW ON initialization.
- Center-crop projection matches 16:9 guide to 720p/1080p output.
- Shared guide rectangle anchors Viewer Burn-in; output uses full movie frame.
- Exact projection restoration when the viewport is unchanged.

## v0.2.6

- Independent AUTO FIT mode, default ON; FIT/F remains one-shot.
- Gate automatic load/Follow activation/loop/export Fits by AUTO FIT.
- Reset Follow at START independently of fitting; retain manual composition when AUTO FIT is OFF.
- Four-mode regression coverage including success/cancellation/save failure restoration.

## v0.2.7

- Unified FIT toggle (default ON), immediate current-pose Fit on activation; removed AUTO FIT button.
- Explicit loop rebase translates camera/target together to preserve relative ground composition without Fit.
- Shared reference-only reset, ordinary Follow translation and loop rebase methods; non-finite input protection.
- 12+ loop regression including nonuniform and multi-loop playback deltas.

## v0.2.8

- Rebase manual Follow export composition from the inspected subject position to START.
- Crop the actual Viewer projection matrix to the centered output gate on an export-only camera.
- Fit START on the Viewer-aspect clone before projection cropping.
- Encoded MP4 frame comparisons cover fixed START/midpoint, manual Follow, START Fit and guide-relative Burn-in.
