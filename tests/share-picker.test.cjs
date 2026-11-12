const { test } = require("node:test")
const assert = require("node:assert/strict")
const { createPicker } = require("../electron/share.cjs")

const SOURCES = [{ id: "screen:0:0", name: "Tela 1" }, { id: "window:1234:0", name: "Jogo" }]

test("without an explicit choice nothing is captured (no silent full-screen fallback)", () => {
  assert.equal(createPicker().take(SOURCES), null)
})
test("a choice is granted once and then consumed", () => {
  const p = createPicker()
  p.pick("window:1234:0")
  assert.equal(p.take(SOURCES).name, "Jogo")
  assert.equal(p.take(SOURCES), null)
})
test("a stale choice (older than 30 s) is refused", () => {
  let now = 1000
  const p = createPicker(() => now)
  p.pick("screen:0:0")
  now += 30001
  assert.equal(p.take(SOURCES), null)
})
test("malformed ids and sources that no longer exist are refused", () => {
  const p = createPicker()
  p.pick("../../etc"); assert.equal(p.take(SOURCES), null)
  p.pick({ id: "screen:0:0" }); assert.equal(p.take(SOURCES), null)
  p.pick("window:9999:0"); assert.equal(p.take(SOURCES), null)
})
