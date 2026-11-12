// Widget "Time": logo, cores, último resultado e próximo jogo de UM time, em qualquer jogo/esporte.
// Cada jogo é um "provedor" (ESPN, vlr.gg ou uma wiki da Liquipedia). Para pôr um jogo novo, basta
// uma linha em GAMES (a Liquipedia tem LoL, Dota 2, R6, Rocket League, Overwatch… com o mesmo formato).
const { app, net } = require("electron")
const fs = require("fs")
const path = require("path")
const S = require("./sports.cjs")

const GAMES = {
  football: { kind: "espn" },
  valorant: { kind: "vlr" },
  cs2: { kind: "lp", wiki: "counterstrike" },
  lol: { kind: "lp", wiki: "leagueoflegends" },
  dota2: { kind: "lp", wiki: "dota2" },
  r6: { kind: "lp", wiki: "rainbowsix" },
  rl: { kind: "lp", wiki: "rocketleague" },
  ow: { kind: "lp", wiki: "overwatch" },
}

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "")

/* ------------------------------ cache em disco (abre o app já com os dados) ------------------------------ */
const FILE = path.join(app.getPath("userData"), "team-cache.json")
let disk = {}
try { disk = JSON.parse(fs.readFileSync(FILE, "utf8")) } catch {}
let saveT = null
function save() {
  clearTimeout(saveT)
  saveT = setTimeout(() => {
    // guarda só os 40 mais recentes
    const keep = Object.entries(disk).sort((a, b) => b[1].at - a[1].at).slice(0, 40)
    disk = Object.fromEntries(keep)
    fs.promises.writeFile(FILE, JSON.stringify(disk)).catch(() => {})
  }, 1500)
}

/* ------------------------------ logo em data URL (para tirar as cores no widget) ------------------------------ */
const logoMem = new Map()
async function logoData(url) {
  if (!url || url.startsWith("data:")) return url || ""
  if (logoMem.has(url)) return logoMem.get(url)
  try {
    const r = await net.fetch(url, { headers: { "User-Agent": /liquipedia/.test(url) ? S.UA_APP : S.UA_WEB } })
    if (!r.ok) return ""
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > 2_000_000) return ""
    const type = (r.headers.get("content-type") || "image/png").split(";")[0]
    const d = `data:${type};base64,${buf.toString("base64")}`
    logoMem.set(url, d)
    return d
  } catch { return "" }
}

/** jogo do ponto de vista do time: "us" é sempre o time escolhido */
function view(m, usFirst) {
  const us = usFirst ? m.a : m.b, opp = usFirst ? m.b : m.a
  const n = (v) => (v == null || v === "" ? NaN : Number(v))
  let result
  if (m.state === "done") {
    const a = n(us.score), b = n(opp.score)
    result = us.win ? "W" : opp.win ? "L" : !isNaN(a) && !isNaN(b) ? (a > b ? "W" : a < b ? "L" : "D") : undefined
  }
  return {
    id: m.id, start: m.start, state: m.state, result,
    us: { score: us.score, win: !!us.win },
    opp: { name: opp.name, short: opp.short, logo: opp.logo || "", flag: opp.flag, score: opp.score, win: !!opp.win },
    home: m.home,
    league: m.league, detail: m.detail || "", event: m.event || "", eventLogo: m.eventLogo || "", link: m.link || "",
  }
}

function assemble(team, matches) {
  const live = matches.filter((m) => m.state === "live").sort((a, b) => b.start - a.start)[0]
  const done = matches.filter((m) => m.state === "done").sort((a, b) => b.start - a.start)
  const next = matches.filter((m) => m.state === "upcoming").sort((a, b) => a.start - b.start)[0]
  return { team, live, last: done[0], next, form: done.slice(0, 5).map((m) => m.result || "?"), recent: done.slice(0, 5) }
}

