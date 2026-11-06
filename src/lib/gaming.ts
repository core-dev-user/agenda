/**
 * Histórico de jogos: o processo principal avisa qual jogo está aberto; aqui viram sessões
 * (jogo, começo, fim) guardadas no Agenda. Fechar e abrir de novo em menos de 3 min continua a mesma sessão.
 */
import { useStore } from "./store"
import { bridge, type GamesState } from "./bridge"
import { todayISO, uid } from "./utils"

export interface GameInfo { name: string; color?: string; icon?: string; exe?: string }
export interface GameSession { id: string; game: string; start: number; end: number; open?: boolean }
export interface GamingData {
  games: Record<string, GameInfo>
  sessions: GameSession[]
  custom: { exe: string; name: string }[]
  ignored: string[]
}
export const emptyGaming = (): GamingData => ({ games: {}, sessions: [], custom: [], ignored: [] })
const G = () => useStore.getState().gaming ?? emptyGaming()
const setG = (fn: (g: GamingData) => GamingData) => useStore.setState((s) => ({ gaming: fn(s.gaming ?? emptyGaming()) }))

const MERGE = 3 * 60000
const MIN = 60000
let started = false
let lastWrite = 0

function apply(st: GamesState) {
  const now = st.at || Date.now()
  setG((g) => {
    const games = { ...g.games }
    let sessions = g.sessions.map((s) => ({ ...s }))
    const running = new Set(st.playing.map((p) => p.id))
    for (const p of st.playing) {
      if (!games[p.id]) games[p.id] = { name: p.name, color: p.color || undefined, exe: p.exe }
      const open = sessions.find((s) => s.open && s.game === p.id)
      if (open) { open.end = now; continue }
      // reabriu logo depois de fechar, ou o Agenda foi aberto com o jogo já rodando: continua a sessão
      const recent = [...sessions].reverse().find((s) => s.game === p.id && (now - s.end < MERGE || Math.abs(s.start - p.start) < MERGE))
      if (recent) { Object.assign(recent, { open: true, end: now }); continue }
      sessions.push({ id: uid(), game: p.id, start: Math.min(p.start, now), end: now, open: true })
    }
    // fechou o jogo: encerra a sessão (as muito curtas, tipo abrir e fechar, são descartadas)
    sessions = sessions
      .map((s) => (s.open && !running.has(s.game) ? { ...s, open: false } : s))
      .filter((s) => s.open || s.end - s.start >= MIN)
    return { ...g, games, sessions }
  })
  // ícones dos jogos (do próprio .exe), uma vez
  for (const p of st.playing) {
    if (G().games[p.id]?.icon || !p.path) continue
    bridge.games.icon(p.path).then((icon) => { if (icon) setG((g) => ({ ...g, games: { ...g.games, [p.id]: { ...g.games[p.id], icon } } })) })
  }
  lastWrite = Date.now()
}

export function startGaming() {
  if (started) return
  started = true
  // sessões que ficaram "abertas" de quando o Agenda foi fechado: o processo dirá se ainda estão rodando
  bridge.games.onState(apply)
  bridge.games.get().then(apply).catch(() => {})
  const sync = () => { const g = G(); bridge.games.config({ custom: g.custom, ignored: g.ignored }) }
  sync()
  useStore.subscribe((s, p) => { if (s.gaming?.custom !== p.gaming?.custom || s.gaming?.ignored !== p.gaming?.ignored) sync() })
  // enquanto joga, atualiza o fim da sessão a cada minuto (se o PC desligar, o tempo fica certo)
  setInterval(() => {
    if (Date.now() - lastWrite < 55000) return
    if (G().sessions.some((s) => s.open)) bridge.games.get().then(apply).catch(() => {})
  }, 60000)
}

/* ---------------- números ---------------- */
export type GPeriod = "today" | "7" | "30" | "year" | "all"
export function periodStart(p: GPeriod) {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  if (p === "today") return d.getTime()
  if (p === "7") return d.getTime() - 6 * 86400000
  if (p === "30") return d.getTime() - 29 * 86400000
  if (p === "year") return new Date(d.getFullYear(), 0, 1).getTime()
  return 0
}
/** duração de uma sessão dentro de [from, to] (sessões abertas contam até agora) */
const within = (s: GameSession, from: number, to: number) => Math.max(0, Math.min(s.open ? Date.now() : s.end, to) - Math.max(s.start, from))

export function gamingStats(g: GamingData, p: GPeriod) {
  const from = periodStart(p), to = Date.now()
  const per = new Map<string, { ms: number; sessions: number; last: number }>()
  const perDay = new Map<string, number>()
  const hours = Array(24).fill(0)
  let total = 0, longest: GameSession | null = null
  for (const s of g.sessions) {
    const ms = within(s, from, to)
    if (!ms) continue
    total += ms
    const v = per.get(s.game) ?? { ms: 0, sessions: 0, last: 0 }
    v.ms += ms; v.sessions++; v.last = Math.max(v.last, s.open ? Date.now() : s.end)
    per.set(s.game, v)
    if (!longest || (s.open ? Date.now() : s.end) - s.start > (longest.open ? Date.now() : longest.end) - longest.start) longest = s
    // por dia e por hora (anda em passos de 15 min)
    for (let t = Math.max(s.start, from); t < Math.min(s.open ? Date.now() : s.end, to); t += 15 * 60000) {
      const step = Math.min(15 * 60000, Math.min(s.open ? Date.now() : s.end, to) - t)
      const d = new Date(t)
      perDay.set(todayISO(d), (perDay.get(todayISO(d)) ?? 0) + step)
      hours[d.getHours()] += step
    }
  }
  const games = [...per].map(([id, v]) => ({ id, ...v, info: g.games[id] ?? { name: id } })).sort((a, b) => b.ms - a.ms)
  const sessions = g.sessions.filter((s) => within(s, from, to) > 0).length
  return { total, games, perDay, hours, sessions, longest }
}

export const fmtDur = (ms: number) => {
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h${m % 60 ? ` ${m % 60} min` : ""}`
}
