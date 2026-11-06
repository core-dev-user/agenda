// Detecta o jogo aberto no PC (lista de jogos conhecidos + qualquer jogo instalado pela Steam/Epic/Xbox/EA/Ubisoft).
// Só lê a lista de programas abertos do Windows (nome, pasta e hora em que abriu). Nada sai do PC.
const { app } = require("electron")
const { execFile } = require("node:child_process")
const path = require("node:path")

/** executável → jogo */
const KNOWN = [
  ["valorant-win64-shipping.exe", "valorant", "Valorant", "#ff4655"],
  ["cs2.exe", "cs2", "Counter-Strike 2", "#de9b35"],
  ["csgo.exe", "cs2", "Counter-Strike 2", "#de9b35"],
  ["league of legends.exe", "lol", "League of Legends", "#c89b3c"],
  ["fortniteclient-win64-shipping.exe", "fortnite", "Fortnite", "#9d4dbb"],
  ["gta5.exe", "gta5", "GTA V", "#5aa832"],
  ["gta5_enhanced.exe", "gta5", "GTA V", "#5aa832"],
  ["playgtav.exe", "gta5", "GTA V", "#5aa832"],
  ["robloxplayerbeta.exe", "roblox", "Roblox", "#e2231a"],
  ["r5apex.exe", "apex", "Apex Legends", "#da292a"],
  ["r5apex_dx12.exe", "apex", "Apex Legends", "#da292a"],
  ["overwatch.exe", "overwatch", "Overwatch 2", "#f99e1a"],
  ["rocketleague.exe", "rocketleague", "Rocket League", "#0c8ce9"],
  ["dota2.exe", "dota2", "Dota 2", "#be1e2d"],
  ["minecraft.windows.exe", "minecraft", "Minecraft", "#62b47a"],
  ["fc25.exe", "eafc", "EA Sports FC", "#00d16d"],
  ["fc26.exe", "eafc", "EA Sports FC", "#00d16d"],
  ["genshinimpact.exe", "genshin", "Genshin Impact", "#d3bc8e"],
  ["starrail.exe", "starrail", "Honkai: Star Rail", "#8e7cc3"],
  ["zenlesszonezero.exe", "zzz", "Zenless Zone Zero", "#f2c94c"],
  ["rainbowsix.exe", "r6", "Rainbow Six Siege", "#4a90d9"],
  ["rainbowsix_vulkan.exe", "r6", "Rainbow Six Siege", "#4a90d9"],
  ["tslgame.exe", "pubg", "PUBG", "#f2a900"],
  ["cod.exe", "cod", "Call of Duty", "#7cb342"],
  ["blackops6.exe", "cod", "Call of Duty", "#7cb342"],
  ["marvel-win64-shipping.exe", "marvelrivals", "Marvel Rivals", "#e23636"],
  ["project8.exe", "deadlock", "Deadlock", "#c9a46a"],
  ["eldenring.exe", "eldenring", "Elden Ring", "#c8a85a"],
  ["cyberpunk2077.exe", "cyberpunk", "Cyberpunk 2077", "#fcee0a"],
  ["rdr2.exe", "rdr2", "Red Dead Redemption 2", "#b71c1c"],
  ["destiny2.exe", "destiny2", "Destiny 2", "#5a8fd8"],
  ["wow.exe", "wow", "World of Warcraft", "#f8b700"],
  ["hearthstone.exe", "hearthstone", "Hearthstone", "#f0b232"],
  ["deadbydaylight-win64-shipping.exe", "dbd", "Dead by Daylight", "#9b1c1c"],
  ["thefinals.exe", "thefinals", "The Finals", "#d6ff3d"],
  ["among us.exe", "amongus", "Among Us", "#c51111"],
  ["terraria.exe", "terraria", "Terraria", "#4caf50"],
  ["stardew valley.exe", "stardew", "Stardew Valley", "#7cb342"],
  ["fallguys_client_game.exe", "fallguys", "Fall Guys", "#ff7ac6"],
  ["brawlhalla.exe", "brawlhalla", "Brawlhalla", "#3fa9f5"],
  ["paladins.exe", "paladins", "Paladins", "#41b6e6"],
  ["sims4.exe", "sims4", "The Sims 4", "#3ec300"],
  ["ts4_x64.exe", "sims4", "The Sims 4", "#3ec300"],
  ["helldivers2.exe", "helldivers2", "Helldivers 2", "#ffe600"],
  ["palworld-win64-shipping.exe", "palworld", "Palworld", "#3fa9f5"],
  ["warframe.x64.exe", "warframe", "Warframe", "#a7c7e7"],
  ["pathofexile_x64.exe", "poe", "Path of Exile", "#b08d57"],
  ["pathofexile2.exe", "poe2", "Path of Exile 2", "#b08d57"],
]
const KNOWN_MAP = new Map(KNOWN.map(([exe, id, name, color]) => [exe, { id, name, color }]))
/** jogos conhecidos que estão na Steam: a arte vem da biblioteca da Steam */
const APPIDS = {"cs2": 730, "gta5": 271590, "apex": 1172470, "overwatch": 2357570, "rocketleague": 252950, "dota2": 570, "eafc": 2669320, "r6": 359550, "pubg": 578080, "cod": 1938090, "marvelrivals": 2767030, "deadlock": 1422450, "eldenring": 1245620, "cyberpunk": 1091500, "rdr2": 1174180, "destiny2": 1085660, "dbd": 381210, "thefinals": 2073850, "amongus": 945360, "terraria": 105600, "stardew": 413150, "fallguys": 1097150, "brawlhalla": 291550, "paladins": 444090, "sims4": 1222670, "helldivers2": 553850, "palworld": 1623730, "warframe": 230410, "poe": 238960, "poe2": 2694490}
const RIOT_ICO = { valorant: "valorant.live", lol: "league_of_legends.live" }

