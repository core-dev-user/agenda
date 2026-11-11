import { useEffect, useState } from "react"
import { bridge, type PcMedia } from "./bridge"
import { baseTitle, firstArtist, normalize, sameSong } from "./coverMatch"

/**
 * Capa reserva para quando o player não entrega a arte ao Windows (o Spotify às vezes não entrega,
 * ou entrega atrasado). Procura pelo título + artista no iTunes e, se não achar, no Deezer.
 * Só aceita um resultado em que título e artista batem; nunca mostra a capa de outra música.
 */
const cache = new Map<string, string | null>()
const MAX = 120

async function lookup(title: string, artist: string): Promise<string | null> {
  const term = encodeURIComponent(baseTitle(title) + " " + firstArtist(artist))
  try {
    const it = JSON.parse(await bridge.net.text(`https://itunes.apple.com/search?term=${term}&entity=song&limit=15`))
    const hit = (it.results ?? []).find((r: { trackName?: string; artistName?: string; artworkUrl100?: string }) =>
      r.artworkUrl100 && sameSong(title, artist, r.trackName ?? "", r.artistName ?? ""))
    if (hit) return hit.artworkUrl100.replace(/100x100bb/, "600x600bb")
  } catch { /* tenta o próximo */ }
  try {
    const dz = JSON.parse(await bridge.net.text(`https://api.deezer.com/search?q=${term}&limit=15`))
    const hit = (dz.data ?? []).find((r: { title?: string; artist?: { name?: string }; album?: { cover_xl?: string } }) =>
      r.album?.cover_xl && sameSong(title, artist, r.title ?? "", r.artist?.name ?? ""))
    if (hit) return hit.album.cover_xl
  } catch { /* sem capa */ }
  return null
}

/** capa da música: a do Windows quando existe; senão a reserva (buscada uma vez por música) */
export function useCoverArt(media: PcMedia | null | undefined): string | null {
  const title = media?.title || ""
  const artist = media?.artist || ""
  const own = media?.art || null
  const key = normalize(title) + "|" + normalize(artist)
  const [found, setFound] = useState<{ key: string; url: string | null } | null>(null)
  useEffect(() => {
    if (own || !title) return
    if (cache.has(key)) { setFound({ key, url: cache.get(key) ?? null }); return }
    let alive = true
    // espera um pouco: a capa do Windows costuma chegar logo depois do título
    const t = window.setTimeout(() => {
      void lookup(title, artist).then((url) => {
        cache.delete(key); cache.set(key, url)
        while (cache.size > MAX) cache.delete(cache.keys().next().value as string)
        if (alive) setFound({ key, url })
      })
    }, 1200)
    return () => { alive = false; clearTimeout(t) }
  }, [own, title, artist, key])
  return own || (found?.key === key ? found.url : null)
}
