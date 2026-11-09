/**
 * Times favoritos separados por esporte: o Corinthians é do futebol, a FURIA do CS2/Valorant…
 * Cada esporte só avisa e destaca os times da própria lista.
 */
import { bridge, type SportMatch } from "./bridge"
import { useStore } from "./store"
import type { Settings, SportKind } from "./types"

export const SPORTS: { id: SportKind; label: string; color: string; example: string }[] = [
  { id: "football", label: "Futebol", color: "#2fd27a", example: "Corinthians, Real Madrid" },
  { id: "cs2", label: "Counter-Strike 2", color: "#f5a524", example: "FURIA, MIBR" },
  { id: "valorant", label: "Valorant", color: "#ff4655", example: "LOUD, Sentinels" },
]

export const norm = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

/** favoritos gerais de um esporte (Configurações › Rotina e avisos) */
export const sportFavs = (s: Settings, sport: SportKind): string[] => s.favBySport?.[sport] ?? []

/** o nome do time bate com o favorito? (igual, sigla, ou um contém o outro com 4+ letras) */
export function nameMatches(team: { name?: string; short?: string }, fav: string) {
  const f = norm(fav), n = norm(team.name || ""), sh = norm(team.short || "")
  if (!f || !n || n === "a definir") return false
  if (n === f || sh === f) return true
  return f.length >= 4 && n.length >= 4 && (n.includes(f) || f.includes(n))
}
export const matchHasFav = (m: SportMatch, favs: string[]) => favs.some((f) => nameMatches(m.a, f) || nameMatches(m.b, f))

/** todos os favoritos do esporte: os gerais + os escolhidos nos widgets daquele esporte */
export function favsForSport(sport: SportKind): string[] {
  const s = useStore.getState()
  const fromWidgets = s.widgets.filter((w) => w.type === sport)
    .flatMap((w) => (Array.isArray(w.config.favs) ? w.config.favs.map((f: { name: string }) => f.name) : String(w.config.teams ?? "").split(",")))
  return [...new Set([...sportFavs(s.settings, sport), ...fromWidgets].map((f) => String(f).trim()).filter(Boolean))]
}

/**
 * Versões antigas guardavam tudo numa lista só. Separa uma vez: procura cada nome nas listas de times
 * de cada esporte; o que não aparecer em nenhuma vai para o futebol (dá para mudar nas configurações).
 */
export async function migrateFavTeams() {
  const s = useStore.getState().settings
  if (s.favBySport || !s.favTeams?.length) return
  const leagues = new Set(["bra.1", "bra.2", "conmebol.libertadores", "uefa.champions", "eng.1", "esp.1", "ita.1", "ger.1", "fra.1", "por.1", "arg.1"])
  for (const w of useStore.getState().widgets) if (w.type === "football") for (const l of w.config.leagues ?? []) leagues.add(l)
  const [fb, cs, val] = await Promise.all([
    bridge.sports.teams("football", { leagues: [...leagues] }).catch(() => []),
    bridge.sports.teams("cs2").catch(() => []),
    bridge.sports.teams("valorant").catch(() => []),
  ])
  const exact = (list: { name: string; short?: string }[], f: string) => list.some((t) => norm(t.name) === norm(f) || norm(t.short || "") === norm(f))
  const loose = (list: { name: string; short?: string }[], f: string) => list.some((t) => nameMatches(t, f))
  const out: Record<SportKind, string[]> = { football: [], cs2: [], valorant: [] }
  for (const f of s.favTeams) {
    const hit = { football: exact(fb, f), cs2: exact(cs, f), valorant: exact(val, f) }
    if (!hit.football && !hit.cs2 && !hit.valorant) Object.assign(hit, { football: loose(fb, f), cs2: loose(cs, f), valorant: loose(val, f) })
    if (!hit.football && !hit.cs2 && !hit.valorant) hit.football = true
    // grava com o nome bonito da lista ("corinthians" → "Corinthians")
    const lists = { football: fb, cs2: cs, valorant: val }
    for (const k of Object.keys(hit) as SportKind[]) {
      if (!hit[k]) continue
      const t = lists[k].find((x) => norm(x.name) === norm(f))
      out[k].push(t?.name ?? f)
    }
  }
  // pode ter mudado enquanto buscava
  if (useStore.getState().settings.favBySport) return
  useStore.getState().setSettings({ favBySport: out, favTeams: undefined })
}
