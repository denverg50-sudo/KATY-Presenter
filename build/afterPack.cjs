// macOS refuses to codesign files that carry extended attributes (Finder info, iCloud
// provenance, quarantine…). Strip them from the packaged app before signing.
const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('xattr', ['-cr', app])
}
