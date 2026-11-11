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
  /** lado da barra */
  side?: "left" | "right"
  /** visual que estava antes de ativar o pacote (para desfazer) */
  prev?: Partial<Settings>
}

export const SHELL_DEFAULT: ShellPrefs = { pack: "none", accent: "rose", frame: true, hoverTop: true, side: "left" }
export const shellPrefs = (s: Settings): ShellPrefs => ({ ...SHELL_DEFAULT, ...(s.shell ?? {}) })

export const ACCENTS: Record<CarbonoAccent, { label: string; color: string; soft: string }> = {
  rose: { label: "Rosado", color: "#F1B9C6", soft: "#F6D3B3" },
  ice: { label: "Gelo", color: "#CFE3FF", soft: "#E9F1FF" },
  widgy: { label: "Azul Widgy", color: "#5AB0FF", soft: "#9ED4FF" },
  theme: { label: "Do tema", color: "var(--accent)", soft: "var(--accent)" },
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
    dark: true,
    accent: "#E6DFE1",
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
  st.setSettings(p.side && p.side !== cur.side && cur.pack === "carbono"
    ? { shell: next, taskbar: { ...st.settings.taskbar, position: p.side } }
    : { shell: next })
}

/** painéis do pacote abertos agora (a busca usa o mesmo `paletteOpen` do Ctrl+K) */
export type DashTab = "dash" | "media" | "perf" | "weather"
export const useShell = create<{ dash: boolean; tab: DashTab; power: boolean }>(() => ({ dash: false, tab: "dash", power: false }))
export const openDash = (tab?: DashTab) => useShell.setState((s) => ({ dash: true, tab: tab ?? s.tab }))
export const closeDash = () => useShell.setState({ dash: false })
