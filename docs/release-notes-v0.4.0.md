# FBX Motion Viewer v0.4.0

A browser-based FBX animation viewer for VFX and motion-capture review. FBX files are processed locally in your browser.

## What's New

- **Dark / Light viewport background**: DARK `#1c232b` and neutral-gray LIGHT `#b8b8b8`, with contrast-aware grid, bones, frame guide and burn-in. The application UI stays dark; mesh materials, textures, lighting and camera settings are unchanged.
- **Still PNG capture** of the current camera composition and frame, without fitting, seeking or reinitializing Follow.
- **16:9 frame-guide-aware capture** at 1920×1080. Guide lines and outside shading are excluded. With the guide OFF, capture uses the full viewport at its CSS pixel size.
- **Burn-in support for PNG capture**, sharing the Viewer/MP4 layout, filename fitting, frame numbers and safe margins.
- **Capture support for FBX files without animation**. Animated names include the current frame (`walk_f0025.png`); static names omit the frame (`prop.png`). Static burn-in displays filename only.
- **Background mode reflected in single MP4 and Batch export**.

Save File Picker is used when supported, with browser-download fallback for PNG. Cancelling the save dialog is normal.

## Existing Features

FBX skeleton/skinned-mesh viewing, multiple takes, timeline/scrub/frame stepping, playback speed and looping, FIT / FOLLOW, legacy FBX support, X-Ray Bones, infinite grid, ground shadows, frame guide, local offline MP4 export and sequential Batch FBX → MP4 with FPS auto detection remain available.

## Downloads and Compatibility

**Tested:** macOS Apple Silicon + Chrome, including maintainer hardware acceptance and automated regression.

Packages provided but not hardware-tested in this development environment:

- macOS Intel
- Windows x64
- Windows ARM64
- Linux x64
- Linux ARM64

Download the ZIP for your OS/CPU and its corresponding `.zip.sha256` file. Six ZIPs and six SHA-256 files are attached. Extract the entire folder and keep it together. Node is bundled; no npm installation or Internet connection is required to run the offline package. The launcher serves locally on `127.0.0.1`. On macOS, the `.app` must remain beside its `.command` and bundled folders. Packages are unsigned and not notarized.

Chrome / Chromium is the primary browser target. Viewing requires WebGL 2; MP4 requires an available WebCodecs/H.264 encoder. Batch additionally requires directory-picker access. Browser/OS/GPU availability varies. Legacy FBX compatibility is partial, and large production skinned FBX files still require validation. Input is limited to 500 MiB and buffered MP4 output to 512 MiB; these limits are not performance guarantees.

## Privacy and Licenses

FBX files are processed locally and are not uploaded to a conversion service. No new dependencies were added in v0.4.0.

Project code is MIT, Copyright (c) 2026 Koji Matsunaga. Third-party components retain their licenses; Mediabunny is MPL-2.0. Complete license texts and matching Mediabunny source are provided in Pages and offline packages.

The v0.3.0 tag, release and downloads remain available unchanged.
