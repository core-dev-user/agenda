import { useEffect, useState } from "react"
import { create } from "zustand"

/**
 * Modo imersivo: algo está ocupando a tela inteira (transmissão expandida, vídeo em tela cheia).
 * Enquanto ele está ligado, a barra do Widgy, a barra lateral e a moldura do Carbono somem.
 */
export const useImmersive = create<{ on: boolean }>(() => ({ on: false }))

/** imersivo pelo Widgy ou por um elemento em tela cheia do navegador */
export function useIsImmersive() {
  const on = useImmersive((s) => s.on)
  const [fs, setFs] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement)
  useEffect(() => {
    const f = () => setFs(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", f)
    return () => document.removeEventListener("fullscreenchange", f)
  }, [])
  return on || fs
}
