// Estatísticas dos jogos, só pelos meios que os próprios jogos oferecem no seu PC:
// - CS2: Game State Integration (recurso oficial da Valve: o jogo manda os dados para o Agenda em 127.0.0.1)
// - Valorant: API local do Riot Client (a mesma que o cliente usa) + histórico de partidas da sua conta
// - League of Legends: Live Client Data API (oficial, porta 2999, só durante a partida)
const { app } = require("electron")
const http = require("node:http")
const https = require("node:https")
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")

let getMain = () => null
const send = (ch, d) => { const w = getMain(); if (w && !w.isDestroyed()) w.webContents.send(ch, d) }
const live = {}
const setLive = (id, data) => { live[id] = data ? { ...data, updated: Date.now() } : null; send("gamestats:live", { id, data: live[id] }) }
const emitMatch = (m) => send("gamestats:match", m)
const getJSON = async (url, headers = {}) => { const r = await fetch(url, { headers }); if (!r.ok) throw new Error(String(r.status)); return r.json() }

/* =============================================== CS2 =============================================== */
const PORT = 47817
let token = ""
function gsiToken() {
  if (token) return token
  const f = path.join(app.getPath("userData"), "gsi-token")
  try { token = fs.readFileSync(f, "utf8").trim() } catch {}
  if (!token) { token = crypto.randomBytes(12).toString("hex"); try { fs.writeFileSync(f, token) } catch {} }
  return token
}
const cfgText = () => `"Agenda"
{
 "uri" "http://127.0.0.1:${PORT}/cs2"
 "timeout" "5.0"
 "buffer" "0.1"
 "throttle" "0.5"
 "heartbeat" "10.0"
 "auth" { "token" "${gsiToken()}" }
 "data"
 {
  "provider" "1"
  "map" "1"
  "round" "1"
  "player_id" "1"
  "player_state" "1"
  "player_match_stats" "1"
  "player_weapons" "1"
 }
}
`
/** grava o arquivo de integração na pasta do CS2; devolve true se criou/atualizou agora */
function installCs2Cfg(cfgDir) {
  try {
    if (!fs.existsSync(cfgDir)) return false
    const f = path.join(cfgDir, "gamestate_integration_agenda.cfg")
    const txt = cfgText()
    if (fs.existsSync(f) && fs.readFileSync(f, "utf8") === txt) return false
    fs.writeFileSync(f, txt)
    cfgInstalledAt = Date.now()
    return true
  } catch { return false }
}
const cs2CfgFromExe = (exe) => path.resolve(path.dirname(exe), "..", "..", "..", "csgo", "cfg")
/** procura o CS2 nas bibliotecas da Steam (sem precisar o jogo estar aberto) */
function findCs2CfgDirs() {
  const roots = ["C:\\Program Files (x86)\\Steam", "C:\\Program Files\\Steam"]
  const libs = new Set()
  for (const r of roots) {
    try {
      const vdf = fs.readFileSync(path.join(r, "steamapps", "libraryfolders.vdf"), "utf8")
      for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, "\\"))
      libs.add(r)
    } catch {}
  }
  return [...libs].map((l) => path.join(l, "steamapps", "common", "Counter-Strike Global Offensive", "game", "csgo", "cfg")).filter((d) => fs.existsSync(d))
}
let cs2Installed = false
let cs2NeedsRestart = false
let cfgInstalledAt = 0
let gotGsi = false

