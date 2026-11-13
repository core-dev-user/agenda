// Valorant: qual agente você está jogando (para o widget de templates trocar sozinho).
// Usa a API local do Riot Client (a mesma que o cliente usa), só enquanto o Valorant está aberto.
const { app } = require("electron")
const https = require("node:https")
const fs = require("node:fs")
const path = require("node:path")

let getMain = () => null
const send = (ch, d) => { const w = getMain(); if (w && !w.isDestroyed()) w.webContents.send(ch, d) }
const getJSON = async (url, headers = {}) => { const r = await fetch(url, { headers }); if (!r.ok) throw new Error(String(r.status)); return r.json() }

const PLATFORM = Buffer.from(JSON.stringify({ platformType: "PC", platformOS: "Windows", platformOSVersion: "10.0.19042.1.256.64bit", platformChipset: "Unknown" })).toString("base64")
let version = ""
function lockfile() {
  try {
    const [, , port, pass] = fs.readFileSync(path.join(process.env.LOCALAPPDATA || "", "Riot Games", "Riot Client", "Config", "lockfile"), "utf8").split(":")
    return { port, pass }
  } catch { return null }
}
const riotLocal = (lf, p) => new Promise((res, rej) => {
  https.get({ host: "127.0.0.1", port: lf.port, path: p, rejectUnauthorized: false, timeout: 4000, headers: { Authorization: "Basic " + Buffer.from("riot:" + lf.pass).toString("base64") } }, (r) => {
    let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => { try { r.statusCode < 300 ? res(JSON.parse(d)) : rej(new Error(String(r.statusCode))) } catch (e) { rej(e) } })
  }).on("error", rej)
})
const deep = (o, k) => { if (!o || typeof o !== "object") return undefined; if (k in o) return o[k]; for (const v of Object.values(o)) { const r = deep(v, k); if (r !== undefined) return r } return undefined }

let region = "", shard = "", agent = null, busy = false
async function poll() {
  if (busy) return
  busy = true
  try {
    const lf = lockfile()
    if (!lf) return
    const s = await riotLocal(lf, "/chat/v1/session")
    const pres = await riotLocal(lf, "/chat/v4/presences")
    const me = (pres.presences || []).find((p) => p.puuid === s.puuid && p.product === "valorant")
    let pr = {}
    try { pr = me && me.private ? JSON.parse(Buffer.from(me.private, "base64").toString()) : {} } catch {}
    const loop = deep(pr, "sessionLoopState") || ""
    let next = null
    if (loop === "PREGAME" || loop === "INGAME") {
      if (!region) {
        const ext = await riotLocal(lf, "/product-session/v1/external-sessions")
        const v = Object.values(ext).find((x) => x.productId === "valorant")
        const args = (v && v.launchConfiguration && v.launchConfiguration.arguments) || []
        region = ((args.find((a) => a.startsWith("-ares-deployment=")) || "").split("=")[1]) || "na"
        const ep = (args.find((a) => a.startsWith("-config-endpoint=")) || "").match(/shared\.([a-z]+)\./)
        shard = ep ? ep[1] : ["latam", "br"].includes(region) ? "na" : region
      }
      if (!version) version = (await getJSON("https://valorant-api.com/v1/version")).data.riotClientVersion
      const e = await riotLocal(lf, "/entitlements/v1/token")
      const H = { Authorization: "Bearer " + e.accessToken, "X-Riot-Entitlements-JWT": e.token, "X-Riot-ClientVersion": version, "X-Riot-ClientPlatform": PLATFORM }
      const kind = loop === "PREGAME" ? "pregame" : "core-game"
      const base = `https://glz-${region}-1.${shard}.a.pvp.net/${kind}/v1`
      const pm = await getJSON(`${base}/players/${s.puuid}`, H)
      const mm = await getJSON(`${base}/matches/${pm.MatchID}`, H)
      const players = kind === "pregame" ? ((mm.AllyTeam && mm.AllyTeam.Players) || []) : (mm.Players || [])
      const mine = players.find((p) => p.Subject === s.puuid)
      // MapID vem na mesma resposta da partida (seleção de agentes e partida em andamento): o widget pode usar o mapa como fundo
      const map = typeof mm.MapID === "string" ? mm.MapID : undefined
      if (mine && mine.CharacterID) next = { id: String(mine.CharacterID).toLowerCase(), locked: kind === "core-game" || mine.CharacterSelectionState === "locked", state: loop, map }
    }
    if (JSON.stringify(next) !== JSON.stringify(agent)) { agent = next; send("valorant:agent", agent) }
  } catch {} finally { busy = false }
}

let timer = null
/** chamado pelo detector de jogos a cada varredura */
function onPlaying(list) {
  const on = list.some((g) => g.id === "valorant")
  if (on && !timer) { poll(); timer = setInterval(poll, 8000) }
  if (!on && timer) { clearInterval(timer); timer = null; if (agent) { agent = null; send("valorant:agent", null) } }
}

function register(ipcMain, mainGetter) {
  getMain = mainGetter
  ipcMain.handle("valorant:agent", () => agent)
  // limpeza: a versão anterior instalava a integração do CS2 (KDA), que não é mais usada
  if (!process.env.AGENDA_SHOT) app.whenReady().then(() => {
    for (const lib of ["C:\\Program Files (x86)\\Steam", "C:\\Program Files\\Steam"]) {
      const f = path.join(lib, "steamapps", "common", "Counter-Strike Global Offensive", "game", "csgo", "cfg", "gamestate_integration_agenda.cfg")
      try { if (fs.existsSync(f)) fs.unlinkSync(f) } catch {}
    }
  })
}

module.exports = { register, onPlaying }
