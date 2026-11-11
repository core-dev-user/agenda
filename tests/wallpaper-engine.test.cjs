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
