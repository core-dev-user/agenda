/**
 * Histórico de escuta do YouTube Music (o próprio YT Music não mostra estatísticas):
 * o Agenda conta o tempo que cada música toca, quantas vezes você ouviu, horários e dias.
 * O gênero vem do catálogo público do iTunes (busca pelo artista, sem login), guardado em cache.
 */
import { useStore } from "./store"
import { bridge, type MusicState } from "./bridge"
import { todayISO } from "./utils"

export interface TrackMeta { title: string; artist: string; album?: string; art?: string; first: number }
export interface ListenStats {
  /** dia → música → [segundos, vezes ouvida] */
  days: Record<string, Record<string, [number, number]>>
  meta: Record<string, TrackMeta>
  /** segundos por hora do dia (0–23) */
  hours: number[]
  /** artista (minúsculo) → gênero ("" = não encontrado) */
  genres: Record<string, string>
  recent: { k: string; at: number }[]
  since: number
}
export const emptyListen = (): ListenStats => ({ days: {}, meta: {}, hours: Array(24).fill(0), genres: {}, recent: [], since: Date.now() })
export const trackKey = (title: string, artist: string) => `${title.trim().toLowerCase()}|${artist.trim().toLowerCase()}`
/** "Artista 1, Artista 2 & Artista 3" → artista principal */
export const mainArtist = (a: string) => a.split(/,| feat\.? | ft\.? /i)[0].trim()

let started = false
let cur: { k: string; acc: number; counted: boolean; dur: number } | null = null
let lastAt = 0
let buf: { day: string; k: string; sec: number; plays: number; hour: number }[] = []

function flush() {
  if (!buf.length) return
  const items = buf
  buf = []
  useStore.setState((s) => {
    const L: ListenStats = s.listening ? { ...s.listening } : emptyListen()
    const days = { ...L.days }
    const hours = [...L.hours]
    for (const it of items) {
      const d = { ...(days[it.day] ?? {}) }
      const v = d[it.k] ?? [0, 0]
      d[it.k] = [v[0] + it.sec, v[1] + it.plays]
      days[it.day] = d
      hours[it.hour] += it.sec
    }
    return { listening: { ...L, days, hours } }
  })
}

function onState(m: MusicState) {
  const now = Date.now()
  if (!m.title || !m.artist || m.ad) { lastAt = now; return }
  const k = trackKey(m.title, m.artist)
  if (!cur || cur.k !== k) {
    flush()
    cur = { k, acc: 0, counted: false, dur: m.duration ?? 0 }
    const L = useStore.getState().listening ?? emptyListen()
    if (!L.meta[k] || (m.art && L.meta[k].art !== m.art)) {
      useStore.setState({ listening: { ...L, meta: { ...L.meta, [k]: { title: m.title, artist: m.artist, album: m.album, art: m.art, first: L.meta[k]?.first ?? now } } } })
    }
    lookupGenre(m.artist)
  }
  if (m.playing && lastAt) {
    const dt = Math.min(5, (now - lastAt) / 1000)
    if (dt > 0) {
      cur.acc += dt
      let plays = 0
      // conta como "ouvida" depois de 30 s (ou metade de uma música curta)
      if (!cur.counted && cur.acc >= Math.min(30, (m.duration || 60) * 0.5)) {
        cur.counted = true
        plays = 1
        const L = useStore.getState().listening ?? emptyListen()
        useStore.setState({ listening: { ...L, recent: [{ k, at: now }, ...L.recent].slice(0, 150) } })
      }
      const d = new Date(now)
      buf.push({ day: todayISO(d), k, sec: dt, plays, hour: d.getHours() })
    }
  }
  lastAt = now
  if (buf.length > 30) flush()
}

