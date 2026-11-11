const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const path = require('node:path')

function load(name, imports, env = {}) {
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'process', '__dirname', fs.readFileSync(path.join(__dirname, '../electron', name), 'utf8'))(
    n => imports[n] || require(n), module, module.exports,
    { platform: 'win32', env, execPath: 'C:\\Widgy.exe' }, path.join(__dirname, '../electron'))
  return module.exports
}
const displays = () => [
  { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 996 } },
  { id: 2, bounds: { x: -1280, y: -200, width: 1280, height: 1024 }, workArea: { x: -1280, y: -200, width: 1280, height: 940 } },
]
function screenFor(all) {
  return Object.assign(new EventEmitter(), {
    getAllDisplays: () => all, getPrimaryDisplay: () => all[0],
    // Deliberately different scale for the monitor with negative coordinates.
    dipToScreenRect: (_w, r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v * (r.x < 0 ? 1.5 : 1)])),
  })
}
function modeHarness(cfg, all) {
  return load('mode.cjs', {
    electron: { app: { getPath: () => '.' }, screen: screenFor(all) },
    'node:fs': { readFileSync: () => JSON.stringify(cfg) }, './winhelper.cjs': {},
  })
}
test('desktop covers the full single monitor while widgets retain reserved work area', () => {
  const all = displays().slice(0, 1), m = modeHarness({ mode: 'desktop' }, all)
  assert.deepEqual(m.windowOptions().width, 1920)
  assert.deepEqual(m.workArea(), all[0].bounds)
  assert.deepEqual(m.screensInWindow()[0].full, { x: 0, y: 0, w: 1920, h: 1080 })
  assert.equal(m.screensInWindow()[0].h, 996)
  all[0].workArea = { x: 84, y: 0, width: 1836, height: 1080 }
  assert.deepEqual(m.workArea(), all[0].bounds)
  assert.equal(m.screensInWindow()[0].x, 84)
})
test('spanning desktops cover every edge and preserve negative monitor origins', () => {
  const m = modeHarness({ mode: 'desktop', span: true }, displays())
  assert.deepEqual(m.workArea(), { x: -1280, y: -200, width: 3200, height: 1280 })
  assert.deepEqual(m.screensInWindow().find(s => s.id === 1).full, { x: 1280, y: 200, w: 1920, h: 1080 })
})
test('non-spanning desktops fill the selected monitor; normal apps still use workArea', () => {
  const all = displays()
  assert.deepEqual(modeHarness({ mode: 'desktop', span: false, display: 2 }, all).workArea(), all[1].bounds)
  assert.deepEqual(modeHarness({ mode: 'app', display: 2 }, all).workArea(), all[1].workArea)
})