/* ------------------------------ Futebol: ESPN (todas as competições do time) ------------------------------ */
const espn = {
  async search(q, opts = {}) {
    // a lista vem dos campeonatos (a ESPN não tem busca aberta por nome); filtra pelo texto
    const leagues = Array.isArray(opts.leagues) && opts.leagues.length ? opts.leagues
      : ["bra.1", "bra.2", "conmebol.libertadores", "eng.1", "esp.1", "ita.1", "ger.1", "fra.1", "por.1", "arg.1", "uefa.champions", "usa.1", "ned.1"]
    const all = (await Promise.all(leagues.map((l) => S.cached(`fbteams-${l}`, 12 * 3600_000, async () => {
      const j = JSON.parse(await S.getText(`${S.ESPN}/${encodeURIComponent(l)}/teams`))
      const list = (((j.sports || [])[0] || {}).leagues || [])[0]
      return ((list && list.teams) || []).map(({ team: t }) => ({
        id: String(t.id), name: t.shortDisplayName || t.displayName, short: t.abbreviation || "",
        logo: (t.logos && t.logos[0] && t.logos[0].href) || "", league: l,
      }))
    }).catch(() => [])))).flat()
    const seen = new Set(), nq = norm(q)
    return all.filter((t) => (seen.has(t.id) ? false : seen.add(t.id)) && (!nq || norm(t.name).includes(nq) || norm(t.short) === nq))
  },
  async card(t) {
    const id = encodeURIComponent(t.id)
    const [info, past, fix] = await Promise.all([
      S.getText(`${S.ESPN}/all/teams/${id}`).then(JSON.parse).catch(() => ({})),
      S.getText(`${S.ESPN}/all/teams/${id}/schedule`).then(JSON.parse).catch(() => ({ events: [] })),
      S.getText(`${S.ESPN}/all/teams/${id}/schedule?fixture=true`).then(JSON.parse).catch(() => ({ events: [] })),
    ])
    const raw = [...(past.events || []), ...(fix.events || [])]
    const parsed = S.parseEspn({ events: raw }, "")
    const it = info.team || {}
    const logos = it.logos || []
    const team = {
      id: String(t.id), name: it.shortDisplayName || it.displayName || t.name, full: it.displayName || t.name, short: it.abbreviation || t.short || "",
      logo: (logos.find((l) => (l.rel || []).includes("default")) || logos[0] || {}).href || t.logo || "",
      logoDark: (logos.find((l) => (l.rel || []).includes("dark")) || {}).href || "",
      colors: [it.color, it.alternateColor].filter((c) => /^[0-9a-f]{6}$/i.test(c || "")).map((c) => "#" + c),
      link: (it.links && it.links[0] && it.links[0].href) || "",
    }
    const seen = new Set()
    const matches = parsed.map((m, i) => {
      const e = raw[i]
      const lg = (e && e.league) || {}
      m.event = lg.shortName || lg.name || lg.abbreviation || ""
      m.league = lg.slug || m.league
      m.home = String(m.a.id) === team.id
      return view(m, String(m.a.id) === team.id)
    }).filter((m) => (seen.has(m.id) ? false : seen.add(m.id)))
    return assemble(team, matches)
  },
}