/* ---------------- arte dos jogos ---------------- */
const fs = require("node:fs")
let manifests = null // pasta do jogo (minúsculo) → appid
function steamManifests() {
  if (manifests) return manifests
  manifests = new Map()
  const libs = new Set(["C:\\Program Files (x86)\\Steam", "C:\\Program Files\\Steam"])
  for (const r of [...libs]) {
    try { for (const m of fs.readFileSync(path.join(r, "steamapps", "libraryfolders.vdf"), "utf8").matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, "\\")) } catch {}
  }
  for (const l of libs) {
    let files = []
    try { files = fs.readdirSync(path.join(l, "steamapps")).filter((f) => /^appmanifest_\d+\.acf$/.test(f)) } catch { continue }
    for (const f of files) {
      try {
        const t = fs.readFileSync(path.join(l, "steamapps", f), "utf8")
        const id = (t.match(/"appid"\s+"(\d+)"/) || [])[1], dir = (t.match(/"installdir"\s+"([^"]+)"/) || [])[1]
        if (id && dir) manifests.set(dir.toLowerCase(), Number(id))
      } catch {}
    }
  }
  return manifests
}
/** maior imagem de um .ico (os ícones oficiais têm 256 px guardados como PNG) */
function icoToDataUrl(file) {
  try {
    const b = fs.readFileSync(file)
    const n = b.readUInt16LE(4)
    let best = null
    for (let i = 0; i < n; i++) {
      const o = 6 + i * 16
      const w = b[o] || 256, size = b.readUInt32LE(o + 8), off = b.readUInt32LE(o + 12)
      if (!best || w > best.w) best = { w, size, off }
    }
    if (!best) return ""
    const img = b.subarray(best.off, best.off + best.size)
    if (img[0] === 0x89 && img[1] === 0x50) return "data:image/png;base64," + img.toString("base64")
    return "data:image/x-icon;base64," + b.toString("base64")
  } catch { return "" }
}
const artCache = new Map()
function artFor(g) {
  if (artCache.has(g.id)) return artCache.get(g.id)
  let art = {}
  // instalado pela Steam: o appid vem do manifesto da própria pasta do jogo (mais certo que a lista fixa)
  const dir = String(g.path || "").match(/\\steamapps\\common\\([^\\]+)\\/i)
  let appid = dir ? steamManifests().get(dir[1].toLowerCase()) : undefined
  if (!appid) appid = APPIDS[g.id]
  if (appid) art = { logo: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/logo.png`, hero: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_hero.jpg` }
  else if (RIOT_ICO[g.id]) art = { icon: icoToDataUrl(path.join(process.env.ProgramData || "C:\\ProgramData", "Riot Games", "Metadata", RIOT_ICO[g.id], RIOT_ICO[g.id] + ".ico")) }
  artCache.set(g.id, art)
  return art
}
// pastas de lojas: o nome da pasta do jogo vira o nome do jogo
const STORES = [/\\steamapps\\common\\([^\\]+)\\/i, /\\Epic Games\\([^\\]+)\\/i, /\\XboxGames\\([^\\]+)\\/i, /\\EA Games\\([^\\]+)\\/i, /\\Ubisoft Game Launcher\\games\\([^\\]+)\\/i, /\\GOG Galaxy\\Games\\([^\\]+)\\/i]
// programas auxiliares que ficam dentro das pastas dos jogos (não são o jogo)
const NOT_GAME = /crash|report|launcher|helper|setup|redist|unins|vcredist|dxsetup|easyanticheat|eac|battleye|beservice|update|patcher|service|overlay|webhelper|cefprocess|bootstrap|installer|prereq|riotclient|epicgames|steam\.exe|steamwebhelper|ubisoftconnect|eadesktop|origin|ealink|vanguard|vgc|vgtray/i

