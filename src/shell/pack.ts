import { create } from "zustand"
import { useStore } from "@/lib/store"
import type { Settings } from "@/lib/types"

/**
 * Pacotes de interface: trocam o "jeito" do Widgy inteiro (barra, busca, painéis, cores e fontes) de uma vez.
 * Ao ativar, o visual atual é guardado; ao desativar, volta exatamente como estava.
 *
 * Carbono: moldura escura em volta da tela, barra fina vertical, painel que desce do topo
 * (painel, mídia, desempenho, clima) e busca que sobe da borda de baixo, com comandos ">".
 */
export type PackId = "none" | "carbono"
export type CarbonoAccent = "rose" | "ice" | "widgy" | "theme"

export interface ShellPrefs {
  pack: PackId
  /** cor de destaque dos detalhes (visualizador, barras, seleção) */
  accent?: CarbonoAccent
  /** moldura em volta da tela */
  frame?: boolean
  /** abrir o painel ao encostar o mouse no topo */
  hoverTop?: boolean
  /** abrir a busca ao encostar o mouse no meio de baixo */
  hoverBottom?: boolean
  /** player acompanhado no painel de música ("" = automático) */
  player?: string
  /** cor dos painéis (hex); vazio = carvão */
  bg?: string
  /** cor da barra lateral e da moldura (hex); vazio = a mesma dos painéis */
  railBg?: string
  /** lado da barra */
  side?: "left" | "right"
  /** visual que estava antes de ativar o pacote (para desfazer) */
  prev?: Partial<Settings>
}

export const SHELL_DEFAULT: ShellPrefs = { pack: "none", accent: "rose", frame: true, hoverTop: true, hoverBottom: true, side: "left", player: "" }
export const shellPrefs = (s: Settings): ShellPrefs => ({ ...SHELL_DEFAULT, ...(s.shell ?? {}) })

export const ACCENTS: Record<CarbonoAccent, { label: string; color: string; soft: string }> = {
  rose: { label: "Rosado", color: "#F1B9C6", soft: "#F6D3B3" },
  ice: { label: "Gelo", color: "#CFE3FF", soft: "#E9F1FF" },
  widgy: { label: "Azul Widgy", color: "#5AB0FF", soft: "#9ED4FF" },
  theme: { label: "Do tema", color: "var(--accent)", soft: "var(--accent)" },
}

/** cores prontas para os painéis e a barra */
export const SURFACES: { label: string; color: string }[] = [
  { label: "Carvão", color: "#121212" },
  { label: "Grafite", color: "#1C1D21" },
  { label: "Azul noite", color: "#0E1626" },
  { label: "Ameixa", color: "#1B1220" },
  { label: "Musgo", color: "#111A15" },
  { label: "Vinho", color: "#1F0E13" },
  { label: "Areia", color: "#E9E3DA" },
  { label: "Gelo", color: "#E8EDF3" },
]
const hex = (c: string) => /^#?[0-9a-f]{6}$/i.test(c) ? c.replace("#", "") : "121212"
/** luminância relativa (0 = preto, 1 = branco) */
export function luminance(c: string) {
  const h = hex(c)
  const ch = [0, 2, 4].map((i) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}
/**
 * Variáveis de cor a partir de uma cor de fundo: cartões um pouco mais claros (ou escuros, num fundo claro)
 * e texto que continua legível em qualquer cor.
 */
export function surfaceVars(bg: string): Record<string, string> {
  const c = "#" + hex(bg)
  const light = luminance(c) > 0.4
  const mix = (pct: number) => `color-mix(in srgb, ${c} ${100 - pct}%, ${light ? "#000" : "#fff"})`
  return {
    bg: c, s1: mix(light ? 5 : 4), s2: mix(light ? 9 : 8), s3: mix(light ? 14 : 13),
    fg: light ? "#1A1718" : "#ECE7E8", muted: light ? "#5E585A" : "#9C9597", dim: light ? "#8E8789" : "#6B6668",
    line: light ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.06)", onAccent: light ? "#FFFFFF" : "#141414",
  }
}

/** o que o pacote muda (e o que é guardado para desfazer) */
const LOOK_KEYS = ["theme", "dark", "accent", "uiFont", "numFont", "displayFont", "radius", "blur", "surfaceOpacity", "cursorStyle", "cursorEffect", "taskbar", "overlay", "sakura"] as const

/** rail: 48 px de largura = tamanho 32 + 16 de respiro, o mesmo cálculo da barra normal (os widgets e as janelas desviam dela) */
export const RAIL = 48
export const FRAME = 8
export const CORNER = 22

export function applyCarbono() {
  const st = useStore.getState()
  const s = st.settings
  const cur = shellPrefs(s)
  if (cur.pack === "carbono") return
  const prev: Partial<Settings> = {}
  for (const k of LOOK_KEYS) (prev as Record<string, unknown>)[k] = JSON.parse(JSON.stringify(s[k]))
  st.setSettings({
    theme: "minimal",
    dark: luminance(cur.bg || "#121212") <= 0.4,
    accent: luminance(cur.bg || "#121212") <= 0.4 ? "#E6DFE1" : "#3A3436",
    uiFont: "gf-rubik",
    numFont: "gf-rubik",
    displayFont: "gf-rubik",
    radius: 18,
    blur: 0,
    surfaceOpacity: 0.94,
    cursorStyle: "system",
    cursorEffect: "none",
    taskbar: { ...s.taskbar, position: cur.side ?? "left", style: "bar", size: RAIL - 16, autoHide: false, magnify: false, showLabels: false },
    overlay: { ...s.overlay, scanlines: false, grain: false, vignette: false },
    sakura: { ...s.sakura, ambient: false },
    shell: { ...cur, pack: "carbono", prev },
  })
}

export function removePack() {
  const st = useStore.getState()
  const cur = shellPrefs(st.settings)
  if (cur.pack === "none") return
  st.setSettings({ ...(cur.prev ?? {}), shell: { ...cur, pack: "none", prev: undefined } })
}

export function setShellPrefs(p: Partial<ShellPrefs>) {
  const st = useStore.getState()
  const cur = shellPrefs(st.settings)
  const next = { ...cur, ...p }
  const patch: Partial<Settings> = { shell: next }
  if (cur.pack === "carbono") {
    if (p.side && p.side !== cur.side) patch.taskbar = { ...st.settings.taskbar, position: p.side }
    // janelas do Widgy usam a cor dos painéis: num painel claro o texto delas precisa ficar escuro (modo claro)
    if (p.bg !== undefined) {
      const dark = luminance(p.bg || "#121212") <= 0.4
      patch.dark = dark
      // destaque neutro do Widgy: claro sobre painel escuro, escuro sobre painel claro
      patch.accent = dark ? "#E6DFE1" : "#3A3436"
    }
  }
  st.setSettings(patch)
}

/** painéis do pacote abertos agora (a busca usa o mesmo `paletteOpen` do Ctrl+K) */
export type DashTab = "dash" | "media" | "perf" | "weather"
export const useShell = create<{ dash: boolean; tab: DashTab; power: boolean }>(() => ({ dash: false, tab: "dash", power: false }))
export const openDash = (tab?: DashTab) => useShell.setState((s) => ({ dash: true, tab: tab ?? s.tab }))
export const closeDash = () => useShell.setState({ dash: false })
