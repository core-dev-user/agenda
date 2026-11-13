/** Funções puras do catálogo de mapas (testadas em tests/valorant-fx.test.mjs, fora do navegador). */
export interface ValMap {
  uuid: string
  displayName: string
  /** "Pontos A/B", ou null em mapas de mata-mata, duelo e treino */
  tacticalDescription: string | null
  /** caminho interno do jogo (ex.: /Game/Maps/Ascent/Ascent): é o que a partida informa */
  mapUrl: string
  splash: string | null
  stylizedBackgroundImage: string | null
  premierBackgroundImage: string | null
  listViewIcon: string | null
}
export type MapImage = "splash" | "stylized" | "premier"

/** só o que o widget usa; mapas sem imagem e repetidos (The Range aparece duas vezes) ficam de fora */
export function cleanMaps(raw: unknown): ValMap[] {
  const list = Array.isArray(raw) ? raw : []
  const seen = new Set<string>()
  const out: ValMap[] = []
  for (const m of list as Record<string, unknown>[]) {
    if (!m || typeof m.uuid !== "string" || typeof m.displayName !== "string" || typeof m.splash !== "string") continue
    if (seen.has(m.displayName)) continue
    seen.add(m.displayName)
    const s = (k: string) => (typeof m[k] === "string" ? (m[k] as string) : null)
    out.push({ uuid: m.uuid, displayName: m.displayName, tacticalDescription: s("tacticalDescription"), mapUrl: s("mapUrl") ?? "", splash: s("splash"), stylizedBackgroundImage: s("stylizedBackgroundImage"), premierBackgroundImage: s("premierBackgroundImage"), listViewIcon: s("listViewIcon") })
  }
  // mapas de partida competitiva primeiro (os que têm pontos de bomba), depois os outros, cada grupo em ordem alfabética
  return out.sort((a, b) => Number(!a.tacticalDescription) - Number(!b.tacticalDescription) || a.displayName.localeCompare(b.displayName))
}

export function mapImage(m: ValMap, kind: MapImage): string | null {
  return (kind === "stylized" ? m.stylizedBackgroundImage : kind === "premier" ? m.premierBackgroundImage : null) ?? m.splash
}

/** mapa da partida: a partida informa o caminho interno (mapUrl), não o nome */
export function mapFromMatch(list: ValMap[], mapId: string | null | undefined): ValMap | undefined {
  if (!mapId) return undefined
  const id = mapId.toLowerCase()
  return list.find((m) => m.mapUrl.toLowerCase() === id)
}

/** mapa "aleatório": muda a cada agente e a cada vez que o widget é aberto, mas não a cada redesenho */
export function pickRandom(list: ValMap[], seed: string): ValMap | undefined {
  const pool = list.filter((m) => m.tacticalDescription)
  const from = pool.length ? pool : list
  if (!from.length) return undefined
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return from[Math.abs(h) % from.length]
}
