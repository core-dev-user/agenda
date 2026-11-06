/**
 * Letras sincronizadas (LRC) da LRCLIB (lrclib.net), base aberta e gratuita.
 * Funciona com qualquer música tocando no YouTube Music: busca por título + artista + duração.
 */
import { useEffect, useState } from "react"
import { bridge } from "./bridge"

export interface LyricLine { t: number; text: string }
export interface Lyrics { synced: LyricLine[] | null; plain: string | null; source: string }

const API = "https://lrclib.net/api"
const cache = new Map<string, Promise<Lyrics | null>>()

/** "Song (Official Music Video) [4K]" -> "Song"; "Artista - Topic" -> "Artista" */
export const cleanTitle = (t: string) =>
  t.replace(/\s*[([](?:[^)\]]*(?:official|oficial|video|vídeo|clipe|lyric|letra|audio|áudio|visualizer|ao vivo|live|remaster|4k|hd)[^)\]]*)[)\]]/gi, "")
    .replace(/\s*[-–|]\s*(official|oficial).*$/i, "")
    .replace(/\s+(ft\.?|feat\.?)\s.*$/i, "")
    .trim()
const cleanArtist = (a: string) => a.replace(/\s*-\s*Topic$/i, "").split(/,|&| e | x |\sfeat\.?\s/i)[0].trim()

function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = []
  for (const line of lrc.split(/\r?\n/)) {
    const tags = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]
    if (!tags.length) continue
    const text = line.replace(/\[[^\]]*\]/g, "").trim()
    for (const m of tags) out.push({ t: Number(m[1]) * 60 + Number(m[2]), text })
  }
  return out.sort((a, b) => a.t - b.t)
}

type Rec = { trackName: string; artistName: string; duration: number; syncedLyrics: string | null; plainLyrics: string | null; instrumental?: boolean }
const usable = (r: Rec | null) => !!r && ((r.syncedLyrics && parseLrc(r.syncedLyrics).filter((l) => l.text).length >= 4) || (r.plainLyrics && r.plainLyrics.length > 40))

async function getJson<T>(url: string): Promise<T | null> {
  try { return JSON.parse(await bridge.net.text(url)) as T } catch { return null }
}

export function findLyrics(title: string, artist: string, duration: number): Promise<Lyrics | null> {
  const t = cleanTitle(title), a = cleanArtist(artist)
  const key = `${t}|${a}|${Math.round(duration)}`.toLowerCase()
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const q = (o: Record<string, string>) => new URLSearchParams(o).toString()
      let best: Rec | null = null
      if (duration) {
        const r = await getJson<Rec>(`${API}/get?${q({ track_name: t, artist_name: a, duration: String(Math.round(duration)) })}`)
        if (usable(r)) best = r
      }
      if (!best) {
        // busca e escolhe: com sincronia, duração mais próxima, nome mais parecido
        const list = (await getJson<Rec[]>(`${API}/search?${q({ track_name: t, artist_name: a })}`)) ?? (await getJson<Rec[]>(`${API}/search?${q({ q: `${t} ${a}` })}`)) ?? []
        const scored = list.filter(usable).map((r) => ({
          r,
          s: (r.syncedLyrics ? 0 : 30) + (duration ? Math.min(60, Math.abs(r.duration - duration)) : 0) + (r.trackName.toLowerCase().includes(t.toLowerCase()) ? 0 : 10),
        })).sort((x, y) => x.s - y.s)
        if (scored[0] && (!duration || Math.abs(scored[0].r.duration - duration) < 15)) best = scored[0].r
      }
      if (!best) return null
      const synced = best.syncedLyrics ? parseLrc(best.syncedLyrics) : null
      return { synced: synced && synced.length ? synced : null, plain: best.plainLyrics, source: `${best.artistName} — ${best.trackName}` }
    })())
  }
  return cache.get(key)!
}

/** Letra da música atual. `null` enquanto busca; `false` se não encontrou. */
export function useLyrics(title?: string, artist?: string, duration?: number, enabled = true) {
  const [ly, setLy] = useState<Lyrics | null | false>(null)
  useEffect(() => {
    if (!enabled || !title) return
    let alive = true
    setLy(null)
    // espera a duração estabilizar (ela chega uns instantes depois do título)
    const id = setTimeout(() => {
      findLyrics(title, artist ?? "", duration ?? 0).then((r) => alive && setLy(r ?? false)).catch(() => alive && setLy(false))
    }, 600)
    return () => { alive = false; clearTimeout(id) }
  }, [title, artist, enabled, Math.round((duration ?? 0) / 5)])
  return ly
}

/** índice da linha que está tocando no tempo `t` (s) */
export function lineAt(lines: LyricLine[], t: number) {
  let lo = 0, hi = lines.length - 1, ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].t <= t) { ans = mid; lo = mid + 1 } else hi = mid - 1
  }
  return ans
}