let cs = { team: "", k: 0, a: 0, d: 0, mvps: 0, score: 0, hs: 0, phase: "", map: "", lastSeen: 0 }
function onGsi(p) {
  if (!p || !p.auth || p.auth.token !== gsiToken()) return
  cs2NeedsRestart = false
  gotGsi = true
  const map = p.map
  if (!map) { setLive("cs2", { menu: true, connected: true }); cs.phase = ""; return }
  // nova partida (outro mapa, ou aquecimento depois de um fim de jogo): zera antes de ler
  if (map.name !== cs.map || (map.phase === "warmup" && cs.phase === "gameover")) Object.assign(cs, { k: 0, a: 0, d: 0, mvps: 0, score: 0, hs: 0, map: map.name })
  const own = p.player && p.provider && p.player.steamid === p.provider.steamid
  if (own) {
    const ms = p.player.match_stats || {}
    const st = p.player.state || {}
    // headshots: soma as kills de HS da rodada quando ela termina
    if (p.round && p.round.phase === "over" && cs.roundPhase !== "over") cs.hs += st.round_killhs || 0
    Object.assign(cs, { team: p.player.team || cs.team, k: ms.kills ?? cs.k, a: ms.assists ?? cs.a, d: ms.deaths ?? cs.d, mvps: ms.mvps ?? cs.mvps, score: ms.score ?? cs.score })
    cs.hp = st.health; cs.armor = st.armor; cs.money = st.money; cs.roundKills = st.round_kills
    const w = Object.values(p.player.weapons || {}).find((x) => x.state === "active")
    cs.weapon = w ? String(w.name || "").replace(/^weapon_/, "") : ""
  }
  if (p.round) cs.roundPhase = p.round.phase
  const ct = (map.team_ct && map.team_ct.score) || 0, t = (map.team_t && map.team_t.score) || 0
  const mine = cs.team === "CT" ? ct : cs.team === "T" ? t : null
  const theirs = cs.team === "CT" ? t : cs.team === "T" ? ct : null
  setLive("cs2", {
    connected: true, map: map.name, mode: map.mode, phase: map.phase, round: map.round, ct, t, team: cs.team, mine, theirs,
    k: cs.k, a: cs.a, d: cs.d, mvps: cs.mvps, score: cs.score, hs: cs.hs, alive: own && (cs.hp ?? 0) > 0, spectating: !own,
    hp: own ? cs.hp : null, armor: own ? cs.armor : null, money: own ? cs.money : null, roundKills: own ? cs.roundKills : 0, weapon: own ? cs.weapon : "",
  })
  if (map.phase === "gameover" && cs.phase !== "gameover") {
    emitMatch({ id: `cs2-${map.name}-${Date.now()}`, game: "cs2", at: Date.now(), map: map.name, mode: map.mode, k: cs.k, d: cs.d, a: cs.a, mvps: cs.mvps, score: cs.score, hs: cs.hs,
      result: mine == null ? "" : mine > theirs ? "win" : mine < theirs ? "loss" : "draw", rounds: mine == null ? `${ct}-${t}` : `${mine}-${theirs}` })
  }
  cs.phase = map.phase
}
function startGsiServer() {
  const srv = http.createServer((req, res) => {
    if (req.method !== "POST" || !req.url.startsWith("/cs2")) { res.writeHead(404); return res.end() }
    let body = ""
    req.on("data", (c) => { body += c; if (body.length > 2e6) req.destroy() })
    req.on("end", () => { try { onGsi(JSON.parse(body)) } catch {} res.writeHead(200); res.end() })
  })
  srv.on("error", () => {})
  srv.listen(PORT, "127.0.0.1")
}

/* =============================================== Valorant =============================================== */
const PLATFORM = Buffer.from(JSON.stringify({ platformType: "PC", platformOS: "Windows", platformOSVersion: "10.0.19042.1.256.64bit", platformChipset: "Unknown" })).toString("base64")
let content = null // agentes, mapas, ranks (valorant-api.com, público)
async function vContent() {
  if (content) return content
  const [ag, mp, tiers, ver] = await Promise.all([
    getJSON("https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=pt-BR"),
    getJSON("https://valorant-api.com/v1/maps?language=pt-BR"),
    getJSON("https://valorant-api.com/v1/competitivetiers?language=pt-BR"),
    getJSON("https://valorant-api.com/v1/version"),
  ])
  const agents = Object.fromEntries(ag.data.map((a) => [a.uuid.toLowerCase(), { name: a.displayName, icon: a.displayIcon, color: a.backgroundGradientColors && a.backgroundGradientColors[0] ? "#" + a.backgroundGradientColors[0].slice(0, 6) : "" }]))
  const maps = Object.fromEntries(mp.data.map((m) => [m.mapUrl, { name: m.displayName, img: m.listViewIcon || m.splash }]))
  const lastTiers = tiers.data[tiers.data.length - 1].tiers
  const ranks = Object.fromEntries(lastTiers.map((t) => [t.tier, { name: t.tierName, icon: t.smallIcon || t.largeIcon }]))
  content = { agents, maps, ranks, version: ver.data.riotClientVersion }
  return content
}
const QUEUES = { competitive: "Competitivo", unrated: "Sem classificação", swiftplay: "Frenético", spikerush: "Disputa da Spike", deathmatch: "Mata-mata", hurm: "Mata-mata em equipe", ggteam: "Escalada", premier: "Premier", newmap: "Novo mapa", onefa: "Replicação", snowball: "Guerra de neve", range: "Campo de treino", "": "Personalizada" }
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
/** procura uma chave em qualquer nível do objeto (o formato da presença muda entre versões) */
const deep = (o, k) => { if (!o || typeof o !== "object") return undefined; if (k in o) return o[k]; for (const v of Object.values(o)) { const r = deep(v, k); if (r !== undefined) return r } return undefined }

