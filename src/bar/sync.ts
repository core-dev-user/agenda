import { useEffect, useState } from "react"
import { bridge, type BarSync } from "@/lib/bridge"
import { ensureFontFamily } from "@/lib/fonts"
import { ACCENTS, surfaceVars, type CarbonoAccent } from "@/shell/colorTokens"

/** aparência, fixados e avisos que a janela principal manda (a barra não lê os dados do app direto) */
export function useBarSync() {
  const [s, setS] = useState<BarSync | null>(null)
  useEffect(() => {
    bridge.bar.hello().then((d) => d && setS(d))
    return bridge.bar.onSync(setS)
  }, [])
  useEffect(() => {
    if (!s) return
    const r = document.documentElement
    for (const [k, v] of Object.entries(s.vars)) {
      r.style.setProperty(k, v)
      if (k === "--font-ui" || k === "--font-num" || k === "--font-display") ensureFontFamily(v)
    }
    r.dataset.theme = s.theme
    r.classList.toggle("dark", s.dark)
    r.style.fontSize = 16 * s.fontScale + "px"
    if (s.pack === "carbono") {
      r.dataset.pack = "carbono"
      const panel = surfaceVars(s.shell?.bg || "#121212")
      const rail = surfaceVars(s.shell?.railBg || s.shell?.bg || "#121212")
      const apply = (prefix: string, palette: ReturnType<typeof surfaceVars>) => {
        for (const [key, value] of Object.entries(palette)) {
          if (key === "onAccent") continue
          r.style.setProperty("--" + prefix + key, value)
        }
      }
      apply("sh-", panel)
      apply("sh-rail-", rail)
      // A barra é outra janela Electron; não herda os estilos da janela principal.
      // Contraste, fundo, menus e ícones devem acompanhar as cores personalizadas.
      r.style.setProperty("--fg", rail.fg)
      r.style.setProperty("--fg-muted", rail.muted)
      r.style.setProperty("--line", rail.line)
      const accent = ACCENTS[(s.shell?.accent as CarbonoAccent) || "rose"] ?? ACCENTS.rose
      r.style.setProperty("--sh-accent", accent.color)
      if (s.shell?.accent !== "theme") r.style.setProperty("--accent", accent.color)
    } else {
      delete r.dataset.pack
    }
  }, [s])
  return s
}

export const exeKey = (p: string) => p.toLowerCase()