/* ------------------------------ Valorant: vlr.gg ------------------------------ */
const vlr = {
  async search(q) {
    if (!q || q.trim().length < 2) {
      // sem busca: times conhecidos (com logo, a partir das partidas)
      const list = await S.cached("val-seed", 3600_000, async () => {
        const out = []
        for (const n of ["LOUD", "FURIA", "MIBR", "Sentinels", "FNATIC", "Paper Rex", "Team Heretics", "G2 Esports", "Team Liquid", "NRG"]) {
          try { out.push(...(await vlr.search(n)).slice(0, 1)) } catch {}
        }
        return out
      })
      return list
    }
    return S.cached(`val-s-${norm(q)}`, 3600_000, async () => {
      const html = await S.getText(`${S.VLR}/search/?q=${encodeURIComponent(q.trim())}&type=teams`)
      return [...html.matchAll(/href="\/search\/r\/team\/(\d+)\/idx"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => {
        const img = (m[2].match(/<img src="([^"]+)"/) || [])[1] || ""
        const title = (m[2].match(/search-item-title">([\s\S]*?)<\/div>/) || [])[1] || ""
        return {
          id: m[1], name: S.decode(title.split("<span")[0]), short: "",
          logo: img && !/\/img\/vlr\/tmp/.test(img) ? (img.startsWith("//") ? "https:" + img : S.VLR + img) : "",
          inactive: /inactive/i.test(title),
        }
      }).filter((t) => t.name)
        .sort((a, b) => Number(a.inactive) - Number(b.inactive))
    })
  },
  parse(html, group) {
    const out = []
    const img = (s) => (s ? (s.startsWith("//") ? "https:" + s : s.startsWith("/") ? S.VLR + s : s) : "")
    for (const m of html.matchAll(/<a href="(\/\d+\/[^"]+)" class="wf-card fc-flex m-item">([\s\S]*?)<\/a>/g)) {
      const b = m[2]
      const names = [...b.matchAll(/m-item-team-name">([\s\S]*?)<\/span>/g)].map((x) => S.decode(x[1]))
      const tags = [...b.matchAll(/m-item-team-tag">([\s\S]*?)<\/span>/g)].map((x) => S.decode(x[1]))
      const logos = [...b.matchAll(/m-item-logo[^"]*">\s*<img src="([^"]+)"/g)].map((x) => img(x[1]))
      const res = b.match(/m-item-result ([^"]*)"[^>]*>([\s\S]*?)<i class="fa/) || []
      const scores = [...(res[2] || "").matchAll(/<span>(\d+)<\/span>/g)].map((x) => x[1])
      const eta = S.decode((res[2] || "").match(/score-eta[^>]*>([^<]*)/)?.[1] || "")
      const ev = b.match(/m-item-event[^>]*>\s*<div[^>]*>([\s\S]*?)<\/div>([\s\S]*?)<\/div>/) || []
      const thumb = (b.match(/m-item-thumb">\s*<img src="([^"]+)"/) || [])[1]
      const dt = b.match(/m-item-date">\s*<div>\s*([\d/]+)\s*<\/div>\s*([^<]*)/)
      let start = dt ? Date.parse(`${dt[1]} ${dt[2].trim()}`) || 0 : 0
      const live = /live/i.test(eta) || /mod-live/.test(res[1] || "")
      const state = live ? "live" : group === "completed" || /mod-(win|loss)/.test(res[1] || "") ? "done" : "upcoming"
      // o vlr mostra o horário no fuso detectado; confere com o "falta X" para não errar por fuso
      const etaMs = (() => { let ms = 0; for (const [, n, u] of eta.matchAll(/(\d+)\s*([wdhm])/g)) ms += Number(n) * { w: 604800000, d: 86400000, h: 3600000, m: 60000 }[u]; return ms })()
      if (state === "upcoming" && etaMs) {
        const approx = Date.now() + etaMs
        if (!start || Math.abs(start - approx) > 2 * 3600000) start = approx
      }
      if (names.length < 2) continue
      const win = /mod-win/.test(res[1] || ""), loss = /mod-loss/.test(res[1] || "")
      out.push({
        id: "val-" + m[1].split("/")[1], start, state,
        a: { name: names[0], short: tags[0] || names[0], logo: logos[0], score: scores[0], win },
        b: { name: names[1], short: tags[1] || names[1], logo: logos[1], score: scores[1], win: loss },
        detail: S.decode(String(ev[2] || "").replace(/&sdot;/g, "·")),
        event: S.decode(ev[1] || ""),
        eventLogo: img(thumb),
        link: S.VLR + m[1],
      })
    }
    return out
  },
  async card(t) {
    const id = encodeURIComponent(t.id)
    const [up, done] = await Promise.all([
      S.getText(`${S.VLR}/team/matches/${id}/?group=upcoming`),
      S.getText(`${S.VLR}/team/matches/${id}/?group=completed`),
    ])
    const head = done || up
    const logo = (head.match(/team-header-logo">[\s\S]*?<img src="([^"]+)"/) || [])[1] || ""
    const team = {
      id: String(t.id),
      name: S.decode((head.match(/<h1 class="wf-title"[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || t.name),
      short: S.decode((head.match(/team-header-tag">([\s\S]*?)<\/h2>/) || [])[1] || ""),
      logo: logo ? (logo.startsWith("//") ? "https:" + logo : logo.startsWith("/") ? S.VLR + logo : logo) : t.logo || "",
      colors: [],
      link: `${S.VLR}/team/${id}`,
    }
    const seen = new Set()
    const matches = [...vlr.parse(up, "upcoming"), ...vlr.parse(done, "completed")]
      .filter((m) => (seen.has(m.id) ? false : seen.add(m.id)))
      .map((m) => view(m, true))
    return assemble(team, matches)
  },
}

/* ------------------------------ Liquipedia (CS2, LoL, Dota 2, R6, RL, OW…) ------------------------------ */
const orig = (u) => S.abs(u).replace(/\/thumb(\/.+?)\/\d+px-[^/]+$/, "$1")
const lp = {
  /** formato "vertical" dos próximos jogos na página do time */
  vertical(html, link) {
    const out = []
    for (const b of html.split('<div class="match-info match-info--vertical">').slice(1)) {
      const ts = Number((b.match(/data-timestamp="(\d+)"/) || [])[1] || 0) * 1000
      const tour = b.match(/match-info-tournament-name">[\s\S]*?<a [^>]*>([\s\S]*?)<\/a>/)
      const stage = b.match(/match-info-stage">([\s\S]*?)<\/span>/)
      const tl = (b.match(/league-icon-small-image[^"]*">[\s\S]*?<img[^>]+src="([^"]+)"/) || [])[1]
      const rows = b.split('<div class="match-info-opponent-row').slice(1, 3).map((r) => {
        const t = S.lpTeam(r)
        const sc = r.match(/match-info-opponent-score([^"]*)">\s*([^<]*)</)
        return { ...t, score: sc ? sc[2].trim() || undefined : undefined, win: !!(sc && /winner/.test(sc[1])) }
      })
      // começou há muito tempo e ainda sem placar: a página só não atualizou
      if (rows.length < 2 || !ts || (ts < Date.now() - 5 * 3600_000 && !rows.some((r) => r.score))) continue
      const scored = rows.some((r) => r.score && r.score !== "0")
      const state = /data-finished="finished"/.test(b) ? "done" : ts <= Date.now() || scored ? "live" : "upcoming"
      out.push({
        id: `lpv-${ts}-${norm(rows[0].name)}-${norm(rows[1].name)}`, start: ts, state, a: rows[0], b: rows[1],
        detail: stage ? S.decode(stage[1]) : "", event: tour ? S.decode(tour[1]) : "", eventLogo: S.abs(tl), link,
      })
    }
    return out
  },
  async search(q, opts, g) {
    if (!q || q.trim().length < 2) return []
    return S.cached(`lp-s-${g.wiki}-${norm(q)}`, 6 * 3600_000, async () => {
      const j = JSON.parse(await S.lpGet(`${S.LP}/${g.wiki}/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(q.trim() + " incategory:Teams")}&srlimit=12&srprop=`))
      return ((j.query && j.query.search) || []).map((r) => ({ id: r.title, name: r.title, short: "" }))
    })
  },
  async card(t, g) {
    const j = JSON.parse(await S.lpGet(`${S.LP}/${g.wiki}/api.php?action=parse&page=${encodeURIComponent(t.id)}&redirects=1&format=json&prop=text`))
    if (!j.parse) throw new Error("time não encontrado na Liquipedia")
    const html = j.parse.text["*"]
    const title = j.parse.title
    // logo do quadro de informações: versão para fundo escuro, ou a única que tiver
    const boxes = [...html.matchAll(/<div class="infobox-image( [^"]*)?">[\s\S]*?<img[^>]+src="([^"]+)"/g)]
    const box = boxes.find((m) => /darkmode/.test(m[1] || "")) || boxes.find((m) => !/lightmode/.test(m[1] || "")) || boxes[0]
    // símbolo quadrado do time (o do quadro às vezes é o logo com o nome escrito, largo demais)
    const esc = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const icons = [...html.matchAll(new RegExp(`<span class="team-template-image-icon([^"]*)">\\s*<a [^>]*title="${esc}"[^>]*>\\s*<img[^>]+src="([^"]+)"`, "g"))]
    const icon = icons.find((m) => /darkmode/.test(m[1])) || icons.find((m) => !/lightmode/.test(m[1])) || icons[0]
    const team = {
      id: title, name: title, short: "",
      logo: icon ? orig(icon[2]) : box ? orig(box[2]) : t.logo || "",
      banner: box ? orig(box[2]) : "",
      colors: [], link: `${S.LP}/${g.wiki}/${encodeURIComponent(title.replace(/ /g, "_"))}`,
    }
    const isUs = (x) => {
      const n = norm(x.name), s = norm(x.short)
      return n === norm(title) || s === norm(title) || norm(title).startsWith(n) && n.length >= 3
    }
    const matches = []
    // próximos (e ao vivo): blocos "match-info" da seção Upcoming Matches
    const upAt = html.indexOf('id="Upcoming_Matches"')
    if (upAt >= 0) {
      const end = html.indexOf("<h2", upAt + 30)
      const sec = html.slice(upAt, end > 0 ? end : undefined)
      for (const m of [...S.parseLpBlocks(sec, "upcoming", team.link), ...lp.vertical(sec, team.link)]) {
        if (!team.short && isUs(m.a)) team.short = m.a.short
        matches.push(view(m, isUs(m.a) || !isUs(m.b)))
      }
    }
    // resultados: linhas da tabela "Recent Matches" (têm o rótulo vitória/derrota e o horário)
    for (const row of html.split(/<tr class="table2[^"]*row--body">/).slice(1)) {
      const lab = row.match(/data-label-type="result-(win|loss|draw)"/)
      const ts = Number((row.match(/data-timestamp="(\d+)"/) || [])[1] || 0) * 1000
      if (!lab || !ts) continue
      const row2 = row.split("</tr>")[0]
      const sc = row2.match(/<span[^>]*>(\d+)<\/span>&#160;&#58;&#160;<span[^>]*>(\d+)<\/span>/) || row2.match(/>(\d+)&#160;&#58;&#160;(\d+)</)
      const tourA = [...row2.matchAll(/<td data-nowrap="">\s*<a href="[^"]*" title="([^"]*)">([\s\S]*?)<\/a>/g)].pop()
      const opp = S.lpTeam((row2.match(/<div class="block-team[\s\S]*?<\/div>/) || [""])[0])
      const tl = (row2.match(/league-icon-small-image[^"]*">[\s\S]*?<img[^>]+src="([^"]+)"/) || [])[1]
      const res = { win: "W", loss: "L", draw: "D" }[lab[1]]
      matches.push({
        id: `lp-${ts}-${norm(opp.name)}`, start: ts, state: "done", result: res,
        us: { score: sc ? sc[1] : undefined, win: res === "W" },
        opp: { name: opp.name, short: opp.short, logo: opp.logo, score: sc ? sc[2] : undefined, win: res === "L" },
        detail: "", event: tourA ? S.decode(tourA[2]) : "", eventLogo: S.abs(tl), link: team.link,
      })
    }
    const seen = new Set()
    return assemble(team, matches.filter((m) => (seen.has(m.id) ? false : seen.add(m.id))))
  },
}

const PROVIDERS = { espn, vlr, lp }

async function search(game, q, opts = {}) {
  const g = GAMES[game]
  if (!g) throw new Error("jogo desconhecido")
  if (game === "cs2" && (!q || q.trim().length < 2)) {
    // lista inicial do CS2: times conhecidos/que estão jogando (com logo), do widget de CS2
    const list = await teamsCs2()
    return list.map((t) => ({ id: t.name, name: t.name, short: t.short, logo: t.logo }))
  }
  return PROVIDERS[g.kind].search(q, opts, g)
}
let teamsCs2 = async () => []

/** cartão do time. peek: só o que já está guardado (para abrir instantâneo) */
async function card(game, t, opts = {}) {
  const g = GAMES[game]
  if (!g || !t || !t.id) throw new Error("time não escolhido")
  const key = `${game}:${t.id}`
  const old = disk[key]
  if (opts.peek) return old ? { ...old.data, at: old.at, stale: true } : null
  // atualiza mais rápido perto do jogo / ao vivo
  const soon = old && old.data && (old.data.live || (old.data.next && old.data.next.start - Date.now() < 20 * 60_000))
  const ttl = soon ? 50_000 : g.kind === "lp" ? 20 * 60_000 : 8 * 60_000
  try {
    const data = await S.cached(`card-${key}`, ttl, async () => {
      const d = await PROVIDERS[g.kind].card(t, g)
      d.team.logoData = await logoData(d.team.logo)
      // a Liquipedia não deixa carregar as imagens direto na página: passam por aqui (são pequenas)
      if (g.kind === "lp") {
        for (const m of [d.live, d.last, d.next, ...d.recent].filter(Boolean)) {
          if (m.opp.logo) m.opp.logo = (await logoData(m.opp.logo)) || m.opp.logo
          if (m.eventLogo) m.eventLogo = (await logoData(m.eventLogo)) || m.eventLogo
        }
      }
      if (!d.team.logoData && old && old.data.team.logo === d.team.logo) d.team.logoData = old.data.team.logoData
      return d
    })
    disk[key] = { at: Date.now(), data }
    save()
    return { ...data, at: Date.now() }
  } catch (e) {
    if (old) return { ...old.data, at: old.at, stale: true, error: String(e && e.message || e) }
    throw e
  }
}

function register(ipcMain, sportsTeams) {
  if (sportsTeams) teamsCs2 = () => sportsTeams("cs2").catch(() => [])
  ipcMain.handle("team:search", (_e, game, q, opts) => search(game, q, opts))
  ipcMain.handle("team:card", (_e, game, t, opts) => card(game, t, opts))
}

module.exports = { register, GAMES, vlr, lp, espn }
