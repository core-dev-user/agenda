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

test("Carbono renders local monochrome vector icons, without base64 Windows logos", () => {
  const fs = require("node:fs")
  const path = require("node:path")
  const source = fs.readFileSync(path.join(__dirname, "../src/shell/Carbono.tsx"), "utf8")
  assert.match(source, /MonoAppIcon/)
  assert.match(source, /MonoSectionIcon/)
  assert.doesNotMatch(source, /bridge\.bar\.icon\(/)
  assert.doesNotMatch(source, /<img src=\{src\}/)
})

test("desktop transparente do Widgy é não ativável em segundo plano e recupera foco para abas", () => {
  const fs = require("node:fs")
  const path = require("node:path")
  const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8")
  const helper = read("electron/winhelper.cjs")
  const mode = read("electron/mode.cjs")
  const main = read("electron/main.cjs")
  assert.match(helper, /WS_EX_NOACTIVATE \| WS_EX_TOOLWINDOW/)
  assert.match(helper, /public static void DesktopPassive\(string s\)/)
  assert.match(helper, /public static void DesktopInteractive\(string s\)/)
  assert.match(helper, /'passive'\s+\{ \[AgWin\]::DesktopPassive/)
  assert.match(helper, /'interactive'\s+\{ \[AgWin\]::DesktopInteractive/)
  assert.match(mode, /function attach\(win, externalWallpaper = false\)/)
  assert.match(mode, /setPassive\(true\)/)
  assert.match(mode, /setPassive\(false\)/)
  assert.match(main, /modes\.attach\(win, externalWallpaper\)/)
  // Outros wallpapers, modo aplicativo e modo tela não devem receber esses flags.
  assert.match(mode, /if \(!externalWallpaper \|\| passive === on/)
  assert.doesNotMatch(main, /wallpaperEngine\.resume\(/)
})

test("keeper asks Wallpaper Engine to keep playing, but not during a game", async () => {
  const { createKeeper } = require("../electron/wallpaper-engine.cjs")
  const calls = []
  let game = false
  const keeper = createKeeper({
    every: 40, isEnabled: () => true, findExe: () => "wallpaper64.exe", playing: () => game,
    run: (exe, args, _o, done) => { calls.push([exe, ...args]); setTimeout(done, 5) },
  })
  keeper.start()
  await new Promise((r) => setTimeout(r, 130))
  assert.ok(calls.length >= 2, "should send play periodically, got " + calls.length)
  assert.deepEqual(calls[0], ["wallpaper64.exe", "-control", "play"])
  game = true
  const before = calls.length
  await new Promise((r) => setTimeout(r, 120))
  assert.equal(calls.length, before, "must not insist while a game is running")
  keeper.stop()
})
test("keeper does nothing outside the Wallpaper Engine desktop mode", async () => {
  const { createKeeper } = require("../electron/wallpaper-engine.cjs")
  let n = 0
  const keeper = createKeeper({ every: 20, isEnabled: () => false, findExe: () => "x", run: (_e, _a, _o, done) => { n++; done() } })
  keeper.start()
  await new Promise((r) => setTimeout(r, 80))
  keeper.stop()
  assert.equal(n, 0)
})
