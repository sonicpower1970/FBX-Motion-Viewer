import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { createMacLauncher } from './offline/macos-app.mjs'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(await readFile(join(project, 'package.json'), 'utf8'))
const version = (await readFile(join(project, '.nvmrc'), 'utf8')).trim()
if (!/^24\.\d+\.\d+$/.test(version)) throw new Error('Expected a pinned Node 24 version in .nvmrc')
const targets = {
  'darwin-arm64': 'macos-apple-silicon',
  'darwin-x64': 'macos-intel',
  'win-x64': 'windows-x64',
  'win-arm64': 'windows-arm64',
  'linux-x64': 'linux-x64',
  'linux-arm64': 'linux-arm64',
}
const args = process.argv.slice(2)
const current = `${process.platform === 'win32' ? 'win' : process.platform}-${process.arch}`
const selected = args.includes('--all') ? Object.keys(targets) : [args.includes('--target') ? args[args.indexOf('--target') + 1] : current]
for (const target of selected) if (!targets[target]) throw new Error(`Unsupported target: ${target}. Use ${Object.keys(targets).join(', ')}`)
if (process.platform === 'win32') throw new Error('Build distribution archives on macOS or Linux (tar, unzip and zip required).')
const cache = join(project, '.tools', 'offline-cache', version)
const releases = join(project, 'releases')
await mkdir(cache, { recursive: true })
await mkdir(releases, { recursive: true })
const baseUrl = `https://nodejs.org/dist/v${version}/`
async function exists(file) { try { await stat(file); return true } catch { return false } }
async function download(name, destination) {
  console.log(`Downloading ${name} ...`)
  const response = await fetch(baseUrl + name)
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}): ${name}`)
  const temporary = `${destination}.download`
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary))
  await rename(temporary, destination)
}
async function sha256(file) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(file)) hash.update(bytes)
  return hash.digest('hex')
}
const sumsPath = join(cache, 'SHASUMS256.txt')
if (!await exists(sumsPath)) await download('SHASUMS256.txt', sumsPath)
const sums = new Map((await readFile(sumsPath, 'utf8')).trim().split('\n').map((line) => {
  const [hash, name] = line.trim().split(/\s+/)
  return [name, hash]
}))
await stat(join(project, 'dist', 'index.html'))

for (const target of selected) {
  const windows = target.startsWith('win-')
  const extension = windows ? 'zip' : 'tar.gz'
  const nodeDirectory = `node-v${version}-${target}`
  const archiveName = `${nodeDirectory}.${extension}`
  const cached = join(cache, archiveName)
  const existing = join(project, '.tools', archiveName)
  const archive = await exists(existing) ? existing : cached
  if (!await exists(archive)) await download(archiveName, archive)
  if (!sums.has(archiveName) || await sha256(archive) !== sums.get(archiveName)) throw new Error(`Checksum mismatch: ${archiveName}`)
  const work = await mkdtemp(join(cache, 'package-'))
  const name = `FBX-Motion-Viewer-v${config.version}-${targets[target]}`
  const bundle = join(work, name)
  const runtime = join(bundle, 'runtime')
  const licenses = join(bundle, 'licenses')
  await mkdir(runtime, { recursive: true })
  await mkdir(licenses, { recursive: true })
  if (windows) {
    execFileSync('unzip', ['-q', '-j', archive, `${nodeDirectory}/node.exe`, `${nodeDirectory}/LICENSE`, '-d', runtime])
  } else {
    execFileSync('tar', ['-xzf', archive, '-C', work, `${nodeDirectory}/bin/node`, `${nodeDirectory}/LICENSE`])
    await copyFile(join(work, nodeDirectory, 'bin', 'node'), join(runtime, 'node'))
    await copyFile(join(work, nodeDirectory, 'LICENSE'), join(runtime, 'LICENSE'))
    await chmod(join(runtime, 'node'), 0o755)
  }
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) await copyFile(join(project, file), join(bundle, file))
  await cp(join(project, 'dist'), join(bundle, 'app', 'dist'), { recursive: true })
  await copyFile(join(project, 'scripts', 'offline', 'server.mjs'), join(bundle, 'app', 'server.mjs'))
  for (const dependency of ['react', 'react-dom', 'scheduler', 'three', 'mediabunny']) {
    await copyFile(join(project, 'node_modules', dependency, 'LICENSE'), join(licenses, `${dependency}-LICENSE.txt`))
  }
  await copyFile(join(project, 'scripts', 'offline', 'fflate-LICENSE.txt'), join(licenses, 'fflate-LICENSE.txt'))
  await copyFile(join(project, 'vendor', 'ufbx', 'LICENSE'), join(licenses, 'ufbx-LICENSE.txt'))
  for (const file of ['LICENSE', 'musl-COPYRIGHT', 'compiler-rt-LICENSE.txt']) {
    await copyFile(join(project, 'vendor', 'emscripten', file), join(licenses, `emscripten-${file}`))
  }
  // MPL-2.0: distribute the matching unmodified library source alongside the bundle.
  const mediaSource = join(bundle, 'third-party-sources', 'mediabunny')
  await mkdir(mediaSource, { recursive: true })
  await cp(join(project, 'node_modules', 'mediabunny', 'src'), join(mediaSource, 'src'), { recursive: true })
  for (const file of ['package.json', 'README.md', 'LICENSE']) {
    await copyFile(join(project, 'node_modules', 'mediabunny', file), join(mediaSource, file))
  }
  const launcher = windows ? 'Start Viewer.cmd' : target.startsWith('darwin') ? 'Start Viewer.command' : 'Start Viewer.sh'
  const launchText = windows
    ? '@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\n"%~dp0runtime\\node.exe" "%~dp0app\\server.mjs"\r\nif errorlevel 1 pause\r\n'
    : '#!/bin/sh\nset -eu\nBUNDLE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$BUNDLE_DIR/runtime/node" "$BUNDLE_DIR/app/server.mjs" "$@"\n'
  await writeFile(join(bundle, launcher), launchText)
  if (!windows) await chmod(join(bundle, launcher), 0o755)
  if (target.startsWith('darwin')) await createMacLauncher(bundle, config.version)
  await writeFile(join(bundle, 'README.txt'), `FBX Motion Viewer v${config.version} — Offline / ${targets[target]}\n\n` +
    (target.startsWith('darwin') ? `macOS Dock launcher: FBX Motion Viewer.app opens the existing Start Viewer.command in Terminal. Keep the whole release folder in a permanent location, then drag the .app from Finder to the app section of the Dock. Do not move the .app alone. The launcher exits after handing off to Terminal; stop the server with Ctrl+C in Terminal. Clicking again starts another server, just like the .command.\nMac: 配布フォルダ全体を保管後、FBX Motion Viewer.appをDockへドラッグしてください。.app単体では移動せず、終了はTerminalでCtrl+Cです。\n\n` : '') +
    `1. Extract the entire ZIP. Keep all files and folders together.\n2. Run "${launcher}". On Linux: sh "Start Viewer.sh"\n3. Your default browser opens. If needed, copy the printed URL into Chrome.\n4. Drop an FBX or choose Open FBX. Files stay in the browser.\n5. Keep the terminal window open. Press Ctrl+C to stop the viewer.\n\n` +
    `Node.js ${version} is included. No npm install or internet connection is required to use the viewer. A browser with WebGL 2 is required.\nThis starts an HTTP server bound to 127.0.0.1 only, on an automatically selected port. It has no upload endpoint.\nNo auto-updater. To update, stop the viewer and replace the entire folder with a new release.\n\n` +
    `展開後、${launcher} を起動してください。フォルダの一部だけを移動しないでください。\n既定のブラウザが開きます。Chromeを使う場合は表示されたURLをChromeで開いてください。\n使用中は起動用ターミナルを閉じず、終了時はCtrl+Cを押してください。\nインターネット接続・Node.jsの追加インストールは不要です。\n配布物は未署名・未公証です。macOSやWindowsの保護機能により初回起動が確認・制限される場合があります。\n\n` +
    `Batch: BATCH EXPORT → add/drop multiple FBX → SELECT FOLDER → START BATCH. FPS AUTO from each file (30 fps fallback), first take, FIT + FOLLOW, 1080p/720p, Burn-in. Sequential local processing; CANCEL BATCH and RETRY FAILED. Requires browser directory access; existing outputs get numbered filenames. Close the Batch panel to return to the original Viewer.\n\n` +
    `Review: Playback speed 0.25x/0.5x/1x/2x; X-Ray Bones; Shadow; Follow on the ground plane. Preview export samples the full selected take at Timeline FPS, including the last pose, without audio/UI.\nControls: Alt+left Orbit / Alt+middle Pan / Alt+right Dolly; wheel Zoom; F Fit; Space Play/Pause; Left/Right frame step.\nTimeline FPS: 23.976 / 24 / 25 / 29.97 / 30 / 50 / 59.94 / 60.\n\n` +
    `Known limits: 500 MiB input cap is not a performance guarantee. Legacy FBX uses a cancellable local WASM worker; modern FBX parsing can block the UI. Legacy transforms are baked at 120 Hz. External textures are replaced, not fetched. MP4 previews require browser H.264/WebCodecs support. Preview files are held in memory (512 MiB limit).\nOnly Apple Silicon macOS has been run-tested in this development environment. Other packages require target-machine verification.\nNode runtime requirements: macOS 13.5+, Windows 10+, or glibc-based Linux (glibc 2.28+, kernel 4.18+). Chrome's requirements also apply.\n\n` +
    `Third-party notices are in licenses/ and runtime/LICENSE. The unmodified mediabunny library source is included in third-party-sources/mediabunny under MPL-2.0.\n`)
  await writeFile(join(bundle, 'manifest.json'), JSON.stringify({ application: config.name, version: config.version, target, node: version, nodeArchiveSha256: sums.get(archiveName), dependencies: config.dependencies, legacyReader: 'ufbx 0.23.0 / Emscripten 4.0.23' }, null, 2) + '\n')
  const zip = join(work, `${name}.zip`)
  execFileSync('zip', ['-q', '-r', zip, name], { cwd: work })
  const destination = join(releases, basename(zip))
  await rename(zip, destination)
  await writeFile(`${destination}.sha256`, `${await sha256(destination)}  ${basename(destination)}\n`)
  console.log(`Created releases/${basename(destination)} (${((await stat(destination)).size / 1024 / 1024).toFixed(1)} MiB)`)
}
