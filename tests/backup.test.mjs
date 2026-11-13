import { test } from "node:test"
import assert from "node:assert/strict"
import { buildBackup, parseBackup } from "../src/lib/backup.ts"

const defaults = { theme: "glass", dark: true, radius: 22, accent: "#4f9cff", taskbar: { position: "bottom", size: 56, autoHide: false }, wallpaper: { type: "gradient" }, sakura: { ambient: true }, overlay: { grain: false }, shell: undefined }
const o = { defaults, widgetTypes: ["clock", "note"], oneOf: { theme: ["glass", "metal", "retro", "terminal", "minimal"] } }
const parse = (v) => parseBackup(typeof v === "string" ? v : JSON.stringify(v), o)

test("files that are not a backup are refused and nothing is returned to apply", () => {
  for (const bad of ["", "not json", "[]", "null", "42", '"texto"', "{}", '{"foo":1}', '{"windows":[],"paletteOpen":true}']) {
    const r = parse(bad)
    assert.equal(r.ok, false, bad)
    assert.ok(r.error.length > 10)
  }
})
test("only known data keys pass: app state cannot be injected through a backup", () => {
  const r = parse({ settings: {}, windows: [{ id: "x" }], splashDone: false, setSettings: "x", __proto__: { polluted: 1 }, widgets: [] })
  assert.equal(r.ok, true)
  assert.deepEqual(Object.keys(r.data).sort(), ["settings", "widgets"])
})
test("settings with the wrong type fall back to the default instead of breaking the app", () => {
  const r = parse({ settings: { theme: "hacker", dark: "sim", radius: null, accent: "#ff0000", taskbar: null, wallpaper: { type: 7, image: "a.png" }, sakura: "x" } })
  assert.equal(r.ok, true)
  const s = r.data.settings
  assert.equal(s.theme, "glass")
  assert.equal(s.dark, true)
  assert.equal(s.radius, 22)
  assert.equal(s.accent, "#ff0000") // o que é válido entra
  assert.deepEqual(s.taskbar, defaults.taskbar)
  assert.deepEqual(s.wallpaper, { type: "gradient", image: "a.png" })
  assert.deepEqual(s.sakura, defaults.sakura)
  assert.ok(r.warnings.some((w) => /padrão/.test(w)))
})
test("an old backup gains the settings it does not have", () => {
  const r = parse({ settings: { theme: "metal", taskbar: { size: 40 } }, habits: [{ id: "h" }] })
  assert.equal(r.data.settings.theme, "metal")
  assert.deepEqual(r.data.settings.taskbar, { position: "bottom", size: 40, autoHide: false })
  assert.equal(r.data.settings.radius, 22)
  assert.deepEqual(r.data.settings.overlay, defaults.overlay)
})
test("unknown or broken widgets are left out, valid ones stay", () => {
  const r = parse({ widgets: [{ id: "a", type: "clock", x: 1, y: 2, w: 3, h: 4 }, { id: "b", type: "virus", x: 1, y: 2, w: 3, h: 4 }, { id: "c", type: "note", x: "1", y: 2, w: 3, h: 4 }, "lixo", null, { id: "d", type: "note", x: 0, y: 0, w: 9, h: 9, config: { text: "oi" } }] })
  assert.equal(r.ok, true)
  assert.deepEqual(r.data.widgets.map((w) => w.id), ["a", "d"])
  assert.deepEqual(r.data.widgets[0].config, {})
  assert.ok(r.warnings.some((w) => /4 widget/.test(w)))
})
test("wrongly shaped collections are ignored with a warning", () => {
  const r = parse({ settings: {}, habits: "nenhum", habitLog: [1, 2], tasks: [{ id: "t" }, 5] })
  assert.equal(r.ok, true)
  assert.equal("habits" in r.data, false)
  assert.equal("habitLog" in r.data, false)
  assert.deepEqual(r.data.tasks, [{ id: "t" }])
  assert.equal(r.warnings.length, 3)
})
test("what is exported comes back the same when imported", () => {
  const state = { settings: { ...defaults, theme: "retro", shell: { pack: "carbono" } }, widgets: [{ id: "a", type: "clock", x: 1, y: 2, w: 3, h: 4, config: { style: "flip" } }], media: [{ id: "m" }], habits: [{ id: "h" }], habitLog: { "2026-01-01": ["h"] }, subjects: [], services: [], lists: [{ id: "l" }], tasks: [], templates: [], valTemplates: [{ id: "v" }], photoGalleries: [{ id: "g" }], listening: { plays: 3 }, gaming: { sessions: [] }, windows: [{ id: "w" }], paletteOpen: true }
  const file = buildBackup(state, new Date("2026-01-02T03:04:05Z"))
  assert.equal(file.app, "widgy")
  assert.equal("windows" in file, false)
  const r = parse(file)
  assert.equal(r.ok, true)
  assert.deepEqual(r.warnings, [])
  for (const k of ["widgets", "media", "habits", "habitLog", "lists", "valTemplates", "photoGalleries", "listening", "gaming"]) assert.deepEqual(r.data[k], state[k], k)
  assert.deepEqual(JSON.parse(JSON.stringify(r.data.settings)), JSON.parse(JSON.stringify(state.settings)))
  assert.match(r.summary, /configurações, 1 widgets, 1 hábitos, 1 listas/)
})
test("keys that would tamper with the object itself are dropped", () => {
  const r = parse('{"settings":{"__proto__":{"dark":false,"hacked":true},"constructor":"x","taskbar":{"__proto__":{"size":1}}}}')
  assert.equal(r.ok, true)
  assert.equal(r.data.settings.hacked, undefined)
  assert.equal(Object.getPrototypeOf(r.data.settings), Object.prototype)
  assert.equal(r.data.settings.taskbar.size, 56)
  assert.equal(typeof r.data.settings.constructor, "function")
})
test("a list with nothing usable never wipes what the user has", () => {
  const r = parse({ settings: {}, widgets: [{ id: "b", type: "virus", x: 1, y: 2, w: 3, h: 4 }], habits: [1, 2] })
  assert.equal(r.ok, true)
  assert.equal("widgets" in r.data, false)
  assert.equal("habits" in r.data, false)
  assert.equal(r.warnings.filter((w) => /foi mantido/.test(w)).length, 2)
  assert.equal(parse({ widgets: [{ type: "virus" }] }).ok, false)
  assert.deepEqual(parse({ widgets: [] }).data.widgets, []) // lista vazia de verdade continua valendo
})
