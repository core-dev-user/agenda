const { test } = require("node:test")
const assert = require("node:assert/strict")

let modulePromise = import("../src/lib/perf-policy.ts")
const budget = async (settings, game = false) => (await modulePromise).performanceBudget(settings, game)

test("automatic: balanced when idle, throttles visuals while a game runs", async () => {
  assert.deepEqual(await budget({}), { fps: 30, embedHz: 12, monitorMs: 3000, preload: "essential" })
  assert.deepEqual(await budget({ perfPreset: "auto" }, true), { fps: 12, embedHz: 6, monitorMs: 6000, preload: "essential" })
})
test("quality benchmark keeps full FPS and all preloads", async () => {
  assert.deepEqual(await budget({ perfPreset: "quality" }), { fps: 60, embedHz: 30, monitorMs: 1500, preload: "all" })
  assert.deepEqual(await budget({ perfPreset: "quality" }, true), { fps: 60, embedHz: 30, monitorMs: 1500, preload: "all" })
})
test("economy and gaming do not preload heavy sections", async () => {
  assert.deepEqual(await budget({ perfPreset: "economy" }), { fps: 15, embedHz: 6, monitorMs: 6000, preload: "none" })
  assert.deepEqual(await budget({ perfPreset: "gaming" }), { fps: 12, embedHz: 6, monitorMs: 7000, preload: "none" })
})
test("custom keeps values within safe and nonzero bounds", async () => {
  assert.deepEqual(await budget({ perfPreset: "custom", perfFps: 999, perfEmbedHz: -1, perfPreload: "none" }), { fps: 60, embedHz: 2, monitorMs: 3000, preload: "none" })
  assert.deepEqual(await budget({ perfPreset: "custom", perfFps: 5, perfEmbedHz: 4, perfPreload: "all" }), { fps: 5, embedHz: 4, monitorMs: 3000, preload: "all" })
  assert.deepEqual(await budget({ perfPreset: "custom", perfFps: NaN, perfEmbedHz: Infinity, perfPreload: "garbage" }), { fps: 30, embedHz: 12, monitorMs: 3000, preload: "essential" })
})
test("stored profiles never overwrite unrelated app settings", async () => {
  const original = { perfPreset: "gaming", perfFps: 30, perfEmbedHz: 12, wallpaper: { type: "engine" }, musicAutostart: false }
  assert.deepEqual(await budget(original), { fps: 12, embedHz: 6, monitorMs: 7000, preload: "none" })
  assert.deepEqual(original.wallpaper, { type: "engine" })
})

test("monitor refresh has a safe lower and upper bound", async () => {
  assert.equal((await budget({ perfPreset: "custom", perfMonitorMs: 0 })).monitorMs, 1500)
  assert.equal((await budget({ perfPreset: "custom", perfMonitorMs: 40000 })).monitorMs, 8000)
  assert.equal((await budget({ perfPreset: "custom", perfMonitorMs: 4000 })).monitorMs, 4000)
})
