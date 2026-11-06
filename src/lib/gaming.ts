/**
 * Jogos: o processo principal detecta o jogo aberto; aqui viram sessões (jogo, começo, fim) para o registro.
 * Fechar e abrir de novo em menos de 3 min continua a mesma sessão. Também acompanha o agente do Valorant.
 */
import { useStore } from "./store"
import { bridge, type GamesState, type RunningGame } from "./bridge"
import { uid } from "./utils"

export interface GameInfo { name: string; color?: string; art?: RunningGame["art"] }
export interface GameSession { id: string; game: string; start: number; end: number; open?: boolean }
export interface GamingData { games: Record<string, GameInfo>; sessions: GameSession[] }
export const emptyGaming = (): GamingData => ({ games: {}, sessions: [] })
const G = () => useStore.getState().gaming ?? emptyGaming()
const setG = (fn: (g: GamingData) => GamingData) => useStore.setState((s) => ({ gaming: fn(s.gaming ?? emptyGaming()) }))

const MERGE = 3 * 60000
const MIN = 60000
let started = false
let lastWrite = 0

function apply(st: GamesState) {
  const now = st.at || Date.now()
  useStore.setState({ gamesRunning: st.playing })
  setG((g) => {
    const games = { ...g.games }
    let sessions = g.sessions.map((s) => ({ ...s }))
    const running = new Set(st.playing.map((p) => p.id))
    for (const p of st.playing) {
      games[p.id] = { ...games[p.id], name: p.name, color: p.color || games[p.id]?.color, art: p.art && Object.keys(p.art).length ? p.art : games[p.id]?.art }
      const open = sessions.find((s) => s.open && s.game === p.id)
      if (open) { open.end = now; continue }
      // reabriu logo depois de fechar, ou o Agenda abriu com o jogo já rodando: continua a mesma sessão
      const recent = [...sessions].reverse().find((s) => s.game === p.id && (now - s.end < MERGE || Math.abs(s.start - p.start) < MERGE))
      if (recent) { Object.assign(recent, { open: true, end: now }); continue }
      sessions.push({ id: uid(), game: p.id, start: Math.min(p.start, now), end: now, open: true })
    }
    sessions = sessions
      .map((s) => (s.open && !running.has(s.game) ? { ...s, open: false } : s))
      .filter((s) => s.open || s.end - s.start >= MIN)
    return { games, sessions }
  })
  lastWrite = Date.now()
}

/** na primeira vez que um jogo é reconhecido, coloca o widget "Jogando agora" na área de trabalho */
function autoWidget(st: GamesState) {
  if (!st.playing.length) return
  try { if (localStorage.getItem("gaming-widget-auto")) return; localStorage.setItem("gaming-widget-auto", "1") } catch { return }
  const s = useStore.getState()
  if (s.widgets.some((w) => w.type === "gaming")) return
  s.addWidget("gaming")
  const w = useStore.getState().widgets.at(-1)!
  s.setWidgetGeo(w.id, { x: innerWidth - 400, y: 60, w: 360, h: 210 })
}

export function startGaming() {
  if (started) return
  started = true
  bridge.games.onState((st) => { apply(st); autoWidget(st) })
  bridge.games.get().then(apply).catch(() => {})
  bridge.games.onValorantAgent((a) => useStore.setState({ valAgentNow: a }))
  bridge.games.valorantAgent().then((a) => useStore.setState({ valAgentNow: a })).catch(() => {})
  // enquanto joga, atualiza o fim da sessão a cada minuto (se o PC desligar, o tempo fica certo)
  setInterval(() => {
    if (Date.now() - lastWrite < 55000) return
    if (G().sessions.some((s) => s.open)) bridge.games.get().then(apply).catch(() => {})
  }, 60000)
}

/* ---------------- números ---------------- */
export const sessionEnd = (s: GameSession) => (s.open ? Date.now() : s.end)
export function since(days: number | null) {
  if (days == null) return 0
  const d = new Date(); d.setHours(0, 0, 0, 0)
  return d.getTime() - (days - 1) * 86400000
}
/** tempo de cada jogo a partir de `from` (sessões que começaram antes contam só a parte depois) */
export function perGame(g: GamingData, from: number) {
  const m = new Map<string, { ms: number; sessions: number; last: number }>()
  for (const s of g.sessions) {
    const ms = Math.max(0, sessionEnd(s) - Math.max(s.start, from))
    if (!ms) continue
    const v = m.get(s.game) ?? { ms: 0, sessions: 0, last: 0 }
    v.ms += ms; v.sessions++; v.last = Math.max(v.last, sessionEnd(s))
    m.set(s.game, v)
  }
  return [...m].map(([id, v]) => ({ id, ...v, info: g.games[id] ?? { name: id } })).sort((a, b) => b.ms - a.ms)
}
export const fmtDur = (ms: number) => {
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h${m % 60 ? ` ${m % 60}` : ""}`
}
export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const z = (n: number) => String(n).padStart(2, "0")
  const h = Math.floor(s / 3600)
  return h ? `${h}:${z(Math.floor(s / 60) % 60)}:${z(s % 60)}` : `${z(Math.floor(s / 60))}:${z(s % 60)}`
}
export const agoText = (t: number) => {
  const m = Math.floor((Date.now() - t) / 60000)
  if (m < 60) return m <= 1 ? "agora há pouco" : `há ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  return d === 1 ? "ontem" : `há ${d} dias`
}
