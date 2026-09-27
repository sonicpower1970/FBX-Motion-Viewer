# FBX Motion Viewer v0.3.0 — release notes draft

Initial public release of a browser-based FBX motion-review tool, including sequential Batch FBX → MP4. Files are processed locally; no asset-upload service is used.

Highlights: modern and legacy FBX loading, skeleton/skinned meshes, multiple takes, frame-based review, FIT/FOLLOW, infinite grid, shadows, X-Ray Bones, 16:9 guide, burn-in and offline MP4 rendering. Batch uses the default take, FIT + FOLLOW, automatic metadata FPS (30 fps fallback), 720p/1080p, folder selection, cancel and retry-failed controls.

## Download targets

All names use `FBX-Motion-Viewer-v0.3.0-<target>.zip`, with a matching `.zip.sha256` checksum file.

| Target | Validation |
|---|---|
| macos-apple-silicon | Hardware-verified with Chrome |
| macos-intel | Package built; hardware validation pending |
| windows-x64 | Package built; hardware validation pending |
| windows-arm64 | Package built; hardware validation pending |
| linux-x64 | Package built; hardware validation pending |
| linux-arm64 | Package built; hardware validation pending |

Extract the full folder and run its launcher. Packages bundle Node and run a loopback-only static server. They are unsigned and not notarized. The macOS app launcher must stay beside its `.command` and other bundled files.

Export requires available browser WebCodecs/H.264 support. Batch additionally requires directory-picker access. Input is limited to 500 MiB and buffered MP4 output to 512 MiB; these limits are not performance guarantees. Legacy FBX compatibility is partial. See README for full limitations and privacy details.

Project code is MIT; Mediabunny is MPL-2.0. License texts and matching Mediabunny source are included. These are draft notes: no repository, Pages site or GitHub Release has been published by the preparation process.
