import type { CSSProperties } from "react"
import { Copy, RotateCcw } from "lucide-react"
import { useStore } from "@/lib/store"
import { FONTS, fontFamily } from "@/lib/fonts"
import { ColorPicker, Segmented, Slider } from "@/components/ui/controls"
import { cn } from "@/lib/utils"

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

/** Seção "Aparência deste widget" da janela de configurar. */
export function LookSettings({ id, config }: { id: string; config: Record<string, any> }) {
  const upd = useStore((s) => s.updateWidgetConfig)
  const l = lookOfWidget(config)
  const set = (p: Partial<WidgetLook>) => upd(id, { look: { ...l, ...p }, bare: undefined })
  const surf = l.surface ?? "theme"
  const presetOn = (pl: WidgetLook) => JSON.stringify(pl) === JSON.stringify(config.look ?? {})
  const copyAll = () => {
    const st = useStore.getState()
    if (!confirm("Usar esta aparência em todos os widgets?")) return
    for (const x of st.widgets) if (x.id !== id) st.updateWidgetConfig(x.id, { look: { ...l }, bare: undefined })
  }
  return (
    <div className="space-y-3 border-t border-line pt-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Aparência deste widget</span>
        <div className="flex gap-1.5">
          <button className="btn !px-2 !py-1 text-xs" onClick={copyAll} title="Aplicar em todos os widgets"><Copy size={12} /> Em todos</button>
          <button className="btn !px-2 !py-1 text-xs" onClick={() => upd(id, { look: undefined, bare: undefined })} title="Voltar ao padrão do tema"><RotateCcw size={12} /> Padrão</button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {LOOK_PRESETS.map((p) => (
          <button key={p.id} onClick={() => upd(id, { look: { ...p.look }, bare: undefined })} className={cn("flex flex-col items-center gap-1 rounded-xl p-1.5 text-[11px]", presetOn(p.look) ? "bg-brand/20 ring-1 ring-brand" : "hover:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]")}>
            <span className="h-9 w-full rounded-lg" style={p.preview} />
            {p.label}
          </button>
        ))}
      </div>

      <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Fundo</div>
      <Segmented value={surf} onChange={(v) => set({ surface: v })} options={[{ value: "theme", label: "Do tema" }, { value: "glass", label: "Vidro" }, { value: "solid", label: "Sólido" }, { value: "none", label: "Nenhum" }]} />
      {(surf === "glass" || surf === "solid") && (
        <>
          <ColorPicker value={l.bgColor ?? "#141018"} onChange={(v) => set({ bgColor: v })} swatches={SW} />
          <Slider label="Opacidade do fundo" value={l.bgAlpha ?? (surf === "solid" ? 0.92 : 0.28)} min={0} max={1} step={0.02} onChange={(v) => set({ bgAlpha: v })} format={(v) => Math.round(v * 100) + "%"} />
        </>
      )}
      {surf !== "none" && surf !== "solid" && <Slider label="Desfoque do vidro" value={l.blur ?? 24} min={0} max={60} onChange={(v) => set({ blur: v })} format={(v) => v + "px"} />}

      <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Borda e forma</div>
      <Segmented value={l.border ?? "theme"} onChange={(v) => set({ border: v })} options={[{ value: "theme", label: "Do tema" }, { value: "none", label: "Sem borda" }, { value: "custom", label: "Escolher cor" }]} />
      {l.border === "custom" && (
        <>
          <ColorPicker value={(l.borderColor ?? "#ffffff").slice(0, 7)} onChange={(v) => set({ borderColor: v })} swatches={SW} />
          <Slider label="Espessura da borda" value={l.borderWidth ?? 1} min={1} max={6} onChange={(v) => set({ borderWidth: v })} format={(v) => v + "px"} />
        </>
      )}
      <Slider label="Cantos arredondados" value={l.radius ?? -1} min={-1} max={48} onChange={(v) => set({ radius: v < 0 ? undefined : v })} format={(v) => (v < 0 ? "do tema" : v + "px")} />
      <Segmented value={l.shadow ?? "theme"} onChange={(v) => set({ shadow: v })} options={[{ value: "theme", label: "Sombra do tema" }, { value: "none", label: "Sem sombra" }, { value: "soft", label: "Suave" }, { value: "strong", label: "Forte" }, { value: "glow", label: "Brilho" }]} />

      <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Ao passar o mouse</div>
      <Segmented value={l.hover ?? "theme"} onChange={(v) => set({ hover: v })} options={[{ value: "theme", label: "Inclinar e reflexo" }, { value: "none", label: "Nada" }, { value: "lift", label: "Levantar" }, { value: "glow", label: "Brilhar" }, { value: "border", label: "Acender a borda" }]} />
      <Segmented value={l.chrome ?? "full"} onChange={(v) => set({ chrome: v })} options={[{ value: "full", label: "Botões mover / configurar / remover" }, { value: "minimal", label: "Só um botão discreto" }]} />

      <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Cores e fonte</div>
      <div className="flex items-center justify-between gap-3 text-sm">
        Cor de destaque
        <div className="flex items-center gap-2">
          <ColorPicker value={l.accent ?? "#ff8fb8"} onChange={(v) => set({ accent: v })} swatches={SW.slice(3)} />
          {l.accent && <button className="text-xs text-fg-muted hover:text-fg" onClick={() => set({ accent: undefined })}>do tema</button>}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        Cor do texto
        <div className="flex items-center gap-2">
          <ColorPicker value={l.text ?? "#ffffff"} onChange={(v) => set({ text: v })} swatches={["#ffffff", "#f6e8ee", "#ffd6e8", "#1a1020", "#000000"]} />
          {l.text && <button className="text-xs text-fg-muted hover:text-fg" onClick={() => set({ text: undefined })}>do tema</button>}
        </div>
      </div>
      <label className="block text-sm">Fonte
        <select className="field mt-1 w-full" value={l.font ?? ""} onChange={(e) => set({ font: e.target.value || undefined })}>
          <option value="">Do tema</option>
          {FONTS.map((f) => <option key={f.id} value={f.id} style={{ fontFamily: f.family }}>{f.label}</option>)}
        </select>
      </label>
    </div>
  )
}
