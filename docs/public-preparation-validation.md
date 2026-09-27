# v0.3.0 public preparation validation

This preparation changes documentation, licensing, build/distribution metadata and the license-link UI. Viewer animation, camera, legacy conversion and Batch algorithms are unchanged. The secure-context messages now mention HTTPS as well as localhost.

## Changes

- Rewrote README in English with truthful hardware/API limitations and no unpublished demo URL.
- Added project MIT LICENSE (2026 Koji Matsunaga), THIRD_PARTY_NOTICES.md, public-release checklist and draft release notes.
- Removed a developer-specific absolute path and a production asset name from public documentation. Historical checkpoint references now explain that private history is not part of the public repository.
- Documented public ufbx fixture origin/version/license and upstream path metadata.
- Strengthened .gitignore for caches, builds, backups, clean-release staging, editor settings, environments, logs, videos and private assets; explicitly retained three public fixtures.
- Added scripts/build-web.mjs and build:pages. Normal and Pages outputs are separate; Pages defaults to relative paths.
- Added a Licenses link to the application. Builds include full runtime license texts, notices and matching Mediabunny source ZIP, with a version guard and checksum. Added fflate as an explicit build dependency, using the already locked version.
- Kept offline launchers and existing third-party source directories; added project license/notices to each package. Static serving supports the new legal documents and source ZIP.
- Added a nested-path Chrome test for Pages assets, legacy worker/WASM, single MP4, Batch MP4 and matching source downloads.

## Files changed in this preparation

Modified: `.gitignore`, `README.md`, `docs/legacy-fbx.md`, `docs/v0.2.1-validation.md`, `docs/v0.2.md`, `eslint.config.js`, `package.json`, `package-lock.json`, `scripts/offline/server.mjs`, `scripts/package-offline.mjs`, `src/app/App.tsx`, `src/batch/BatchController.ts`, `src/components/BatchPanel.tsx`, `src/export/PreviewExporter.ts`, `tests/fixtures/legacy/README.md`.

Added: `LICENSE`, `THIRD_PARTY_NOTICES.md`, `docs/public-release.md`, `docs/release-notes-v0.3.0.md`, `docs/public-preparation-validation.md`, `scripts/build-web.mjs`, `tests/pages/deployment.test.mjs`.

The original development repository also has older uncommitted v0.2/v0.3 changes; they were retained and are not changes introduced by this preparation.

## Validation results

| Check | Result |
|---|---|
| lint | Passed |
| typecheck | Passed |
| Unit tests with public/synthetic input | 88 passed, one optional private-input test skipped |
| Unit tests with locally supplied private input | 89 passed |
| Normal build | Passed |
| Pages build | Passed |
| Chrome browser regression | 30 passed, including local legacy input |
| Pages nested-path Chrome test | 1 passed |
| Offline package/server tests | 4 passed on Apple Silicon macOS |
| Six distribution ZIPs | Generated; SHA-256 verified |
| Package contents | v0.3.0 manifests, project/runtime licenses and matching Mediabunny source verified; no FBX/OBJ/MP4/log/.git/node_modules payloads |

Pages was tested under `/review/arbitrary-project/` on localhost. The legacy worker and WASM loaded there; single MP4 used browser download fallback, and Batch wrote through real browser file handles in origin-private storage with the native directory chooser substituted. This validates the browser paths and processing, not the actual GitHub host or native OS dialog. Regression tests separately cover save-picker activation/cancellation and unsupported directory access.

Private input stayed local and is absent from the public source and ZIPs. Its test images/logs are ignored and excluded. The source ZIP distributed for Mediabunny was compared file-by-file with the installed package, including source, license and metadata.

## Re-audit and history handling

The private repository and a complete local history/source backup are retained. The public checkout is a separate source-only directory, with no inherited commits, tags, remotes or private objects. Initial commit is deferred until the exact GitHub noreply email is confirmed. The authorized public author name is Koji Matsunaga.

Searches of public candidate files found no known private developer path/email, known production asset name, high-confidence API-token/private-key pattern or literal credential assignment. Generic test paths such as `/Users/person/private/motion.fbx` and upstream fixture metadata remain intentionally; these are not the developer's private paths. Third-party copyright/contact information and the authorized project copyright are preserved. Pattern-based review cannot prove the absence of every possible secret or third-party rights issue.

Only the documented ufbx FBX/OBJ fixtures are included as asset files. No Autodesk SDK is bundled. Project-owned SVG/grid code remains unchanged. Runtime dependency versions and legal materials were checked against local package metadata and included upstream licenses.

## Remaining work

Confirm the exact GitHub noreply email before committing. Review the clean checkout and release notes. Repository creation, remote setup, push, Pages publication, v0.3.0 tag, GitHub Release and ZIP upload have not been performed.

After explicit authorization, publish only the clean history. Test actual HTTPS Pages deployment and native save/folder dialogs. Validate Intel Mac, Windows and Linux hardware separately. Large Three.js chunk warnings remain; no runtime behavior was changed to address them in this preparation.

The staged whitespace check reports pre-existing whitespace in two unmodified upstream FBX fixtures and the Emscripten license. Those upstream files were preserved byte-for-byte; project-owned staged files pass the whitespace check.
