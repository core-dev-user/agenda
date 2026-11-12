import { create } from "zustand"
import { useStore } from "@/lib/store"
import type { Settings } from "@/lib/types"
import { luminance } from "./colorTokens"
import type { CarbonoAccent } from "./colorTokens"
export { ACCENTS, SURFACES, luminance, surfaceVars } from "./colorTokens"
export type { CarbonoAccent } from "./colorTokens"

/**
 * Pacotes de interface: trocam o "jeito" do Widgy inteiro (barra, busca, painéis, cores e fontes) de uma vez.
 * Ao ativar, o visual atual é guardado; ao desativar, volta exatamente como estava.
 *
 * Carbono: moldura escura em volta da tela, barra fina vertical, painel que desce do topo
 * (painel, mídia, desempenho, clima) e busca que sobe da borda de baixo, com comandos ">".
 */
export type PackId = "none" | "carbono"

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

/** o que o pacote muda (e o que é guardado para desfazer) */
const LOOK_KEYS = ["theme", "dark", "accent", "uiFont", "numFont", "displayFont", "radius", "blur", "surfaceOpacity", "cursorStyle", "cursorEffect", "taskbar", "overlay", "sakura"] as const

/** Rail compacto do Carbono: 36 px, incluindo os 16 px de respiro nativo. */
export const RAIL = 36
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
