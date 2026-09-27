# Public release checklist

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
