/** Configuração isolada para permitir benchmark reprodutível e testes sem Electron. */
export type PerfPreset = "auto" | "quality" | "balanced" | "economy" | "gaming" | "custom"
export type PreloadMode = "all" | "essential" | "none"
export interface PerfOptions {
  perfPreset?: PerfPreset
  perfFps?: number
  perfEmbedHz?: number
  perfPreload?: PreloadMode
}
export interface PerfBudget {
  fps: number
  embedHz: number
  preload: PreloadMode
}
const clamp = (value: number | undefined, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value!))) : fallback

export function performanceBudget(options: PerfOptions, playingGame = false): PerfBudget {
  const preset = options.perfPreset ?? "auto"
  if (preset === "quality") return { fps: 60, embedHz: 30, preload: "all" }
  if (preset === "gaming") return { fps: 12, embedHz: 6, preload: "none" }
  if (preset === "economy") return { fps: 15, embedHz: 6, preload: "none" }
  if (preset === "custom") return {
    fps: clamp(options.perfFps, 30, 5, 60),
    embedHz: clamp(options.perfEmbedHz, 12, 2, 30),
    preload: options.perfPreload === "all" || options.perfPreload === "none" ? options.perfPreload : "essential",
  }
  if (preset === "auto" && playingGame) return { fps: 12, embedHz: 6, preload: "essential" }
  return { fps: 30, embedHz: 12, preload: "essential" }
}
