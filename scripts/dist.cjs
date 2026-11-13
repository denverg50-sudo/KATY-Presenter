// Builds installers. On macOS the app is packaged in a temp folder outside iCloud Drive,
// because iCloud adds Finder attributes that make code signing fail; then the finished
// installers are copied into ./dist. Usage: node scripts/dist.cjs --mac | --win
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const root = path.join(__dirname, '..')
const args = process.argv.slice(2)
const out = process.platform === 'darwin' ? path.join(os.tmpdir(), 'katy-presenter-build') : path.join(root, 'dist')
fs.rmSync(out, { recursive: true, force: true })

const bin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder')
execFileSync(bin, [...args, '--publish', 'never', `--config.directories.output=${out}`], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { CSC_IDENTITY_AUTO_DISCOVERY: 'false', ...process.env }
})

if (out !== path.join(root, 'dist')) {
  const dist = path.join(root, 'dist')
  fs.mkdirSync(dist, { recursive: true })
  for (const f of fs.readdirSync(out).filter((f) => /\.(dmg|exe|AppImage|zip)$/.test(f))) {
    fs.copyFileSync(path.join(out, f), path.join(dist, f))
    console.log(`  → dist/${f}`)
  }
}
