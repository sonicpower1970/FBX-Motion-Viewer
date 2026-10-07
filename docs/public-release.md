# Public release checklist

## Initial v0.3.0 source baseline

The public source baseline is v0.3.0. Publication is a separate, explicitly authorized step.

1. Preserve the private development history and working source backup locally.
2. Prepare a source-only checkout with a new Git history. Exclude releases, caches, local backups, private assets and test output. Keep only documented public fixtures.
3. Confirm author name **Koji Matsunaga** and the exact GitHub noreply email from GitHub Settings → Emails. Do not infer the address. Only then create the initial commit, `Initial public release: FBX Motion Viewer v0.3.0`.
4. Review README, MIT license, third-party notices and generated license/source downloads. Check staged files for personal paths, credentials and private asset names.
5. Run lint, typecheck, unit tests, normal and Pages builds, browser tests and offline package tests. Verify all ZIP checksums. Distinguish tested hardware from packages built for untested targets.
6. After explicit publication authorization, create the GitHub repository, add its remote to the clean checkout and push only the new public history. Do not use the private development repository for this push.
7. Configure Pages to publish the complete `dist-pages/` output. Verify HTTPS, nested asset paths, legacy worker/WASM, license/source links, single export and folder-based batch export on the actual host.
8. Create the v0.3.0 tag on the reviewed public commit and prepare a GitHub Release using the draft release notes. Attach the six ZIPs and their `.sha256` files, not private test data.

No automatic publishing workflow is installed by this preparation. Repository name, URL, author email and actual hosted verification remain publication-time inputs. Public screenshots should use only original or clearly licensed assets.

## Subsequent release: v0.4.0

- Apply only necessary tested changes to the public checkout; retain public README links, screenshots, attribution and licenses. Never copy development caches, backups, logs, private assets or generated outputs into Git history.
- Verify version, security/privacy, dependency licenses, tests, Pages build and the six package ZIPs/checksums before committing.
- Commit only the public checkout as `Release FBX Motion Viewer v0.4.0`, then push main and verify its Pages deployment.
- After Pages verification, create the annotated `v0.4.0` tag with message `FBX Motion Viewer v0.4.0` and push it.
- Create a Draft Release, attach six v0.4.0 ZIPs and six SHA-256 files, and verify uploaded digests. Keep the release **DRAFT** until the maintainer completes hosted hardware acceptance and authorizes publication.
- Preserve the existing v0.3.0 tag, release and assets.