/* ---------------- gênero pelo artista (catálogo do iTunes) ---------------- */
const GENRE_PT: Record<string, string> = {
  "Hip-Hop/Rap": "Hip-hop/Rap", "Rap": "Hip-hop/Rap", "Hip-Hop": "Hip-hop/Rap", "R&B/Soul": "R&B/Soul", "Alternative": "Alternativo", "Rock": "Rock",
  "Pop": "Pop", "Electronic": "Eletrônica", "Dance": "Eletrônica", "House": "Eletrônica", "Techno": "Eletrônica", "Country": "Country", "Jazz": "Jazz",
  "Classical": "Clássica", "Soundtrack": "Trilha sonora", "Reggae": "Reggae", "Latin": "Latina", "Latin Urban": "Reggaeton", "Reggaeton y Hip-Hop": "Reggaeton",
  "Brazilian": "Brasileira", "MPB": "MPB", "Sertanejo": "Sertanejo", "Samba": "Samba", "Pagode": "Pagode", "Funk": "Funk", "Baile Funk": "Funk", "Axé": "Axé",
  "Forró": "Forró", "Bossa Nova": "Bossa nova", "Gospel": "Gospel", "Christian": "Gospel", "Christian & Gospel": "Gospel", "Metal": "Metal", "Hard Rock": "Rock",
  "Indie Pop": "Indie", "Indie Rock": "Indie", "K-Pop": "K-pop", "J-Pop": "J-pop", "Anime": "Anime", "Blues": "Blues", "Singer/Songwriter": "Cantor/compositor",
  "Soul": "R&B/Soul", "Punk": "Punk", "Lo-Fi": "Lo-fi", "Trap": "Trap", "Música Popular Brasileira": "MPB",
}
const pending = new Set<string>()
async function lookupGenre(artist: string) {
  const a = mainArtist(artist)
  const key = a.toLowerCase()
  const L = useStore.getState().listening
  if (!a || pending.has(key) || (L && key in L.genres)) return
  pending.add(key)
  try {
    const txt = await bridge.net.text(`https://itunes.apple.com/search?term=${encodeURIComponent(a)}&entity=musicArtist&limit=3&country=BR`)
    const j = JSON.parse(txt)
    // "e" e "&" são a mesma dupla ("Henrique e Juliano" = "Henrique & Juliano")
    const same = (n: string) => n.toLowerCase().replace(/ & /g, " e ").trim() === key.replace(/ & /g, " e ")
    const res = (j.results ?? []).filter((r: any) => r.primaryGenreName)
    const hit = res.find((r: any) => same(r.artistName ?? "")) ?? res[0]
    const raw: string = hit?.primaryGenreName ?? ""
    const pt = Object.entries(GENRE_PT).find(([k]) => k.toLowerCase() === raw.toLowerCase())?.[1]
    const g = raw ? pt ?? raw : ""
    const S = useStore.getState().listening ?? emptyListen()
    useStore.setState({ listening: { ...S, genres: { ...S.genres, [key]: g } } })
  } catch {}
  pending.delete(key)
}

/** apaga todo o histórico de escuta (mantém só o cache de gêneros, que não é histórico) */
export function clearListening() {
  buf = []
  if (cur) { cur.acc = 0; cur.counted = true }
  const g = useStore.getState().listening?.genres ?? {}
  useStore.setState({ listening: { ...emptyListen(), genres: g } })
}

/** começa a registrar (chamado uma vez quando o Agenda abre) */
export function startListening() {
  if (started) return
  started = true
  bridge.music.onState(onState)
  setInterval(flush, 30000)
  window.addEventListener("beforeunload", flush)
}

/* ---------------- números para o painel ---------------- */
export type Period = "today" | "7" | "30" | "year" | "all"
export function periodDays(L: ListenStats, p: Period) {
  const today = todayISO()
  const from = p === "today" ? today : p === "7" ? todayISO(new Date(Date.now() - 6 * 86400000)) : p === "30" ? todayISO(new Date(Date.now() - 29 * 86400000)) : p === "year" ? `${today.slice(0, 4)}-01-01` : ""
  return Object.keys(L.days).filter((d) => d >= from)
}
export function aggregate(L: ListenStats, p: Period) {
  const days = periodDays(L, p)
  const tracks = new Map<string, { sec: number; plays: number }>()
  const perDay = new Map<string, number>()
  for (const d of days) {
    let t = 0
    for (const [k, [sec, plays]] of Object.entries(L.days[d])) {
      const v = tracks.get(k) ?? { sec: 0, plays: 0 }
      v.sec += sec; v.plays += plays
      tracks.set(k, v)
      t += sec
    }
    perDay.set(d, t)
  }
  const artists = new Map<string, { sec: number; plays: number; art?: string; name: string }>()
  const genres = new Map<string, number>()
  for (const [k, v] of tracks) {
    const m = L.meta[k]
    const name = m ? mainArtist(m.artist) : k.split("|")[1]
    const a = artists.get(name.toLowerCase()) ?? { sec: 0, plays: 0, art: m?.art, name }
    a.sec += v.sec; a.plays += v.plays
    artists.set(name.toLowerCase(), a)
    const g = L.genres[name.toLowerCase()]
    if (g) genres.set(g, (genres.get(g) ?? 0) + v.sec)
  }
  const total = [...tracks.values()].reduce((a, v) => a + v.sec, 0)
  const plays = [...tracks.values()].reduce((a, v) => a + v.plays, 0)
  // dias seguidos ouvindo (até hoje ou ontem)
  let streak = 0
  const d = new Date()
  if (!(L.days[todayISO(d)] && Object.keys(L.days[todayISO(d)]).length)) d.setDate(d.getDate() - 1)
  while (L.days[todayISO(d)] && Object.values(L.days[todayISO(d)]).some((v) => v[0] > 30)) { streak++; d.setDate(d.getDate() - 1) }
  return {
    total, plays, streak, days: days.length,
    tracks: [...tracks].map(([k, v]) => ({ k, ...v, meta: L.meta[k] })).sort((a, b) => b.plays - a.plays || b.sec - a.sec),
    artists: [...artists.values()].sort((a, b) => b.sec - a.sec),
    genres: [...genres].sort((a, b) => b[1] - a[1]),
    perDay,
  }
}
export const fmtMin = (sec: number) => {
  const m = Math.round(sec / 60)
  return m >= 120 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`
}
