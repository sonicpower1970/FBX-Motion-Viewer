import { build } from 'vite'
import { readFile, readdir, mkdir, writeFile, copyFile } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { zipSync } from 'fflate'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pages = process.argv.includes('--pages')
// Relative URLs support an as-yet-unknown Project Pages repository name.
// An explicit local URL prefix may be supplied for a fixed deployment.
const base = pages ? process.env.PAGES_BASE || './' : '/'
if (base !== './' && (!/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(base))) throw new Error('PAGES_BASE must be ./ or a local path such as /FBX-Motion-Viewer/.')
const output = resolve(root, pages ? 'dist-pages' : 'dist')
await build({ root, base, build: { outDir: output } })
const legal = join(output, 'legal')
await mkdir(legal, { recursive: true })
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'))
const mediaDir = join(root, 'node_modules', 'mediabunny')
const media = JSON.parse(await readFile(join(mediaDir, 'package.json'), 'utf8'))
if (media.version !== pkg.dependencies.mediabunny || media.version !== lock.packages['node_modules/mediabunny'].version) throw new Error('Mediabunny source version does not match the locked build.')
const files = {}
async function collect(directory, relative) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name), path = `${relative}/${entry.name}`
    if (entry.isDirectory()) await collect(file, path)
    else if (entry.isFile()) files[path] = new Uint8Array(await readFile(file))
    else throw new Error(`Unexpected source entry: ${path}`)
  }
}
await collect(join(mediaDir, 'src'), `mediabunny-${media.version}/src`)
for (const name of ['LICENSE', 'README.md', 'package.json']) files[`mediabunny-${media.version}/${name}`] = new Uint8Array(await readFile(join(mediaDir, name)))
const archive = `mediabunny-${media.version}-source.zip`
// A fixed timestamp makes the source archive reproducible across builds.
const zip = zipSync(files, { level: 6, mtime: new Date('2000-01-01T00:00:00Z') })
await writeFile(join(legal, archive), zip)
await writeFile(join(legal, `${archive}.sha256`), `${createHash('sha256').update(zip).digest('hex')}  ${archive}\n`)
const licenses = [
  ['Project-MIT.txt', 'LICENSE'],
  ...['three', 'react', 'react-dom', 'scheduler', 'mediabunny'].map(name => [`${name}-LICENSE.txt`, `node_modules/${name}/LICENSE`]),
  ['ufbx-LICENSE.txt', 'vendor/ufbx/LICENSE'],
  ['fflate-LICENSE.txt', 'scripts/offline/fflate-LICENSE.txt'],
  ['Emscripten-LICENSE.txt', 'vendor/emscripten/LICENSE'],
  ['musl-COPYRIGHT.txt', 'vendor/emscripten/musl-COPYRIGHT'],
  ['compiler-rt-LICENSE.txt', 'vendor/emscripten/compiler-rt-LICENSE.txt'],
]
for (const [destination, source] of licenses) await copyFile(join(root, source), join(legal, destination))
await copyFile(join(root, 'THIRD_PARTY_NOTICES.md'), join(legal, 'THIRD_PARTY_NOTICES.md'))
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const notices = await readFile(join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8')
await writeFile(join(legal, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Licenses — FBX Motion Viewer ${escape(pkg.version)}</title>
<style>body{max-width:1000px;margin:40px auto;padding:0 24px;background:#18212a;color:#e5eaf0;font:16px/1.6 system-ui}a{color:#9ad8ef}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.6 ui-monospace,monospace}</style></head><body>
<a href="../index.html">Back to Viewer</a><h1>FBX Motion Viewer ${escape(pkg.version)} — Licenses</h1>
<p>Project code: MIT. Copyright (c) 2026 Koji Matsunaga. Third-party components retain their own licenses.</p>
<h2>Mediabunny ${escape(media.version)} — MPL-2.0</h2>
<p>Unmodified corresponding source used in this build: <a href="${archive}" download>Download source ZIP</a>.
<a href="mediabunny-LICENSE.txt">MPL-2.0 license</a>. The ZIP includes original TypeScript files, license, README and package metadata.</p>
<h2>Complete license texts</h2><ul>${licenses.map(([name]) => `<li><a href="${name}">${name}</a></li>`).join('')}</ul>
<p><a href="THIRD_PARTY_NOTICES.md">Download third-party notices</a></p><pre>${escape(notices)}</pre>
</body></html>\n`)
console.log(`Prepared ${pages ? 'Pages' : 'offline'} build at ${output}, base=${base}; licenses and matching Mediabunny source included.`)
