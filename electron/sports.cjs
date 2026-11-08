// Esportes: partidas de CS2 (Liquipedia), Valorant (vlr.gg) e futebol (ESPN), já normalizadas.
// Tudo passa por um cache para não sobrecarregar os sites (a API da Liquipedia pede no máx. 1 consulta a cada 30 s).
const { net } = require("electron")

const UA_APP = "AgendaDesktop/0.1 (personal desktop widget)"
const UA_WEB = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"

const cache = new Map() // chave -> { at, data, pending }
async function cached(key, ttl, fn) {
  const c = cache.get(key)
  if (c && c.data && Date.now() - c.at < ttl) return c.data
  if (c && c.pending) return c.pending
  const pending = fn().then((data) => { cache.set(key, { at: Date.now(), data }); return data })
    .catch((e) => { const old = cache.get(key); cache.set(key, { at: old ? old.at : 0, data: old && old.data }); if (old && old.data) return old.data; throw e })
  cache.set(key, { ...(c || {}), pending })
  return pending
}

async function getText(url, ua = UA_WEB) {
  const r = await net.fetch(url, { headers: { "User-Agent": ua, "Accept-Language": "en-US,en;q=0.8" } })
  if (!r.ok) throw new Error(`${new URL(url).hostname} respondeu ${r.status}`)
  return r.text()
}

const decode = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&#39;|&#039;/g, "'").replace(/&quot;/g, '"').replace(/&ndash;/g, "–").replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()

/* ------------------------------ CS2: Liquipedia ------------------------------ */
const LP = "https://liquipedia.net"
const abs = (u) => (u ? (u.startsWith("//") ? "https:" + u : u.startsWith("/") ? LP + u : u) : "")

function lpTeam(html) {
  // imagens: prefere a versão para fundo escuro / "allmode"
  const imgs = [...html.matchAll(/<span class="team-template-image-icon([^"]*)">[\s\S]*?<img[^>]+src="([^"]+)"/g)]
  const dark = imgs.find((m) => /darkmode/.test(m[1])) || imgs.find((m) => !/lightmode/.test(m[1])) || imgs[0]
  const nameTag = html.match(/<span class="name"[^>]*>([\s\S]*?)<\/span>/)
  const title = nameTag && nameTag[1].match(/title="([^"]+)"/)
  const short = nameTag ? decode(nameTag[1]) : ""
  return { name: decode(title ? title[1] : short) || "A definir", short: short || "TBD", logo: dark ? abs(dark[2]) : "" }
}

