// O que o Widgy faz enquanto um jogo está aberto: nada que possa derrubar, minimizar ou chamar a atenção do anti-cheat.
const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8")
const fsState = require("../electron/fullscreen-state.cjs")

test("work deferred during another program's fullscreen runs once it ends, only the latest per key", () => {
  fsState._reset()
  const ran = []
  assert.equal(fsState.whenFree("a", () => ran.push("a0")), true) // sem tela cheia: roda na hora
  fsState.set(true)
  assert.equal(fsState.whenFree("a", () => ran.push("a1")), false)
  fsState.whenFree("a", () => ran.push("a2"))
  fsState.whenFree("b", () => ran.push("b1"))
  assert.deepEqual(ran, ["a0"])
  fsState.set(true) // repetir o mesmo estado não roda nada
  assert.deepEqual(ran, ["a0"])
  fsState.set(false)
  assert.deepEqual(ran, ["a0", "a2", "b1"])
  assert.deepEqual(fsState.pendingKeys(), [])
  fsState._reset()
})

test("the game scan no longer reads every process's command line (only javaw.exe, for Minecraft Java)", () => {
  const ps = read("electron/games.cjs").match(/const PS = `([^`]+)`/)[1]
  // a consulta geral não pede CommandLine; a única que pede é filtrada pelo javaw.exe
  const queries = [...ps.matchAll(/Get-CimInstance Win32_Process([^|;]*)/g)].map((m) => m[1])
  assert.equal(queries.length, 2)
  for (const q of queries) if (/CommandLine/.test(q)) assert.match(q, /-Filter "Name='javaw\.exe'"/)
  assert.ok(queries.some((q) => !/CommandLine/.test(q) && /ExecutablePath/.test(q)))
})

test("the bar only touches the Windows taskbar when it came back, not every second", () => {
  const cs = read("electron/winhelper.cjs")
  const heal = cs.slice(cs.indexOf("static void Heal()"), cs.indexOf("public static void PeekTray"))
  assert.match(heal, /foreach \(var t in Trays\(\)\) if \(IsWindowVisible\(t\) \|\| /)
})

test("screen rearrangement waits while another program is fullscreen", () => {
  const bar = read("electron/bar.cjs"), mode = read("electron/mode.cjs")
  assert.match(bar, /fsState\.whenFree\("bar-rebuild"/)
  assert.match(bar, /fsState\.whenFree\("bar-layout"/)
  assert.match(bar, /fsState\.set\(nextForeground\.fullscreen\)/)
  assert.match(mode, /fsState\.whenFree\("desk-fit", fit\)/)
  assert.match(mode, /if \(fsState\.get\(\)\) \{ fsState\.whenFree\("desk-fit", fit\); return false \}/)
})

test("Wallpaper Engine is not forced to play during a game or another program's fullscreen", () => {
  assert.match(read("electron/main.cjs"), /createKeeper\(\{ userDir, playing: \(\) => !!require\("\.\/games\.cjs"\)\.playing\(\) \|\| require\("\.\/fullscreen-state\.cjs"\)\.get\(\) \}\)/)
  const { createKeeper } = require("../electron/wallpaper-engine.cjs")
  const calls = []
  let full = true
  const k = createKeeper({ userDir: "x", playing: () => full, every: 10, run: (...a) => calls.push(a), isEnabled: () => true, findExe: () => "we.exe" })
  k.start(); k.nudge(0)
  return new Promise((r) => setTimeout(() => {
    assert.equal(calls.length, 0, "não toca com tela cheia")
    full = false
    setTimeout(() => { k.stop(); assert.ok(calls.length > 0, "volta a tocar quando a tela cheia acaba"); r() }, 40)
  }, 40))
})

test("animations and video pause with any fullscreen program in front, not only known games", () => {
  const perf = read("src/lib/perf.ts")
  assert.match(perf, /const inGame = \(s: [^)]*\) => s\.gamesRunning\.length > 0 \|\| !!s\.fullscreenOther/)
  assert.doesNotMatch(perf, /s\.gamesRunning\.length > 0\)/, "todo cálculo de desempenho passa por inGame")
  assert.match(read("src/lib/gaming.ts"), /fullscreenOther: !!st\.fullscreen/)
  assert.match(read("electron/games.cjs"), /fullscreen: fsState\.get\(\)/)
})
