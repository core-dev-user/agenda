import { create } from "zustand"
import type { UiMode } from "./bridge"

/** Modo de uso escolhido na instalação ("" = ainda não escolheu → boas-vindas). Lido uma vez ao abrir. */
export const useUiMode = create<{ mode: UiMode | ""; monitors: number; mainBar: boolean; barError?: string }>(() => ({ mode: "screen", monitors: 1, mainBar: false }))

export const MODE_INFO: Record<UiMode, { label: string; desc: string }> = {
  app: { label: "Aplicativo", desc: "Uma janela normal com as abas (Hoje, Hábitos, Finanças…). Abre e fecha como qualquer programa." },
  desktop: { label: "Área de trabalho", desc: "O Agenda vira a sua área de trabalho: papel de parede vivo e widgets atrás das janelas. Pode usar a barra do Agenda como barra principal do PC." },
  screen: { label: "Tela própria", desc: "Tela cheia com a barra do Agenda, como um sistema à parte. Ótimo para um segundo monitor." },
}
