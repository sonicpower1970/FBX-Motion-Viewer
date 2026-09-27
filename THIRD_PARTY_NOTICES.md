# Third-party notices — FBX Motion Viewer v0.3.0

Project-owned code is MIT licensed, Copyright (c) 2026 Koji Matsunaga.
Third-party code, generated runtime components and upstream fixtures retain their
own licenses. The project MIT license does not relicense these components.

## Browser runtime and copied components

| Component | Version | License | Source |
|---|---|---|---|
| Three.js, FBXLoader, OrbitControls, SkeletonHelper | 0.186.0 | MIT | https://github.com/mrdoob/three.js/tree/r186 |
| React | 19.3.0 | MIT | https://github.com/facebook/react/tree/v19.3.0 |
| React DOM | 19.3.0 | MIT | https://github.com/facebook/react/tree/v19.3.0 |
| scheduler | 0.28.0 | MIT | https://github.com/facebook/react/tree/v19.3.0/packages/scheduler |
| Mediabunny | 1.59.1 | MPL-2.0 | https://github.com/Vanilagy/mediabunny/tree/v1.59.1 |
| ufbx and public regression fixtures | 0.23.0 | MIT option of MIT / Unlicense | https://github.com/ufbx/ufbx/tree/v0.23.0 |
| fflate in Three.js FBXLoader | Copy bundled with Three.js r186 | MIT | https://github.com/mrdoob/three.js/blob/r186/examples/jsm/libs/fflate.module.js |
| Emscripten generated JS / WASM support | 4.0.23 toolchain | MIT / University of Illinois-NCSA | https://github.com/emscripten-core/emscripten/tree/4.0.23 |
| musl code linked by Emscripten | Toolchain-bundled revision | MIT and notices in musl-COPYRIGHT | https://github.com/emscripten-core/emscripten/tree/4.0.23/system/lib/libc/musl |
| compiler-rt code linked by Emscripten | Toolchain-bundled revision | Apache-2.0 WITH LLVM-exception; see full text | https://github.com/emscripten-core/emscripten/tree/4.0.23/system/lib/compiler-rt |

The ufbx source and license are in `vendor/ufbx/`. The project adapter is
`native/ufbx_bridge.c`. Generated JS and WASM are in `src/viewer/legacy/generated/`.
Emscripten support licenses are in `vendor/emscripten/`. Public fixture provenance
and license are in `tests/fixtures/legacy/`. No Autodesk FBX SDK is included.

## Mediabunny / MPL-2.0

Mediabunny remains licensed under MPL-2.0, separately from the project's MIT code.
The dependency is used unmodified. Every production Web build contains:

- `legal/index.html`: human-readable notices, versions and source links;
- `legal/mediabunny-LICENSE.txt`: the complete MPL-2.0 text;
- `legal/mediabunny-1.59.1-source.zip`: the exact installed dependency's TypeScript
  source, package metadata, README and license used for this build.

The source ZIP preserves individual source files, including their notices. It is
available from the running application's **Licenses** link without a third-party
network request. The version is checked against package.json and package-lock.json
at build time. If this dependency is modified in the future, distribute the
corresponding modified source under MPL-2.0 and preserve notices.

Offline release ZIPs additionally retain `licenses/mediabunny-LICENSE.txt` and
`third-party-sources/mediabunny/`, including its source directory. See the
[upstream license](https://github.com/Vanilagy/mediabunny/blob/v1.59.1/LICENSE) and
[Mozilla's MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).

Other browser-runtime license texts are also copied to `legal/` in Web builds and
to `licenses/` in offline ZIPs. Keep this material with redistributed builds.

## Development and build dependencies

These tools are used to develop/build/test the project, not shipped as complete
packages in the application. Versions below match package-lock.json.

| Component | Version | License | Source |
|---|---|---|---|
| Vite | 8.3.1 | MIT | https://github.com/vitejs/vite |
| TypeScript | 6.0.3 | Apache-2.0 | https://github.com/microsoft/TypeScript |
| @vitejs/plugin-react | 6.1.1 | MIT | https://github.com/vitejs/vite-plugin-react |
| Vitest | 5.0.1 | MIT | https://github.com/vitest-dev/vitest |
| Playwright test | 1.63.0 | Apache-2.0 | https://github.com/microsoft/playwright |
| ESLint / @eslint/js | 10.11.0 / 10.0.1 | MIT | https://github.com/eslint/eslint |
| typescript-eslint | 8.70.1 | MIT | https://github.com/typescript-eslint/typescript-eslint |
| fflate (build-time source ZIP generation) | 0.8.3 | MIT | https://github.com/101arrowz/fflate |
| React Hooks / Refresh ESLint plugins | 7.1.1 / 0.5.7 | MIT | https://github.com/facebook/react / https://github.com/ArnaudBarre/eslint-plugin-react-refresh |
| @types/node, @types/react, @types/react-dom, @types/three | 26.6.2 / 19.3.0 / 19.3.0 / 0.186.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| globals | 17.12.0 | MIT | https://github.com/sindresorhus/globals |

The lockfile also identifies transitive tool dependencies, including Lightning CSS
(MPL-2.0), caniuse-lite data (CC-BY-4.0), minimatch (BlueOak-1.0.0), and MIT, ISC,
BSD and Apache-2.0 packages. Their original notices remain in the installed
packages. If distributing the tools themselves, preserve their licenses and
applicable source/attribution requirements too. `node_modules/` is not part of
this source repository or the release archives.

## Node.js in offline releases

Offline packages include an official Node.js 24.21.0 runtime. Its complete
`runtime/LICENSE` includes the Node.js MIT license and bundled third-party notices.
Source: https://github.com/nodejs/node/tree/v24.21.0 . Node.js is a local static
server runtime, not a browser dependency. Keep its complete LICENSE with it.

## Original visuals and trademarks

The Frame Guide SVG is an original four-corner outline, not an Autodesk icon.
The grid shader and application controls are project implementations. FBX is a
file format associated with Autodesk. This project is not an Autodesk product and
is not affiliated with, endorsed by, or sponsored by Autodesk. Autodesk logos are
not used as the project logo.
