import { useEffect, useState } from "react"
import { bridge } from "@/lib/bridge"

/**
 * Mapas do Valorant (catálogo público valorant-api.com, que serve as imagens oficiais da Riot).
 * Guardado em memória e no navegador por 7 dias: abrir o widget não baixa o catálogo de novo.
 */
import { cleanMaps, type ValMap } from "./maps-core"
export * from "./maps-core"

const KEY = "val-maps"
const TTL = 7 * 24 * 3600 * 1000
let cache: ValMap[] | null = null
let loading: Promise<ValMap[]> | null = null

export function loadMaps(): Promise<ValMap[]> {
  if (cache) return Promise.resolve(cache)
  if (!loading) {
    let stored: { at: number; list: ValMap[] } | null = null
    try { stored = JSON.parse(localStorage.getItem(KEY) || "null") } catch {}
    if (stored?.list?.length && Date.now() - stored.at < TTL) { cache = stored.list; return Promise.resolve(cache) }
    loading = bridge.net.text("https://valorant-api.com/v1/maps?language=pt-BR")
      .then((t) => {
        const list = cleanMaps(JSON.parse(t).data)
        if (!list.length) throw new Error("vazio")
        cache = list
        try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), list })) } catch {}
        return list
      })
      .catch(() => {
        loading = null
        // sem internet: a cópia guardada, mesmo antiga, é melhor que nada
        if (stored?.list?.length) { cache = stored.list; return cache }
        return []
      })
  }
  return loading
}

/** `enabled` falso: não baixa nada (o catálogo só é buscado quando algum widget usa fundo de mapa) */
export function useMaps(enabled = true) {
  const [list, setList] = useState<ValMap[]>(cache ?? [])
  const [failed, setFailed] = useState(false)
  const load = () => { setFailed(false); void loadMaps().then((l) => { setList(l); setFailed(!l.length) }) }
  useEffect(() => { if (enabled && !cache) load(); else if (enabled && cache && list !== cache) setList(cache) }, [enabled])
  return { list, failed, retry: load }
}
