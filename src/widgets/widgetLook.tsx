import type { CSSProperties, ReactNode } from "react"
import { useStore } from "@/lib/store"
import { fontFamily } from "@/lib/fonts"
import { FontPicker } from "@/components/FontPicker"
import { Choice, Group, Range, Row, Swatches, Tiles, Toggle } from "./inspector"

/**
 * Aparência própria de um widget (fica em `config.look`). Tudo opcional: o que não for definido segue o tema.
 */
export interface WidgetLook {
  /** fundo: do tema, vidro com cor, cor sólida ou nenhum */
  surface?: "theme" | "glass" | "solid" | "none"
  bgColor?: string
  bgAlpha?: number
  blur?: number
  border?: "theme" | "none" | "custom"
  borderColor?: string
  borderWidth?: number
  radius?: number
  shadow?: "theme" | "none" | "soft" | "strong" | "glow"
  /** efeito ao passar o mouse */
  hover?: "theme" | "none" | "glow" | "lift" | "border"
  accent?: string
  text?: string
  font?: string
  /** os botões mover/configurar/remover aparecem ao passar o mouse; "minimal" = só um botão pequeno de configurar */
  chrome?: "full" | "minimal"
}

const hexA = (hex: string, a: number) => {
  const h = hex.replace("#", "")
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16)
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${a})`
}
const lum = (hex: string) => {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16)
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}

export const lookOfWidget = (config: Record<string, any>): WidgetLook => {
  const l: WidgetLook = { ...(config.look ?? {}) }
  if (config.bare && !l.surface) l.surface = "none"
  return l
}

/** estilo inline do cartão do widget conforme a aparência própria */
export function lookStyle(l: WidgetLook): CSSProperties {
  const s: CSSProperties & Record<string, any> = {}
  const surf = l.surface ?? "theme"
  if (surf === "none") {
    s.background = "transparent"
    s.backdropFilter = "none"
    s.border = "1px solid transparent"
    s.boxShadow = "none"
  } else if (surf === "glass" || surf === "solid") {
    const c = l.bgColor ?? "#141018"
    const a = l.bgAlpha ?? (surf === "solid" ? 0.92 : 0.28)
    s.background = surf === "glass" ? `linear-gradient(135deg, ${hexA(c, Math.min(1, a + 0.08))}, ${hexA(c, a * 0.55)})` : hexA(c, a)
    s.backdropFilter = `blur(${l.blur ?? (surf === "glass" ? 24 : 0)}px) saturate(${surf === "glass" ? 170 : 100}%)`
  }
  if (surf !== "none" && l.blur != null && surf === "theme") s.backdropFilter = `blur(${l.blur}px) saturate(170%)`
  if (l.border === "none") s.border = "1px solid transparent"
  else if (l.border === "custom") s.border = `${l.borderWidth ?? 1}px solid ${l.borderColor ?? "#ffffff"}`
  if (l.radius != null) s.borderRadius = l.radius
  const acc = l.accent
  switch (l.shadow) {
    case "none": s.boxShadow = "none"; break
    case "soft": s.boxShadow = "0 14px 40px -14px rgb(0 0 0 / .45)"; break
    case "strong": s.boxShadow = "0 30px 70px -18px rgb(0 0 0 / .75)"; break
    case "glow": s.boxShadow = `0 0 0 1px ${hexA(acc ?? "#ff8fb8", 0.35)}, 0 0 34px -4px ${hexA(acc ?? "#ff8fb8", 0.55)}`; break
  }
  if (acc) { s["--accent"] = acc; s["--wacc"] = acc }
  if (l.text) {
    s.color = l.text
    s["--fg"] = l.text
    s["--fg-muted"] = hexA(l.text, 0.62)
    s["--line"] = hexA(l.text, lum(l.text) > 0.5 ? 0.14 : 0.12)
  }
  if (l.font) { s.fontFamily = fontFamily(l.font); s["--font-ui"] = fontFamily(l.font) }
  return s
}

export const hoverClass = (l: WidgetLook) => ({ glow: "wl-h-glow", lift: "wl-h-lift", border: "wl-h-border", none: "wl-h-none", theme: "" })[l.hover ?? "theme"]

/** estilos prontos */
export const LOOK_PRESETS: { id: string; label: string; look: WidgetLook; preview: CSSProperties }[] = [
  { id: "theme", label: "Do tema", look: {}, preview: { background: "linear-gradient(135deg, rgb(255 255 255 / .2), rgb(255 255 255 / .06))", border: "1px solid rgb(255 255 255 / .25)" } },
  { id: "float", label: "Flutuando", look: { surface: "none", hover: "none", chrome: "minimal" }, preview: { background: "transparent", border: "1px dashed rgb(255 255 255 / .2)" } },
  { id: "smoke", label: "Vidro escuro", look: { surface: "glass", bgColor: "#0a0a0f", bgAlpha: 0.45, blur: 28, border: "custom", borderColor: "#ffffff22", hover: "none" }, preview: { background: "rgb(10 10 15 / .6)", border: "1px solid rgb(255 255 255 / .12)" } },
  { id: "frost", label: "Vidro claro", look: { surface: "glass", bgColor: "#ffffff", bgAlpha: 0.16, blur: 30, border: "custom", borderColor: "#ffffff55", hover: "lift" }, preview: { background: "rgb(255 255 255 / .22)", border: "1px solid rgb(255 255 255 / .4)" } },
  { id: "solid", label: "Sólido", look: { surface: "solid", bgColor: "#121016", bgAlpha: 0.95, border: "none", shadow: "strong", hover: "lift" }, preview: { background: "#121016" } },
  { id: "outline", label: "Contorno", look: { surface: "glass", bgColor: "#000000", bgAlpha: 0.08, blur: 6, border: "custom", borderColor: "#ffffff", borderWidth: 1, shadow: "none", hover: "border" }, preview: { background: "rgb(0 0 0 / .1)", border: "1px solid #fff" } },
  { id: "neon", label: "Neon", look: { surface: "glass", bgColor: "#07050c", bgAlpha: 0.55, blur: 18, border: "custom", borderColor: "#ff4fa3", shadow: "glow", accent: "#ff4fa3", hover: "glow" }, preview: { background: "rgb(7 5 12 / .7)", border: "1px solid #ff4fa3", boxShadow: "0 0 14px #ff4fa3aa" } },
]

const SW = ["#ffffff", "#0a0a0f", "#1a1020", "#ff8fb8", "#ff4fa3", "#c49bff", "#7cc8ff", "#8cf0b0", "#ffd36e", "#ff6b6b"]

/**
 * Widgets que pintam o próprio fundo por cima do cartão (fundo, desfoque e imagem de fundo daqui não aparecem)
 * ou que usam cores de texto fixas (a "cor do texto" daqui não muda nada).
 */
export function lookLimits(type: string, config: Record<string, any>): { ownBg: string | null; fixedText: boolean } {
  switch (type) {
    case "weather": return { ownBg: "O clima desenha o próprio céu como fundo.", fixedText: true }
    case "pcmusic": return { ownBg: (config.pcBg ?? "glass") !== "none" ? "O player usa o fundo dele. Em “Fundo” do player, escolha “Sem fundo” para usar o fundo daqui." : null, fixedText: true }
    case "valagent": return { ownBg: "O fundo deste widget fica em “Fundo do agente”, acima.", fixedText: true }
    case "musicclip": return { ownBg: "O clipe ocupa o widget inteiro.", fixedText: true }
    default: return { ownBg: null, fixedText: false }
  }
}

/** widgets cujo conteúdo usa a cor de destaque em algum lugar (nos outros, escolher essa cor não mudaria nada) */
const USES_ACCENT = new Set(["clock", "stopwatch", "calendar", "tasks", "shortcut", "music", "pcmusic", "cs2", "valorant", "football", "countdown", "sysmon", "valagent"])

/** id do estilo pronto que bate com a aparência atual (ou "" quando foi ajustada à mão) */
const presetOf = (look: unknown) => LOOK_PRESETS.find((p) => JSON.stringify(p.look) === JSON.stringify(look ?? {}))?.id ?? ""

/** Aba "Aparência" do painel de personalizar. `afterBackground` entra logo depois do grupo Fundo (imagem de fundo). */
export function LookPanel({ id, type, config, afterBackground }: { id: string; type: string; config: Record<string, any>; afterBackground?: ReactNode }) {
  const upd = useStore((s) => s.updateWidgetConfig)
  const lite = useStore((s) => !!s.settings.perfLite)
  const theme = useStore((s) => s.settings.theme)
  const lim = lookLimits(type, config)
  const l = lookOfWidget(config)
  const set = (p: Partial<WidgetLook>) => upd(id, { look: { ...l, ...p }, bare: undefined })
  const surf = l.surface ?? "theme"
  // a cor de destaque também pinta a sombra "brilho" e os efeitos de brilhar e acender a borda
  const accentMatters = USES_ACCENT.has(type) || l.shadow === "glow" || l.hover === "glow" || l.hover === "border"
  return (
    <>
      <Group title="Estilo pronto" flush>
        <div className="p-1.5">
          <Tiles label="Estilo pronto" cols={4} value={presetOf(config.look)} onChange={(v) => upd(id, { look: { ...LOOK_PRESETS.find((p) => p.id === v)!.look }, bare: undefined })}
            options={LOOK_PRESETS.map((p) => ({ value: p.id, label: p.label, preview: <span className="block h-6 w-[72%] rounded-[6px]" style={p.preview} /> }))} />
        </div>
      </Group>

      <Group title="Fundo" note={lim.ownBg ?? undefined}>
        {!lim.ownBg && (
          <Row stack>
            <Choice label="Fundo" value={surf} onChange={(v) => set({ surface: v })} options={[{ value: "theme", label: "Do tema" }, { value: "glass", label: "Vidro" }, { value: "solid", label: "Sólido" }, { value: "none", label: "Nenhum" }]} />
          </Row>
        )}
        {!lim.ownBg && (surf === "glass" || surf === "solid") && (
          <Row stack label="Cor">
            <Swatches label="Cor do fundo" value={l.bgColor ?? "#141018"} onChange={(v) => set({ bgColor: v })} colors={SW} />
          </Row>
        )}
        {!lim.ownBg && (surf === "glass" || surf === "solid") && (
          <Range label="Opacidade" value={l.bgAlpha ?? (surf === "solid" ? 0.92 : 0.28)} min={0} max={1} step={0.02} onChange={(v) => set({ bgAlpha: v })} format={(v) => Math.round(v * 100) + "%"} />
        )}
        {!lim.ownBg && (surf === "glass" || (surf === "theme" && theme !== "retro")) && (
          lite
            ? <Row label="Desfoque" hint="Desligado pelo modo leve (Configurações › Sistema)." />
            : <Range label="Desfoque" value={l.blur ?? 24} min={0} max={60} onChange={(v) => set({ blur: v })} format={(v) => v + " px"} def={24} onReset={() => set({ blur: undefined })} />
        )}
        {lim.ownBg && <Row label="Este widget desenha o próprio fundo" />}
      </Group>

      {afterBackground}

      <Group title="Borda e sombra">
        <Row stack label="Borda">
          <Choice label="Borda" value={l.border ?? "theme"} onChange={(v) => set({ border: v })} options={[{ value: "theme", label: "Do tema" }, { value: "none", label: "Sem borda" }, { value: "custom", label: "Própria" }]} />
        </Row>
        {l.border === "custom" && (
          <Row stack label="Cor da borda">
            <Swatches label="Cor da borda" value={(l.borderColor ?? "#ffffff").slice(0, 7)} onChange={(v) => set({ borderColor: v })} colors={SW} />
          </Row>
        )}
        {l.border === "custom" && <Range label="Espessura" value={l.borderWidth ?? 1} min={1} max={6} onChange={(v) => set({ borderWidth: v })} format={(v) => v + " px"} />}
        <Range label="Cantos" value={l.radius ?? -1} min={-1} max={48} onChange={(v) => set({ radius: v < 0 ? undefined : v })} format={(v) => (v < 0 ? "do tema" : v + " px")} def={-1} />
        <Row stack label="Sombra">
          <Choice label="Sombra" value={l.shadow ?? "theme"} onChange={(v) => set({ shadow: v })} options={[{ value: "theme", label: "Do tema" }, { value: "none", label: "Sem" }, { value: "soft", label: "Suave" }, { value: "strong", label: "Forte" }, { value: "glow", label: "Brilho" }]} />
        </Row>
      </Group>

      <Group title="Texto e cores">
        {accentMatters && (
          <Row stack label="Cor de destaque">
            <Swatches label="Cor de destaque" auto="Do tema" value={l.accent} onChange={(v) => set({ accent: v })} colors={SW.slice(3)} />
          </Row>
        )}
        {!lim.fixedText && (
          <Row stack label="Cor do texto">
            <Swatches label="Cor do texto" auto="Do tema" value={l.text} onChange={(v) => set({ text: v })} colors={["#ffffff", "#f6e8ee", "#ffd6e8", "#1a1020", "#000000"]} />
          </Row>
        )}
        <div className="p-2">
          <FontPicker label="Fonte deste widget" value={l.font ?? ""} onChange={(f) => set({ font: f || undefined })} allowDefault defaultLabel="Do tema" sample="Meu widget" />
        </div>
      </Group>

      <Group title="Ao passar o mouse">
        <Row stack>
          <Choice label="Efeito ao passar o mouse" value={l.hover ?? "theme"} onChange={(v) => set({ hover: v })} options={[{ value: "theme", label: "Inclinar" }, { value: "none", label: "Nada" }, { value: "lift", label: "Levantar" }, { value: "glow", label: "Brilhar" }, { value: "border", label: "Borda" }]} />
        </Row>
        <Toggle label="Botões discretos" hint="Um botão pequeno de configurar, em vez de mover, configurar e remover." checked={l.chrome === "minimal"} onChange={(v) => set({ chrome: v ? "minimal" : "full" })} />
      </Group>

      <Group title="Transparência">
        <Range label="Opacidade do widget" value={config.opacity ?? 1} min={0.2} max={1} step={0.05} onChange={(v) => upd(id, { opacity: v })} format={(v) => Math.round(v * 100) + "%"} def={1} />
      </Group>
    </>
  )
}