function parseLiquipedia(html) {
  const out = []
  // a página tem a seção "upcoming" (inclui ao vivo) e "recent" (resultados)
  const parts = html.split(/data-filter-expansion-template="[^"]*type=(upcoming|recent)/)
  for (let p = 1; p < parts.length; p += 2) {
    const section = parts[p]
    const blocks = parts[p + 1].split('<div class="match-info">').slice(1)
    for (const b of blocks) {
      const ts = Number((b.match(/data-timestamp="(\d+)"/) || [])[1] || 0) * 1000
      // cabeçalho: [time da esquerda + placar] [time da direita] (as classes mudam: -left, -winner, -loser)
      const header = b.split('<div class="match-info-tournament"')[0]
      const segs = header.split(/<div class="match-info-header-opponent[^"]*">/)
      const aHtml = (segs[1] || "").split("match-info-header-scoreholder")[0]
      const bHtml = segs[2] || ""
      const scores = [...(segs[1] || "").matchAll(/scoreholder-score( [^"]*)?">([^<]*)</g)].map((m) => ({ v: m[2].trim(), win: /winner/.test(m[1] || "") }))
      const bo = (b.match(/\(Bo(\d)\)/) || [])[1]
      const tour = b.match(/match-info-tournament-name"><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
      const tourLogo = (b.match(/league-icon-small-image">[\s\S]*?<img[^>]+src="([^"]+)"/) || [])[1]
      const a = lpTeam(aHtml || ""), bb = lpTeam(bHtml)
      let state = section === "recent" || /data-finished="finished"/.test(b) ? "done" : ts && ts <= Date.now() ? "live" : "upcoming"
      if (section === "upcoming" && scores.length === 2 && scores.some((s) => s.v && s.v !== "0")) state = "live"
      out.push({
        id: `cs-${ts}-${a.short}-${bb.short}`,
        start: ts,
        state,
        a: { ...a, score: scores[0] ? scores[0].v : undefined, win: scores[0] && scores[0].win },
        b: { ...bb, score: scores[1] ? scores[1].v : undefined, win: scores[1] && scores[1].win },
        detail: bo ? `MD${bo}` : "",
        event: tour ? decode(tour[2]) : "",
        eventLogo: abs(tourLogo),
        link: "https://www.hltv.org/matches",
      })
    }
  }
  // tira repetidos (a página às vezes lista o mesmo jogo em dois blocos)
  const seen = new Set()
  return out.filter((m) => (seen.has(m.id) ? false : seen.add(m.id)))
}

async function cs2() {
  return cached("cs2", 60_000, async () => {
    const txt = await getText(`${LP}/counterstrike/api.php?action=parse&page=Liquipedia:Matches&format=json&prop=text`, UA_APP)
    const html = JSON.parse(txt).parse.text["*"]
    return parseLiquipedia(html)
  })
}

/* ------------------------------ Valorant: vlr.gg ------------------------------ */
const VLR = "https://www.vlr.gg"
const etaMs = (s) => {
  let ms = 0
  for (const [, n, u] of String(s).matchAll(/(\d+)\s*([dhm])/g)) ms += Number(n) * { d: 86400000, h: 3600000, m: 60000 }[u]
  return ms
}
function parseVlr(html, kind) {
  const out = []
  // separa por dia para saber a data de cada jogo
  const days = html.split(/<div class="wf-label mod-large">/).slice(1)
  for (const day of days) {
    const dateTxt = decode(day.split("</div>")[0]).replace(/Today|Yesterday/g, "").trim()
    for (const m of day.matchAll(/<a href="(\/\d+\/[^"]+)" class="wf-module-item match-item[^"]*">([\s\S]*?)<\/a>/g)) {
      const body = m[2]
      const teams = [...body.matchAll(/match-item-vs-team( mod-winner)?\s*">[\s\S]*?<span class="flag mod-(\w+)"><\/span>([\s\S]*?)<\/div>[\s\S]*?match-item-vs-team-score[^>]*>([\s\S]*?)<\/div>/g)]
        .map((t) => ({ win: !!t[1], flag: t[2], name: decode(t[3]), score: decode(t[4]) }))
      if (teams.length < 2) continue
      const status = decode((body.match(/ml-status">([^<]*)/) || [])[1] || "")
      const eta = decode((body.match(/ml-eta[^>]*>([^<]*)/) || [])[1] || "")
      const time = decode((body.match(/match-item-time">([\s\S]*?)<\/div>/) || [])[1] || "")
      const series = decode((body.match(/match-item-event-series[^>]*>([\s\S]*?)<\/div>/) || [])[1] || "")
      const event = decode(((body.match(/match-item-event text-of">([\s\S]*?)<\/div>\s*<\/div>|match-item-event text-of">([\s\S]*)$/) || [])[0] || "").replace(/match-item-event text-of">/, "")).replace(series, "").trim()
      const icon = (body.match(/match-item-icon">[\s\S]*?<img src="([^"]+)"/) || [])[1]
      const state = /live/i.test(status) ? "live" : kind === "results" || /completed/i.test(status) ? "done" : "upcoming"
      // horário: "agora ± eta" é exato o bastante; senão usa data + hora mostradas
      // horário: data do grupo + hora mostrada; confere com o "falta/há X" do site (corrige fuso diferente)
      const shown = dateTxt ? Date.parse(`${dateTxt.replace(/^\w+,\s*/, "")} ${time}`) : NaN
      const approx = state === "upcoming" && eta ? Date.now() + etaMs(eta) : state === "done" && eta ? Date.now() - etaMs(eta) : state === "live" ? Date.now() : NaN
      let start = !isNaN(shown) && (isNaN(approx) || Math.abs(shown - approx) < 2 * 3600000) ? shown : !isNaN(approx) ? approx : shown || 0
      if (state === "live" && !isNaN(shown) && shown < Date.now()) start = shown
      const tbd = (n) => !n || /^tbd$/i.test(n)
      out.push({
        id: "val-" + m[1].split("/")[1],
        start,
        state,
        a: { name: tbd(teams[0].name) ? "A definir" : teams[0].name, short: teams[0].name, flag: teams[0].flag, score: teams[0].score.replace(/[^\d]/g, "") || undefined, win: teams[0].win },
        b: { name: tbd(teams[1].name) ? "A definir" : teams[1].name, short: teams[1].name, flag: teams[1].flag, score: teams[1].score.replace(/[^\d]/g, "") || undefined, win: teams[1].win },
        detail: series,
        event,
        eventLogo: icon ? (icon.startsWith("//") ? "https:" + icon : icon) : "",
        link: VLR + m[1],
      })
    }
  }
  return out
}
async function valorant() {
  return cached("val", 45_000, async () => {
    const [up, res] = await Promise.all([getText(`${VLR}/matches`), getText(`${VLR}/matches/results`)])
    return [...parseVlr(up, "upcoming"), ...parseVlr(res, "results")]
  })
}

/* ------------------------------ Futebol: ESPN ------------------------------ */
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer"
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
function parseEspn(j, league) {
  const lname = (j.leagues && j.leagues[0] && (j.leagues[0].abbreviation || j.leagues[0].name)) || league
  const llogo = (j.leagues && j.leagues[0] && j.leagues[0].logos && j.leagues[0].logos[0] && j.leagues[0].logos[0].href) || ""
  return (j.events || []).map((e) => {
    const c = e.competitions[0]
    // a agenda do time (teams/:id/schedule) traz o status dentro da competição e os escudos em "logos"
    const status = e.status || c.status || { type: { state: "pre" } }
    const st = status.type
    const home = c.competitors.find((t) => t.homeAway === "home") || c.competitors[0]
    const away = c.competitors.find((t) => t.homeAway === "away") || c.competitors[1]
    const team = (t) => ({
      id: t.team.id ? String(t.team.id) : undefined,
      name: t.team.shortDisplayName || t.team.displayName,
      short: t.team.abbreviation || t.team.shortDisplayName,
      logo: t.team.logo || (t.team.logos && t.team.logos[0] && t.team.logos[0].href) || "",
      score: st.state === "pre" ? undefined : t.score && typeof t.score === "object" ? t.score.displayValue : t.score,
      win: !!t.winner,
    })
    const state = st.state === "in" ? "live" : st.state === "post" ? "done" : "upcoming"
    let detail = ""
    if (state === "live") detail = /half/i.test(st.name || "") || /HT/.test(st.shortDetail || "") ? "Intervalo" : status.displayClock || st.shortDetail
    else if (state === "done") detail = /pen/i.test(st.shortDetail || "") ? "Pênaltis" : "Encerrado"
    if (/postpon|cancel|suspend/i.test(st.name || "")) detail = "Adiado"
    return {
      id: "fb-" + e.id,
      start: Date.parse(e.date),
      state,
      a: team(home),
      b: team(away),
      detail,
      event: lname,
      eventLogo: llogo,
      league: (e.league && e.league.slug) || league,
      link: (e.links && e.links[0] && e.links[0].href) || `https://www.espn.com.br/futebol/partida/_/jogoId/${e.id}`,
    }
  })
}
async function footballLeague(league, date) {
  const today = ymd(new Date())
  const key = `fb-${league}-${date}`
  const ttl = date === today ? 30_000 : date < today ? 30 * 60_000 : 15 * 60_000
  return cached(key, ttl, async () => {
    const q = date === today ? "" : `?dates=${date}`
    const j = JSON.parse(await getText(`${ESPN}/${encodeURIComponent(league)}/scoreboard${q}`))
    return parseEspn(j, league)
  })
}
async function football(leagues = ["bra.1"], days = 6) {
  const dates = []
  for (let i = -1; i <= days; i++) { const d = new Date(); d.setDate(d.getDate() + i); dates.push(ymd(d)) }
  const all = await Promise.all(leagues.flatMap((l) => dates.map((d) => footballLeague(l, d).catch(() => []))))
  const seen = new Set()
  return all.flat().filter((m) => (seen.has(m.id) ? false : seen.add(m.id))).sort((a, b) => a.start - b.start)
}

/** próximos jogos de um time (qualquer data, não só a semana do placar) */
async function teamSchedule(league, id) {
  return cached(`fbt-${league}-${id}`, 30 * 60_000, async () => {
    const j = JSON.parse(await getText(`${ESPN}/${encodeURIComponent(league)}/teams/${encodeURIComponent(id)}/schedule?fixture=true`))
    return parseEspn({ events: j.events || [] }, league)
  })
}

/** todos os times de um campeonato (para escolher os favoritos) */
async function leagueTeams(league) {
  return cached(`fbteams-${league}`, 12 * 3600_000, async () => {
    const j = JSON.parse(await getText(`${ESPN}/${encodeURIComponent(league)}/teams`))
    const list = (((j.sports || [])[0] || {}).leagues || [])[0]
    return ((list && list.teams) || []).map(({ team: t }) => ({
      id: String(t.id),
      name: t.shortDisplayName || t.displayName,
      short: t.abbreviation || "",
      logo: (t.logos && t.logos[0] && t.logos[0].href) || "",
      league,
    }))
  })
}

// times conhecidos de CS2 e Valorant (aparecem na lista mesmo sem jogo marcado; os logos vêm das partidas)
const SEED = {
  cs2: ["FURIA", "MIBR", "paiN", "Imperial", "Legacy", "Fluxo", "ODDIK", "RED Canids", "Sharks", "Vitality", "Natus Vincere", "FaZe Clan", "G2 Esports", "Team Spirit", "MOUZ", "Team Falcons", "The MongolZ", "Aurora", "Astralis", "Team Liquid", "3DMAX", "Virtus.pro", "HEROIC", "Complexity", "NRG", "Ninjas in Pyjamas", "Eternal Fire", "BIG", "GamerLegion", "FlyQuest"],
  valorant: [["LOUD", "br"], ["FURIA", "br"], ["MIBR", "br"], ["paiN Gaming", "br"], ["Sentinels", "us"], ["100 Thieves", "us"], ["Cloud9", "us"], ["G2 Esports", "us"], ["NRG", "us"], ["Evil Geniuses", "us"], ["LEVIATÁN", "cl"], ["KRÜ Esports", "cl"], ["2GAME Esports", "br"], ["FNATIC", "eu"], ["Team Heretics", "eu"], ["Team Liquid", "eu"], ["Karmine Corp", "fr"], ["Team Vitality", "eu"], ["Paper Rex", "sg"], ["DRX", "kr"], ["Gen.G", "kr"], ["T1", "kr"], ["EDward Gaming", "cn"], ["Trace Esports", "cn"]],
}

async function teams(sport, opts = {}) {
  if (sport === "football") {
    const leagues = Array.isArray(opts.leagues) && opts.leagues.length ? opts.leagues : ["bra.1"]
    const all = await Promise.all(leagues.map((l) => leagueTeams(l).catch(() => [])))
    const seen = new Set()
    return all.flat().filter((t) => (seen.has(t.id) ? false : seen.add(t.id)))
  }
  const matches = await (sport === "cs2" ? cs2() : valorant()).catch(() => [])
  const map = new Map()
  const key = (n) => String(n || "").toLowerCase().trim()
  for (const s of SEED[sport] || []) {
    const [name, flag] = Array.isArray(s) ? s : [s]
    map.set(key(name), { name, short: name, flag })
  }
  for (const m of matches) for (const t of [m.a, m.b]) {
    if (!t.name || t.name === "A definir") continue
    const old = map.get(key(t.name))
    map.set(key(t.name), { name: t.name, short: t.short || t.name, logo: t.logo || (old && old.logo) || "", flag: t.flag || (old && old.flag) })
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function register(ipcMain) {
  ipcMain.handle("sports:get", async (_e, sport, opts = {}) => {
    if (sport === "cs2") return cs2()
    if (sport === "valorant") return valorant()
    if (sport === "football") {
      const base = await football(Array.isArray(opts.leagues) && opts.leagues.length ? opts.leagues : ["bra.1"])
      // times favoritos com id da ESPN: junta a agenda completa deles (o próximo jogo pode estar a semanas)
      const favs = (Array.isArray(opts.teams) ? opts.teams : []).filter((t) => t && t.id && t.league).slice(0, 12)
      if (!favs.length) return base
      const extra = (await Promise.all(favs.map((t) => teamSchedule(String(t.league), String(t.id)).catch(() => [])))).flat()
      const seen = new Set(base.map((m) => m.id))
      return [...base, ...extra.filter((m) => m.state !== "done" && (seen.has(m.id) ? false : seen.add(m.id)))].sort((a, b) => a.start - b.start)
    }
    throw new Error("esporte desconhecido")
  })
  ipcMain.handle("sports:teams", (_e, sport, opts = {}) => teams(sport, opts))
}

module.exports = { register, parseLiquipedia, parseVlr, parseEspn }