function barHarness(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const windows = [], commands = [], all = displays(), app = new EventEmitter(), ipc = new EventEmitter()
  app.getPath = () => '.'
  app.whenReady = () => new Promise(() => {})
  ipc.handlers = new Map()
  ipc.handle = (name, fn) => ipc.handlers.set(name, fn)
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.bounds = options; this.visible = false; this.destroyed = false
      this.webContents = Object.assign(new EventEmitter(), { sent: [], send(name, data) { this.sent.push({ name, data }) } })
      windows.push(this)
    }
    static fromWebContents(sender) { return windows.find(w => w.webContents === sender) }
    setAlwaysOnTop() {} setIgnoreMouseEvents() {} loadFile() {}
    setBounds(b) { this.bounds = b } getBounds() { return this.bounds }
    isDestroyed() { return this.destroyed } isVisible() { return this.visible }
    setOpacity(n) { this.opacity = n } showInactive() { this.visible = true }
    hide() { this.visible = false }
    destroy() { this.destroyed = true; this.emit('closed') }
  }
  const api = load('bar.cjs', {
    electron: { app, BrowserWindow: Window, screen: screenFor(all), globalShortcut: { register: () => true, unregister() {} } },
    'node:fs': { readFileSync: () => '{}', writeFileSync() {} },
    './winhelper.cjs': { call: cmd => { commands.push(cmd); return Promise.resolve('0') }, hwndOf: w => String(windows.indexOf(w) + 1) },
    './mode.cjs': { mode: () => 'desktop', target: () => all[0], spans: () => false },
    './keys.cjs': { onKey() {}, enable() {}, winKey() {} }, './games.cjs': { onPlaying() {}, playing: () => false },
    './taskbar-key-policy.cjs': require('../electron/taskbar-key-policy.cjs'),
    './startapps.cjs': { collectStartApps: async () => [], isAppsFolderTarget: () => false },
  })
  api.register(ipc, () => null)
  ipc.handlers.get('bar:set')({}, { on: true })
  const bar = windows.find(w => w.options.title === 'Widgy — barra')
  const emit = (name, sender, ...args) => ipc.emit(name, { sender: sender.webContents }, ...args)
  const show = (items = [{ h: '101', title: 'Test' }], from = bar) => {
    emit('bar:preview', from, items, 400)
    return windows.find(w => w.options.title === 'Widgy — prévia')
  }
  t.after(() => ipc.handlers.get('bar:set')({}, { on: false }))
  return { windows, commands, all, bar, emit, show }
}
test('secondary wallpaper covers the reserved strip while AppBar keeps reserving it', t => {
  const h = barHarness(t)
  assert.deepEqual(h.windows.find(w => w.options.title === 'Widgy — fundo').getBounds(), h.all[1].bounds)
  assert.ok(h.commands.some(c => c.startsWith('appbar ')))
})
test('cold preview waits for renderer subscription and ignores acknowledgements from other windows', t => {
  const h = barHarness(t), p = h.show()
  assert.equal(p.webContents.sent.length, 0)
  h.emit('preview:ready', h.bar, 0)
  assert.equal(p.webContents.sent.length, 0)
  h.emit('preview:ready', p, 0)
  const { seq } = p.webContents.sent.at(-1).data
  h.emit('preview:ready', h.bar, seq)
  assert.equal(p.isVisible(), false)
  h.emit('preview:ready', p, seq)
  assert.equal(p.isVisible(), true)
  assert.ok(h.commands.some(c => c.startsWith('pshow 101 ')))
})
test('hidden preview reopens and stale requests cannot resurrect dismissed previews', t => {
  const h = barHarness(t), p = h.show()
  h.emit('preview:ready', p, 0)
  const old = p.webContents.sent.at(-1).data.seq
  h.emit('preview:hide', p)
  h.emit('preview:ready', p, old)
  assert.equal(p.isVisible(), false)
  h.show([{ h: '202', title: 'Next' }])
  const seq = p.webContents.sent.at(-1).data.seq
  h.emit('preview:ready', p, old)
  assert.equal(p.isVisible(), false)
  h.emit('preview:ready', p, seq)
  assert.equal(p.isVisible(), true)
  h.emit('preview:hover', p, true)
  h.emit('preview:hide', p)
  h.show()
  h.emit('preview:ready', p, p.webContents.sent.at(-1).data.seq)
  h.emit('bar:previewLeave', h.bar)
  t.mock.timers.tick(280)
  assert.equal(p.isVisible(), false, 'hover from a previous preview must not keep it open')
})
test('latest request wins during loading and same app moves to the requesting display', t => {
  const h = barHarness(t), p = h.show()
  h.show([{ h: '202', title: 'Latest' }])
  h.emit('preview:ready', p, 0)
  assert.equal(p.webContents.sent.length, 1)
  assert.equal(p.webContents.sent[0].data.tiles[0].h, '202')
  h.emit('preview:ready', p, p.webContents.sent.at(-1).data.seq)
  const secondBar = h.windows.filter(w => w.options.title === 'Widgy — barra')[1]
  h.show([{ h: '202', title: 'Latest' }], secondBar)
  h.emit('preview:ready', p, p.webContents.sent.at(-1).data.seq)
  assert.ok(p.getBounds().x < 0)
  const pshow = h.commands.filter(c => c.startsWith('pshow ')).at(-1).split(' ')
  assert.equal(Number(pshow[2]), (p.getBounds().x + 16) * 1.5)
})
