// Run after npm run build: electron tests/taskbar-preview-smoke.cjs
// Uses real Electron/React and DWM previews, but never hides the user's taskbar,
// registers keyboard hooks, or opens the user's Widgy profile.
const { app, BrowserWindow, ipcMain, screen } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'widgy-preview-smoke-'))
app.setPath('userData', profile)
const wait = ms => new Promise(r => setTimeout(r, ms))
async function until(fn, label) {
  for (let i = 0; i < 100; i++) { if (await fn()) return; await wait(100) }
  throw new Error('Timed out: ' + label)
}
const hwndOf = w => w.getNativeWindowHandle().readBigUInt64LE().toString()
const replace = (file, exports) => { require.cache[require.resolve(file)] = { exports } }
let native, source, bar, exitCode = 0
const pending = [], nativeResults = []
async function nativeCall(cmd) {
  return new Promise((resolve, reject) => {
    pending.push({ resolve, reject })
    native.stdin.write(cmd + '\n')
  })
}
const watchdog = setTimeout(() => { console.error('Smoke test watchdog expired'); app.exit(1) }, 60000)
app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  try {
    assert.equal(process.platform, 'win32', 'DWM smoke test requires Windows')
    native = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'taskbar-preview-native.ps1')], { windowsHide: true })
    let buffer = '', ready = false
    native.stdout.on('data', data => {
      buffer += data.toString()
      const lines = buffer.split(/\r?\n/); buffer = lines.pop()
      for (const line of lines.filter(Boolean)) {
        if (line === 'ready') ready = true
        else { nativeResults.push(line); pending.shift()?.resolve(line) }
      }
    })
    native.stderr.on('data', d => console.error(String(d)))
    native.on('error', error => { for (const p of pending.splice(0)) p.reject(error) })
    native.on('exit', code => { for (const p of pending.splice(0)) p.reject(new Error('Native helper exited: ' + code)) })
    await until(() => ready, 'native helper startup')
    replace(path.join(root, 'electron/winhelper.cjs'), {
      hwndOf, call: async cmd => {
        if (/^(pshow |phide$)/.test(cmd)) return nativeCall(cmd)
        return 'ok'
      },
    })
    replace(path.join(root, 'electron/keys.cjs'), { onKey() {}, enable() {}, winKey() {} })
    replace(path.join(root, 'electron/games.cjs'), { onPlaying() {}, playing: () => false })
    replace(path.join(root, 'electron/mode.cjs'), { mode: () => 'app' })
    require(path.join(root, 'electron/bar.cjs')).register(ipcMain, () => null)
    source = new BrowserWindow({ width: 640, height: 400, title: 'Widgy preview test source' })
    await source.loadURL('data:text/html,' + encodeURIComponent('<body style="margin:0;background:#167a68;color:white;font:40px sans-serif"><div style="padding:40px">WIDGY<br>PRÉVIA AO VIVO</div></body>'))
    bar = new BrowserWindow({ width: 300, height: 64, show: false })
    const items = [{ h: hwndOf(source), title: 'Prévia de teste', icon: '', min: false }]
    const emit = (name, win, ...args) => ipcMain.emit(name, { sender: win.webContents }, ...args)
    emit('bar:preview', bar, items, 400)
    const preview = BrowserWindow.getAllWindows().find(w => w.getTitle() === 'Widgy — prévia')
    assert.ok(preview)
    await until(() => preview.isVisible(), 'cold preview')
    await until(() => nativeResults.some(s => s.startsWith('shown:')), 'native DWM thumbnail')
    assert.ok(nativeResults.includes('shown:1:1'), 'one native window and one DWM thumbnail registered')
    await until(async () => (await preview.webContents.executeJavaScript('document.body.innerText')).includes('Prévia de teste'), 'React title')
    console.log('PASS cold preview + real React + DWM thumbnail')
    emit('preview:hide', preview)
    assert.equal(preview.isVisible(), false)
    await wait(500)
    // Reopening must not depend on hidden-window animation frames.
    await preview.webContents.executeJavaScript('window.requestAnimationFrame = () => 0; void 0')
    emit('bar:preview', bar, items, 400)
    await until(() => preview.isVisible(), 'reopen with animation frames suspended')
    await until(() => nativeResults.filter(s => s === 'shown:1:1').length === 2, 'second native preview')
    console.log('PASS hidden preview reopened without requestAnimationFrame')
    source.minimize()
    emit('preview:hide', preview)
    emit('bar:preview', bar, [{ ...items[0], min: true }], 500)
    await until(() => preview.isVisible(), 'minimized app preview')
    await until(() => nativeResults.filter(s => s === 'shown:1:1').length === 3, 'minimized DWM thumbnail')
    const bounds = preview.getBounds(), display = screen.getPrimaryDisplay().bounds
    assert.ok(bounds.x >= display.x && bounds.y >= display.y)
    assert.ok(bounds.x + bounds.width <= display.x + display.width)
    assert.ok(bounds.y + bounds.height <= display.y + display.height)
    console.log('PASS minimized app preview and display bounds')
    if (process.env.WIDGY_SMOKE_HOLD) await wait(30000)
    emit('preview:hide', preview)
    await nativeCall('phide')
    assert.equal(nativeResults.at(-1), 'hidden:0:0')
    console.log('PASS native overlay cleanup')
  } catch (e) { console.error(e); exitCode = 1 }
  finally {
    native?.stdin.end()
    for (const w of BrowserWindow.getAllWindows()) w.destroy()
    clearTimeout(watchdog)
    app.exit(exitCode)
  }
})
