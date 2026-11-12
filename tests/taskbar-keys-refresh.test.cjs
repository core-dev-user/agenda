// O Windows remove ganchos de teclado em silêncio; o Widgy pede a reinstalação ("rehook").
const { test } = require("node:test")
const assert = require("node:assert/strict")
const { EventEmitter } = require("node:events")
const fs = require("node:fs")
const path = require("node:path")

function harness() {
  const app = new EventEmitter(), children = [], written = []
  const imports = {
    electron: { app },
    "node:fs": { writeFileSync() {} },
    "node:child_process": { spawn() {
      const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter()
      c.stdin = { write: (l) => written.push(String(l).trim()), end() {} }; c.kill = () => c.emit("exit", 1)
      children.push(c); return c
    } },
  }
  const module = { exports: {} }
  new Function("require", "module", "exports", "process", fs.readFileSync(path.join(__dirname, "../electron/keys.cjs"), "utf8"))((n) => imports[n] || require(n), module, module.exports, { platform: "win32" })
  return { api: module.exports, children, written }
}

test("refresh asks the running hook process to reinstall the hook", () => {
  const h = harness()
  h.api.enable(true)
  h.children[0].stdout.emit("data", "ready\n")
  h.written.length = 0
  h.api.refresh()
  assert.deepEqual(h.written, ["rehook"])
})
test("refresh does nothing while the hook is off (game in front) or not started", () => {
  const h = harness()
  h.api.refresh()
  assert.equal(h.children.length, 0)
  h.api.enable(true)
  h.children[0].stdout.emit("data", "ready\n")
  h.api.enable(false)
  h.written.length = 0
  h.api.refresh()
  assert.deepEqual(h.written, [])
})
test("the native side reinstalls before removing the old hook and never mid Windows-key press", () => {
  const src = fs.readFileSync(path.join(__dirname, "../electron/keys.cjs"), "utf8")
  const block = src.slice(src.indexOf("m.msg == 0x8001"), src.indexOf("public static void Rehook"))
  assert.match(block, /!winHeld/)
  assert.ok(block.indexOf("SetWindowsHookEx") < block.indexOf("UnhookWindowsHookEx(old)"), "new hook must be installed first")
})