let val = { puuid: "", region: "", shard: "", loop: "", matchId: "", agent: null, mapUrl: "", lastMatchId: "", waitingResult: 0, rank: null }
async function vAuth(lf) {
  const s = await riotLocal(lf, "/chat/v1/session")
  const e = await riotLocal(lf, "/entitlements/v1/token")
  if (!val.region) {
    const ext = await riotLocal(lf, "/product-session/v1/external-sessions")
    const v = Object.values(ext).find((x) => x.productId === "valorant")
    const args = (v && v.launchConfiguration && v.launchConfiguration.arguments) || []
    const dep = (args.find((a) => a.startsWith("-ares-deployment=")) || "").split("=")[1] || "na"
    const ep = (args.find((a) => a.startsWith("-config-endpoint=")) || "").match(/shared\.([a-z]+)\./)
    val.region = dep; val.shard = ep ? ep[1] : ["latam", "br"].includes(dep) ? "na" : dep
  }
  val.puuid = s.puuid
  const c = await vContent()
  return { H: { Authorization: "Bearer " + e.accessToken, "X-Riot-Entitlements-JWT": e.token, "X-Riot-ClientVersion": c.version, "X-Riot-ClientPlatform": PLATFORM }, c, lf }
}
const glz = () => `https://glz-${val.region}-1.${val.shard}.a.pvp.net`
const pd = () => `https://pd.${val.shard}.a.pvp.net`

async function vLastMatch(A, onlyNew) {
  const hist = await getJSON(`${pd()}/match-history/v1/history/${val.puuid}?startIndex=0&endIndex=1`, A.H)
  const id = hist.History && hist.History[0] && hist.History[0].MatchID
  if (!id || (onlyNew && id === val.lastMatchId)) return null
  val.lastMatchId = id
  const m = await getJSON(`${pd()}/match-details/v1/matches/${id}`, A.H)
  const me = m.players.find((p) => p.subject === val.puuid)
  if (!me) return null
  const myTeam = (m.teams || []).find((t) => t.teamId === me.teamId)
  const other = (m.teams || []).find((t) => t.teamId !== me.teamId)
  const ag = A.c.agents[String(me.characterId).toLowerCase()] || {}
  const mp = A.c.maps[m.matchInfo.mapId] || {}
  const rounds = (m.roundResults || []).length || 1
  let hs = 0, shots = 0
  for (const r of m.roundResults || []) for (const ps of r.playerStats || []) if (ps.subject === val.puuid) for (const d of ps.damage || []) { hs += d.headshots || 0; shots += (d.headshots || 0) + (d.bodyshots || 0) + (d.legshots || 0) }
  let rr = null
  try { const mmr = await getJSON(`${pd()}/mmr/v1/players/${val.puuid}`, A.H); const u = mmr.LatestCompetitiveUpdate; if (u && u.MatchID === id) rr = u.RankedRatingEarned; if (u) val.rank = { tier: u.TierAfterUpdate, rr: u.RankedRatingAfterUpdate, ...(A.c.ranks[u.TierAfterUpdate] || {}) } } catch {}
  return {
    id: "val-" + id, game: "valorant", at: m.matchInfo.gameStartMillis + (m.matchInfo.gameLengthMillis || 0), map: mp.name || "", mapImg: mp.img, mode: QUEUES[m.matchInfo.queueID] ?? m.matchInfo.queueID,
    agent: ag.name, agentIcon: ag.icon, k: me.stats.kills, d: me.stats.deaths, a: me.stats.assists, score: me.stats.score, acs: Math.round(me.stats.score / rounds),
    hs: shots ? Math.round((hs / shots) * 100) : null, result: myTeam ? (myTeam.won ? "win" : other && other.won === false && myTeam.roundsWon === other.roundsWon ? "draw" : "loss") : "",
    rounds: myTeam && other ? `${myTeam.roundsWon}-${other.roundsWon}` : "", rr,
  }
}

