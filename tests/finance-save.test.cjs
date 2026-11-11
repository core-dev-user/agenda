const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const vm = require("node:vm")

function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "widgy-finance-test-"))
  const handles = new Map()
  const events = new Map()
  const app = { getPath: () => dir, on: (name, cb) => events.set(name, cb) }
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value, "utf8"),
    decryptString: (buf) => Buffer.from(buf).toString("utf8"),
  }
  const mod = { exports: {} }
  const context = {
    module: mod, exports: mod.exports, Buffer, console, Date, setTimeout,
    require: (name) => name === "electron" ? { app, safeStorage } : require(name),
  }
  const source = fs.readFileSync(path.join(__dirname, "..", "electron", "finance.cjs"), "utf8")
  vm.runInNewContext(source, context, { filename: "finance.cjs" })
  const ipc = {
    handle: (name, callback) => handles.set(name, callback),
    on: (name, callback) => events.set(name, callback),
  }
  mod.exports.register(ipc)
  return { dir, handles, events, clean: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

test("finance data stays encrypted on disk and persists after drain", async () => {
  const h = harness()
  try {
    assert.equal(h.handles.get("finance:open")(null).ok, true)
    assert.equal(h.handles.get("finance:save")(null, '{"saldo":123}'), true)
    assert.equal(await h.handles.get("finance:drain")(), true)
    const stored = fs.readFileSync(path.join(h.dir, "finance.dat"))
    assert.equal(stored.subarray(0, 4).toString(), "AGF1")
    assert.equal(h.handles.get("finance:open")(null).data, '{"saldo":123}')
  } finally { h.clean() }
})
test("sync exit save includes most recent edits before debounce", async () => {
  const h = harness()
  try {
    h.handles.get("finance:open")(null)
    const event = { returnValue: false }
    h.events.get("finance:saveSync")(event, '{"saldo":456}')
    assert.equal(event.returnValue, true)
    h.events.get("before-quit")()
    assert.equal(h.handles.get("finance:open")(null).data, '{"saldo":456}')
  } finally { h.clean() }
})
test("financial writes are rejected while locked", () => {
  const h = harness()
  try {
    assert.equal(h.handles.get("finance:save")(null, '{"secret":1}'), false)
    const event = { returnValue: false }
    h.events.get("finance:saveSync")(event, '{"secret":1}')
    assert.equal(event.returnValue, false)
    assert.equal(fs.existsSync(path.join(h.dir, "finance.dat")), false)
  } finally { h.clean() }
})

test("recovers last fsync checkpoint after a partial Windows shutdown", () => {
  const h = harness()
  try {
    h.handles.get("finance:open")(null)
    const event = { returnValue: false }
    h.events.get("finance:saveSync")(event, '{"saldo":789}')
    assert.equal(event.returnValue, true)
    const original = path.join(h.dir, "finance.dat")
    fs.renameSync(original, original + ".exit.tmp")
    assert.equal(h.handles.get("finance:open")(null).data, '{"saldo":789}')
    assert.equal(fs.existsSync(original), true)
    assert.equal(fs.existsSync(original + ".exit.tmp"), false)
  } finally { h.clean() }
})
