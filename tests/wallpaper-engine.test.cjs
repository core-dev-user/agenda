const { test } = require("node:test")
const assert = require("node:assert/strict")
const { isEngine, requiresTransparency, steamRoots, findExecutable } = require("../electron/wallpaper-engine.cjs")

test("Wallpaper Engine mode is optional and doesn't affect existing backgrounds", () => {
  for (const type of ["gradient", "image", "color", "video"]) {
    assert.equal(isEngine({ wallpaper: { type } }), false)
  }
  assert.equal(isEngine({ wallpaper: { type: "engine" } }), true)
})
test("per-monitor Wallpaper Engine selection is detected", () => {
  assert.equal(isEngine({
    wallpaper: { type: "gradient" },
    wallpaperBy: { "1001": { type: "video" }, "1002": { type: "engine" } },
  }), true)
  assert.equal(isEngine({ wallpaper: { type: "gradient" }, wallpaperBy: { "1002": { type: "image" } } }), false)
})
test("empty or legacy settings never enable external wallpaper implicitly", () => {
  assert.equal(isEngine({}), false)
  assert.equal(isEngine(null), false)
  assert.equal(isEngine({ wallpaper: { gradient: "ocean" } }), false)
})
test("unsupported platforms do not request native transparent windows", () => {
  if (process.platform !== "win32") {
    assert.equal(requiresTransparency("/missing/file"), false)
    assert.equal(findExecutable(), null)
  }
  assert.ok(Array.isArray(steamRoots()))
})

test("desktop layer launches without stealing focus, and Wallpaper Engine resume is opt-in", () => {
  const fs = require("node:fs")
  const path = require("node:path")
  const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8")
  const main = read("electron/main.cjs")
  const service = read("electron/wallpaper-engine.cjs")
  const settings = read("src/sections/SettingsView.tsx")
  assert.match(main, /modes\.mode\(\) === "desktop"[^\n]*win\.showInactive\(\)/)
  assert.match(service, /wallpaperEngine:resume/)
  assert.match(service, /\["-control", "play"\]/)
  assert.match(settings, /bridge\.wallpaperEngine\.resume\(\)/)
  assert.doesNotMatch(main, /wallpaperEngine\.resume\(/)
})

test("Carbono releases base64 icon cache when launcher closes", () => {
  const fs = require("node:fs")
  const path = require("node:path")
  const source = fs.readFileSync(path.join(__dirname, "../src/shell/Carbono.tsx"), "utf8")
  assert.match(source, /ICON_CACHE_BYTES = 1024 \* 1024/)
  assert.match(source, /ICON_CACHE_LIMIT = 24/)
  assert.match(source, /clearIconCache\(\)/)
  assert.match(source, /appsCache = null/)
})
