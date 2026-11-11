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

export function performanceBudget(options: PerfOptions, playingGame = false): PerfBudget {
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
  return { fps: 30, embedHz: 12, monitorMs: 3000, preload: "essential" }
}