let vBusy = false
async function pollValorant(first) {
  if (vBusy) return
  vBusy = true
  try {
    const lf = lockfile()
    if (!lf) return
    const A = await vAuth(lf)
    const pres = await riotLocal(lf, "/chat/v4/presences")
    const me = (pres.presences || []).find((p) => p.puuid === val.puuid && p.product === "valorant")
    let pr = {}
    try { pr = me && me.private ? JSON.parse(Buffer.from(me.private, "base64").toString()) : {} } catch {}
    const loop = deep(pr, "sessionLoopState") || ""
    const flow = deep(pr, "provisioningFlow") || ""
    const queue = flow === "ShootingRange" ? "range" : flow === "CustomGame" ? "" : deep(pr, "queueId") || ""
    let mapUrl = deep(pr, "matchMap") || ""
    const ally = deep(pr, "partyOwnerMatchScoreAllyTeam"), enemy = deep(pr, "partyOwnerMatchScoreEnemyTeam")
    const tier = deep(pr, "competitiveTier")
    if (first || !val.rank) {
      try { const mmr = await getJSON(`${pd()}/mmr/v1/players/${val.puuid}`, A.H); const u = mmr.LatestCompetitiveUpdate; if (u) val.rank = { tier: u.TierAfterUpdate, rr: u.RankedRatingAfterUpdate, ...(A.c.ranks[u.TierAfterUpdate] || {}) } } catch {}
    }
    // agente: na seleção (pregame) e dentro da partida (core-game)
    if (loop === "PREGAME" || loop === "INGAME") {
      try {
        const kind = loop === "PREGAME" ? "pregame" : "core-game"
        const pm = await getJSON(`${glz()}/${kind}/v1/players/${val.puuid}`, A.H)
        const mm = await getJSON(`${glz()}/${kind}/v1/matches/${pm.MatchID}`, A.H)
        const players = kind === "pregame" ? ((mm.AllyTeam && mm.AllyTeam.Players) || []) : (mm.Players || [])
        const mine = players.find((p) => p.Subject === val.puuid)
        val.matchId = pm.MatchID
        val.agent = mine && mine.CharacterID ? { ...(A.c.agents[mine.CharacterID.toLowerCase()] || {}), locked: kind === "core-game" || mine.CharacterSelectionState === "locked" } : null
        mapUrl = mm.MapID || mapUrl
      } catch {}
    } else { val.agent = null }
    // saiu da partida: busca o resultado (o servidor demora um pouco para publicar)
    if (val.loop === "INGAME" && loop !== "INGAME") val.waitingResult = 6
    val.loop = loop
    const mp = A.c.maps[mapUrl] || {}
    setLive("valorant", {
      connected: true, state: loop, mode: QUEUES[queue] ?? queue, map: mp.name || "", mapImg: mp.img || "",
      agent: val.agent, ally: loop === "INGAME" ? ally : null, enemy: loop === "INGAME" ? enemy : null,
      rank: val.rank || (tier ? { tier, ...(A.c.ranks[tier] || {}) } : null), last: live.valorant && live.valorant.last,
    })
    if (first || val.waitingResult > 0) {
      const m = await vLastMatch(A, !first)
      if (m) { val.waitingResult = 0; if (!first) emitMatch(m); setLive("valorant", { ...live.valorant, last: m, rank: val.rank || (live.valorant && live.valorant.rank) }) }
      else if (val.waitingResult > 0) val.waitingResult--
    }
  } catch {} finally { vBusy = false }
}