let getMain = () => null
let custom = [] // { exe, name }
let ignored = new Set()
let last = ""
let lastList = []
let busy = false

// lista de processos pelo WMI: rápido (~1 s) e funciona até com jogos protegidos por anti-cheat
const PS = `$ErrorActionPreference='SilentlyContinue'; Get-CimInstance Win32_Process -Property Name,ExecutablePath,CreationDate,SessionId,CommandLine | Where-Object { $_.SessionId -ne 0 } | ForEach-Object { [pscustomobject]@{ n = $_.Name; p = $_.ExecutablePath; s = $(if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('o') } else { '' }); c = $(if ($_.Name -eq 'javaw.exe') { $_.CommandLine } else { '' }) } } | ConvertTo-Json -Compress`

function scan() {
  if (busy || process.platform !== "win32") return
  busy = true
  execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PS], { windowsHide: true, maxBuffer: 20 * 1024 * 1024, timeout: 25000 }, (err, out) => {
    busy = false
    if (err || !out) return
    let procs = []
    try { procs = JSON.parse(out); if (!Array.isArray(procs)) procs = [procs] } catch { return }
    const found = new Map()
    for (const pr of procs) {
      const p = String(pr.p || "")
      // jogos protegidos por anti-cheat (Valorant/Vanguard) não mostram a pasta: usa o nome do processo
      const exe = (p ? path.basename(p) : String(pr.n || "")).toLowerCase()
      if (!p && !KNOWN_MAP.has(exe) && !custom.some((x) => x.exe && x.exe.toLowerCase() === exe)) continue
      const start = pr.s ? Date.parse(pr.s) : Date.now()
      let g = null
      const c = custom.find((x) => x.exe && x.exe.toLowerCase() === exe)
      if (c) g = { id: "custom:" + exe, name: c.name || exe, color: "#8f9bff" }
      else if (KNOWN_MAP.has(exe)) g = KNOWN_MAP.get(exe)
      else if (exe === "javaw.exe" && /minecraft/i.test(pr.c || "")) g = { id: "minecraft", name: "Minecraft", color: "#62b47a" }
      else if (!NOT_GAME.test(exe)) {
        for (const re of STORES) {
          const m = p.match(re)
          if (m && !/riot client|riot vanguard|launcher/i.test(m[1])) { g = { id: "store:" + m[1].toLowerCase(), name: m[1], color: "" }; break }
        }
      }
      if (!g || ignored.has(g.id)) continue
      const prev = found.get(g.id)
      // vários processos do mesmo jogo: vale o que abriu primeiro
      if (!prev || start < prev.start) found.set(g.id, { ...g, start, path: p, exe, art: artFor({ ...g, path: p }) })
    }
    const list = [...found.values()].sort((a, b) => a.start - b.start)
    const key = list.map((g) => g.id + "@" + g.start).join("|")
    lastList = list
    try { require("./gamestats.cjs").onPlaying(list) } catch (e) { console.error(e) }
    if (key !== last) { last = key; push() }
  })
}

function push() {
  const w = getMain()
  if (w && !w.isDestroyed()) w.webContents.send("games:state", { playing: lastList, at: Date.now() })
}

function register(ipcMain, mainGetter) {
  getMain = mainGetter
  if (!process.env.AGENDA_SHOT) app.whenReady().then(() => { setTimeout(scan, 4000); setInterval(scan, 20000) })
  ipcMain.handle("games:get", () => ({ playing: lastList, at: Date.now() }))
  ipcMain.handle("games:config", (_e, cfg) => {
    custom = Array.isArray(cfg && cfg.custom) ? cfg.custom : []
    ignored = new Set(Array.isArray(cfg && cfg.ignored) ? cfg.ignored : [])
    last = ""
    scan()
  })
  ipcMain.handle("games:scan", () => { last = ""; scan() })
  // ícone do jogo tirado do próprio .exe
  ipcMain.handle("games:icon", async (_e, p) => {
    try { return (await app.getFileIcon(p, { size: "large" })).toDataURL() } catch { return "" }
  })
}

module.exports = { register }
