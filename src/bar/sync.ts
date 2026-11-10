import { useEffect, useState } from "react"
import { bridge, type BarSync } from "@/lib/bridge"
import { ensureFontFamily } from "@/lib/fonts"

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
  }, [s])
  return s
}

export const exeKey = (p: string) => p.toLowerCase()
