/** Configuração isolada para permitir benchmark reprodutível e testes sem Electron. */
export type PerfPreset = "auto" | "quality" | "balanced" | "economy" | "gaming" | "custom"
export type PreloadMode = "all" | "essential" | "none"
export interface PerfOptions {
  perfPreset?: PerfPreset
  perfFps?: number
  perfEmbedHz?: number
  perfMonitorMs?: number
  perfPreload?: PreloadMode
}
export interface PerfBudget {
  fps: number
  embedHz: number
  monitorMs: number
  preload: PreloadMode
}
const clamp = (value: number | undefined, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value!))) : fallback

/**
 * PC fraco: até 4 núcleos lógicos ou até 4 GB de memória (o que o navegador informa).
 * No modo automático ele recebe um orçamento mais leve sem a pessoa precisar escolher nada.
 */
export function isWeakDevice(nav: { hardwareConcurrency?: number; deviceMemory?: number } | null | undefined): boolean {
  if (!nav) return false
  const cores = nav.hardwareConcurrency ?? 8
  const mem = nav.deviceMemory ?? 8
  return cores <= 4 || mem <= 4
}
const WEAK = isWeakDevice(typeof navigator === "undefined" ? null : (navigator as { hardwareConcurrency?: number; deviceMemory?: number }))

export function performanceBudget(options: PerfOptions, playingGame = false, weak = WEAK): PerfBudget {
  const preset = options.perfPreset ?? "auto"
  if (preset === "quality") return { fps: 60, embedHz: 30, monitorMs: 1500, preload: "all" }
  if (preset === "gaming") return { fps: 12, embedHz: 6, monitorMs: 7000, preload: "none" }
  if (preset === "economy") return { fps: 15, embedHz: 6, monitorMs: 6000, preload: "none" }
  if (preset === "custom") return {
    fps: clamp(options.perfFps, 30, 5, 60),
    embedHz: clamp(options.perfEmbedHz, 12, 2, 30),
    monitorMs: clamp(options.perfMonitorMs, 3000, 1500, 8000),
    preload: options.perfPreload === "all" || options.perfPreload === "none" ? options.perfPreload : "essential",
  }
  if (preset === "auto" && playingGame) return { fps: 12, embedHz: 6, monitorMs: 6000, preload: "essential" }
  // automático num PC fraco: animações a 20 quadros, menos leituras do sistema e nada carregado antes da hora
  if (weak) return { fps: 20, embedHz: 8, monitorMs: 5000, preload: "none" }
  return { fps: 30, embedHz: 12, monitorMs: 3000, preload: "essential" }
}
