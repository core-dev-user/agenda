import type { CSSProperties } from "react"
import { useSettings } from "@/lib/store"
import type { IconStyle, SectionId, Settings } from "@/lib/types"
import { SECTIONS } from "./sections-meta"

export const ICON_STYLES: { id: IconStyle; label: string }[] = [
  { id: "auto", label: "Automático (do tema)" },
  { id: "logos", label: "Logos do Agenda" },
  { id: "color", label: "Colorido" },
  { id: "glass", label: "Vidro líquido" },
  { id: "metal", label: "Metal" },
  { id: "neon", label: "Neon" },
  { id: "outline", label: "Contorno" },
  { id: "flat", label: "Chapado" },
  { id: "pixel", label: "Retrô pixel" },
]

export function resolveIconStyle(s: Settings): Exclude<IconStyle, "auto"> {
  if (s.iconStyle !== "auto") return s.iconStyle
  return ({ glass: "color", metal: "metal", retro: "pixel", terminal: "neon", minimal: "flat" } as const)[s.theme]
}

export function sectionColor(s: Settings, id: SectionId) {
  return s.iconColors?.[id] || SECTIONS.find((x) => x.id === id)!.color
}

/** Arquivos em public/logos (cópia da pasta "logos"). A Música usa o logo oficial do YouTube Music. */
const LOGO_FILES: Record<SectionId, string> = {
  habits: "habitos", studies: "estudos", services: "servicos", lists: "listas",
  music: "youtube-music", discord: "discord", whatsapp: "whatsapp", ifood: "ifood", gallery: "imagens", settings: "configuracoes",
}

/** Ícone de um app/aba no estilo escolhido nas configurações. */
export function AppIcon({ id, size, styleOverride }: { id: SectionId; size: number; styleOverride?: Exclude<IconStyle, "auto"> }) {
  const s = useSettings()
  const meta = SECTIONS.find((x) => x.id === id)!
  const Icon = meta.icon
  const c = sectionColor(s, id)
  const st = styleOverride ?? resolveIconStyle(s)
  const radius = st === "pixel" ? "0" : s.iconShape === "circle" ? "50%" : s.iconShape === "square" ? "18%" : "28%"
  const glyph = Math.round(size * 0.55)

  if (st === "logos")
    return (
      <img
        src={`logos/${LOGO_FILES[id]}.svg`}
        draggable={false}
        style={{ width: size, height: size, display: "block", filter: `drop-shadow(0 ${Math.max(1, size / 16)}px ${Math.max(2, size / 8)}px rgb(0 0 0 / .35))` }}
        alt={meta.label}
      />
    )

  const base: CSSProperties = { width: size, height: size, borderRadius: radius, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }
  let box: CSSProperties = {}
  let iconColor = "#1a1020"
  let iconFilter: string | undefined
  let gloss = false

  switch (st) {
    case "color":
      box = { background: `linear-gradient(160deg, ${c}, color-mix(in srgb, ${c} 45%, #000))`, boxShadow: `inset 0 1px 0 rgb(255 255 255 / .55), inset 0 -3px 6px rgb(0 0 0 / .25), 0 6px 14px -4px ${c}99` }
      break
    case "glass":
      box = {
        background: `linear-gradient(160deg, rgb(255 255 255 / .34), rgb(255 255 255 / .06)), color-mix(in srgb, ${c} 28%, transparent)`,
        backdropFilter: "blur(12px) saturate(180%)",
        border: "1px solid rgb(255 255 255 / .4)",
        boxShadow: `inset 0 1px 0 rgb(255 255 255 / .75), inset 0 -10px 18px -10px ${c}, inset 0 0 0 1px rgb(255 255 255 / .06), 0 10px 22px -8px ${c}aa`,
      }
      iconColor = "#fff"
      iconFilter = `drop-shadow(0 1px 2px rgb(0 0 0 / .35)) drop-shadow(0 0 6px ${c})`
      gloss = true
      break
    case "metal":
      box = {
        background: "repeating-linear-gradient(90deg, rgb(255 255 255 / .05) 0 1px, transparent 1px 3px), linear-gradient(180deg, #f2f3f5, #b9bcc2 55%, #8e9299)",
        border: "1px solid #4a4d53",
        boxShadow: "inset 0 1px 0 #fff, inset 0 -2px 3px rgb(0 0 0 / .25), 0 4px 10px -3px rgb(0 0 0 / .5)",
      }
      iconColor = `color-mix(in srgb, ${c} 55%, #1d1f23)`
      iconFilter = "drop-shadow(0 1px 0 rgb(255 255 255 / .8))"
      break
    case "neon":
      box = { background: "rgb(10 6 14 / .85)", border: `1.5px solid ${c}`, boxShadow: `0 0 12px ${c}aa, inset 0 0 10px ${c}66` }
      iconColor = c
      iconFilter = `drop-shadow(0 0 4px ${c}) drop-shadow(0 0 8px ${c})`
      break
    case "outline":
      box = { background: "transparent", border: "1.5px solid color-mix(in srgb, var(--fg) 70%, transparent)" }
      iconColor = "var(--fg)"
      break
    case "flat":
      box = { background: c }
      break
    case "pixel":
      box = { background: c, boxShadow: "inset -2px -2px #0a0a0a88, inset 2px 2px #ffffffaa, inset -4px -4px #00000033" }
      iconColor = "#111"
      break
  }

  return (
    <div style={{ ...base, ...box }}>
      {gloss && (
        <div
          className="pointer-events-none absolute inset-x-[6%] top-[4%] h-[48%]"
          style={{ borderRadius: `${radius} ${radius} 45% 45% / ${radius} ${radius} 30% 30%`, background: "linear-gradient(180deg, rgb(255 255 255 / .55), rgb(255 255 255 / 0))" }}
        />
      )}
      <Icon size={glyph} strokeWidth={st === "pixel" ? 2.4 : 1.8} style={{ color: iconColor, filter: iconFilter, position: "relative" }} />
    </div>
  )
}
