import records from "./iconPackCatalog.json"
import type { SectionId, IconPackStyle } from "./types"
export type { IconPackStyle } from "./types"

/** Assets are generated into /public/icon-packs before npm run build, then bundled by Vite. */
export const ICON_PACK_STYLES: { id: IconPackStyle; label: string }[] = [
  { id: "original", label: "Originais" },
  { id: "glass", label: "Vidro líquido" },
  { id: "neon", label: "Neon noturno" },
  { id: "metal", label: "Metal escovado" },
  { id: "minimal", label: "Minimal" },
  { id: "retro", label: "Retrô 95" },
]
export const ICON_PACK_CATALOG = records
export const ICON_PACK_CATEGORIES = [...new Set(records.map((r) => r.category))]
export const iconSlug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")

const BY_NAME = new Map(records.map((r) => [iconSlug(r.name), r]))
const aliases: Record<string, string> = {
  "chrome": "Chrome", "msedge": "Edge", "firefox": "Firefox", "opera": "Opera",
  "explorer": "Gerenciador de Arquivos", "notepad": "Notas", "cmd": "Terminal",
  "powershell": "Terminal", "calculator": "Calculadora", "calc": "Calculadora",
  "windows terminal": "Terminal", "photos": "Galeria",
  "steamwebhelper": "Steam", "discordptb": "Discord", "discordcanary": "Discord",
  "githubdesktop": "GitHub", "git bash": "Git",
}
const toEntry = (term: string) => BY_NAME.get(iconSlug(term))
const clean = (input: string) => input.replace(/\.exe$/i, "").replace(/[\-_]/g, " ").replace(/\s+/g, " ").trim()
export function findPackIcon(name: string, executable = "") {
  const basename = executable.split(/[\\/]/).pop() ?? ""
  for (const value of [name, basename]) {
    const term = clean(value)
    const exact = toEntry(term)
    if (exact) return exact
    const alias = aliases[term.toLowerCase().replace(/\s/g, "")] ?? aliases[term.toLowerCase()]
    if (alias) return toEntry(alias)
  }
  const normalizedName = iconSlug(name)
  // Only reasonably distinctive full names; avoid replacing "Google X" with the Google icon.
  return records.find((r) => iconSlug(r.name).length >= 7 && (normalizedName.startsWith(iconSlug(r.name) + "_") || normalizedName.endsWith("_" + iconSlug(r.name))))
}
export const iconPackSrc = (name: string, style: IconPackStyle): string | null => {
  const entry = toEntry(name)
  return entry && style !== "original" ? "icon-packs/" + style + "/" + iconSlug(entry.name) + ".svg" : null
}
export const iconPackAppSrc = (name: string, exe: string, style: IconPackStyle): string | null => {
  const entry = findPackIcon(name, exe)
  return entry && style !== "original" ? iconPackSrc(entry.name, style) : null
}

/** Only the recognizable original glyph, rendered as a monochrome CSS mask.
 * Uses the offline, generated Font Awesome vectors with no background tile.
 * Unrecognized installed programs retain their actual Windows icon instead.
 */
export const carbonoBrandSrc = (name: string, exe = ""): string | null => {
  const entry = findPackIcon(name, exe)
  return entry ? "icon-packs/carbono/" + iconSlug(entry.name) + ".svg" : null
}
const SECTIONS: Record<SectionId, string> = {
  today: "Agenda", habits: "Tarefas", studies: "Estudos", services: "Projetos",
  finance: "Financeiro", lists: "Tarefas", music: "Musica", games: "Jogos",
  rooms: "Conversas", discord: "Discord", whatsapp: "WhatsApp", ifood: "Compras",
  gallery: "Galeria", settings: "Configuracoes",
}
export const iconPackSectionSrc = (id: SectionId, style: IconPackStyle): string | null => iconPackSrc(SECTIONS[id], style)
