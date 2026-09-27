import { chmod, copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Standard macOS bundle; no compiler, Electron or changes to the Web app needed.
export async function createMacLauncher(bundle, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Expected a numeric app version')
  const contents = join(bundle, 'FBX Motion Viewer.app', 'Contents')
  const executable = join(contents, 'MacOS', 'FBXMotionViewer')
  await mkdir(join(contents, 'MacOS'), { recursive: true })
  await copyFile(new URL('./macos-launcher.sh', import.meta.url), executable)
  await chmod(executable, 0o755)
  await writeFile(join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>FBXMotionViewer</string>
  <key>CFBundleIdentifier</key><string>local.fbx-motion-viewer.launcher</string>
  <key>CFBundleName</key><string>FBX Motion Viewer</string>
  <key>CFBundleDisplayName</key><string>FBX Motion Viewer</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>LSMinimumSystemVersion</key><string>13.5</string>
</dict></plist>
`)
  await writeFile(join(contents, 'PkgInfo'), 'APPL????')
}