/* =============================================== League of Legends =============================================== */
let lolLast = null
let ddragon = null
async function lolChampIcon(name) {
  try {
    if (!ddragon) {
      const v = (await getJSON("https://ddragon.leagueoflegends.com/api/versions.json"))[0]
      const ch = await getJSON(`https://ddragon.leagueoflegends.com/cdn/${v}/data/pt_BR/champion.json`)
      ddragon = { v, byName: Object.fromEntries(Object.values(ch.data).map((c) => [c.name.toLowerCase(), c.id])) }
    }
    const id = ddragon.byName[String(name).toLowerCase()]
    return id ? `https://ddragon.leagueoflegends.com/cdn/${ddragon.v}/img/champion/${id}.png` : ""
  } catch { return "" }
}
const lolGet = () => new Promise((res, rej) => https.get({ host: "127.0.0.1", port: 2999, path: "/liveclientdata/allgamedata", rejectUnauthorized: false, timeout: 3000 }, (r) => {
  let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => { try { res(JSON.parse(d)) } catch (e) { rej(e) } })
}).on("error", rej))
async function pollLol() {
  try {
    const g = await lolGet()
    const me = (g.allPlayers || []).find((p) => p.riotId === g.activePlayer.riotId || p.summonerName === g.activePlayer.summonerName) || {}
    const s = me.scores || {}
    const icon = await lolChampIcon(me.championName)
    lolLast = { connected: true, champion: me.championName, icon, level: me.level, k: s.kills, d: s.deaths, a: s.assists, cs: s.creepScore, ward: s.wardScore, gold: Math.round((g.activePlayer && g.activePlayer.currentGold) || 0), time: Math.round((g.gameData && g.gameData.gameTime) || 0), mode: g.gameData && g.gameData.gameMode, team: me.team,
      result: ((g.events && g.events.Events) || []).find((e) => e.EventName === "GameEnd")?.Result }
    setLive("lol", lolLast)
  } catch {
    if (lolLast && lolLast.time > 60) {
      emitMatch({ id: "lol-" + Date.now(), game: "lol", at: Date.now(), map: lolLast.mode, mode: lolLast.mode, agent: lolLast.champion, agentIcon: lolLast.icon, k: lolLast.k, d: lolLast.d, a: lolLast.a, cs: lolLast.cs, result: lolLast.result === "Win" ? "win" : lolLast.result === "Lose" ? "loss" : "" })
    }
    lolLast = null
    setLive("lol", { connected: false })
  }
}

/* =============================================== ciclo =============================================== */
let running = new Set()
let timers = {}
function onPlaying(list) {
  const ids = new Set(list.map((g) => g.id))
  for (const g of list) if (g.id === "cs2" && g.path) {
    if (installCs2Cfg(cs2CfgFromExe(g.path))) cs2Installed = true
    // o CS2 só lê o arquivo de integração ao abrir: se ele já estava aberto antes, precisa reabrir uma vez
    cs2NeedsRestart = !gotGsi && cfgInstalledAt > g.start
  }
  const start = (id, fn, ms) => { if (!timers[id]) { fn(true); timers[id] = setInterval(() => fn(false), ms) } }
  const stop = (id) => { if (timers[id]) { clearInterval(timers[id]); delete timers[id] } }
  if (ids.has("valorant")) start("valorant", pollValorant, 8000); else if (running.has("valorant")) { stop("valorant"); setLive("valorant", null) }
  if (ids.has("lol")) start("lol", pollLol, 4000); else if (running.has("lol")) { stop("lol"); pollLol(); setLive("lol", null) }
  if (!ids.has("cs2") && running.has("cs2")) setLive("cs2", null)
  else if (ids.has("cs2") && !live.cs2) setLive("cs2", { connected: false, needsRestart: cs2NeedsRestart })
  running = ids
}

function register(ipcMain, mainGetter) {
  getMain = mainGetter
  ipcMain.handle("gamestats:get", () => live)
  ipcMain.handle("gamestats:cs2status", () => ({ installed: findCs2CfgDirs().some((d) => fs.existsSync(path.join(d, "gamestate_integration_agenda.cfg"))), needsRestart: cs2NeedsRestart }))
  if (process.env.AGENDA_SHOT) return
  app.whenReady().then(() => {
    startGsiServer()
    // deixa o CS2 pronto mesmo antes de abrir o jogo
    for (const d of findCs2CfgDirs()) if (installCs2Cfg(d)) cs2Installed = true
  })
}

module.exports = { register, onPlaying, _test: { onGsi, gsiToken, cfgText, findCs2CfgDirs, pollValorant, live } }
