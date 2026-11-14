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
// `fx` (programa da janela da frente) vem do ajudante mesmo quando a janela não está na lista: é o caso das
// janelas do próprio Widgy (a área de trabalho dele ocupa a tela toda e fica fora da barra). Antes, com a área
// de trabalho do Widgy na frente, ela era tratada como um jogo em tela cheia desconhecido e a tecla Windows
// voltava para o Iniciar original exatamente quando a pessoa estava na área de trabalho.
// `ownExe`: caminho do próprio Widgy. Uma janela do Widgy em tela cheia (a área de trabalho dele) não conta como
// "outro programa em tela cheia".
function foregroundInfo(snapshot, ownExe = "") {
  if (!snapshot || !Array.isArray(snapshot.wins)) return { exe: "", unresolvedFullscreen: true, fullscreen: false, own: false }
  const win = snapshot.wins.find((w) => String(w.h) === String(snapshot.fg))
  const exe = String(win?.exe || snapshot.fx || "")
  const own = !!exe && !!ownExe && exe.toLowerCase() === String(ownExe).toLowerCase()
  return { exe, unresolvedFullscreen: !!snapshot.full && !exe, fullscreen: !!snapshot.full && !own, own }
}
function shouldCaptureKeys({ barActive, enabled, foreground, allowProtectedGames = false, gameExes }) {
  return !captureBlockReason({ barActive, enabled, foreground, allowProtectedGames, gameExes })
}
/** por que o atalho está desligado agora ("" = ligado). Aparece em Configurações. */
// `gameExes`: jogos que o Widgy detectou abertos. Com QUALQUER um deles na frente o gancho de teclado sai
// (antes só os da lista de anti-cheat): alguns anti-cheats encerram o jogo ao ver um programa interceptando o
// teclado ou injetando teclas, e dentro de um jogo a tecla Windows não deve abrir menu nenhum.
function captureBlockReason({ barActive, enabled, foreground, allowProtectedGames = false, gameExes }) {
  if (!barActive) return "a barra do Widgy não está no lugar da do Windows"
  if (!enabled) return "os atalhos do Widgy estão desligados"
  if (!foreground) return "esperando a primeira leitura das janelas abertas"
  if (foreground.unresolvedFullscreen) return "um programa em tela cheia que o Widgy não identificou está na frente"
  if (!allowProtectedGames && isProtectedForeground(foreground.exe)) return "jogo com anti-cheat na frente (" + path.win32.basename(foreground.exe) + ")"
  const fgName = path.win32.basename(String(foreground.exe || "").replace(/\//g, "\\")).toLowerCase()
  if (fgName && gameExes && gameExes.has(fgName)) return "jogo na frente (" + path.win32.basename(foreground.exe) + ")"
  if (foreground.fullscreen) return "programa em tela cheia na frente (" + (path.win32.basename(foreground.exe) || "desconhecido") + ")"
  return ""
}
module.exports = { foregroundInfo, shouldCaptureKeys, captureBlockReason, isProtectedForeground }
