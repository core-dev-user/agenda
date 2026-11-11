// Foreground-only policy: an unrelated game left open in the background must
// not disable the Widgy shortcuts while another app is in front.
// Windows itself keeps ownership of shortcuts in protected fullscreen games.
const path = require("node:path")

const PROTECTED = new Set([
  "valorant-win64-shipping.exe",
  "fortniteclient-win64-shipping.exe",
  "cs2.exe", "r5apex.exe", "r5apex_dx12.exe",
  "tslgame.exe", "cod.exe", "blackops6.exe",
  "rainbowsix.exe", "rainbowsix_vulkan.exe",
  "robloxplayerbeta.exe", "league of legends.exe",
  "overwatch.exe", "marvel-win64-shipping.exe",
  "destiny2.exe", "thefinals.exe", "deadbydaylight-win64-shipping.exe",
])
function isProtectedForeground(exe) {
  const name = path.win32.basename(String(exe || "").replace(/\//g, "\\")).toLowerCase()
  return PROTECTED.has(name)
}
// If the foreground window cannot be resolved (e.g. an exclusive full-screen
// renderer), do not attempt to install Widgy's keyboard hook over that game.
function foregroundInfo(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.wins)) return { exe: "", unresolvedFullscreen: true }
  const win = snapshot.wins.find((w) => String(w.h) === String(snapshot.fg))
  return { exe: String(win?.exe || ""), unresolvedFullscreen: !!snapshot.full && !win }
}
function shouldCaptureKeys({ barActive, enabled, foreground, allowProtectedGames = false }) {
  if (!barActive || !enabled || !foreground || foreground.unresolvedFullscreen) return false
  return allowProtectedGames || !isProtectedForeground(foreground.exe)
}
module.exports = { foregroundInfo, shouldCaptureKeys, isProtectedForeground }
