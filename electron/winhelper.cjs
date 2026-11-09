// Win32 helper with its own message loop and an independent recovery process.
const { app } = require('electron')
const { EventEmitter } = require('node:events')
const path = require('node:path')
const fs = require('node:fs')
const { createHash, randomUUID } = require('node:crypto')
const { spawn } = require('node:child_process')
const { createSession } = require('./native-client.cjs')

const events = new EventEmitter()
let current = null, starting = null, disabled = false, quitting = false
let recoveryFinished = Promise.resolve()
const nativeDir = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'native') : path.join(__dirname, 'native')
const ps = (file, args) => spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.join(nativeDir, file), ...args], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })

async function start() {
  if (process.platform !== 'win32' || quitting || disabled) return null
  if (current) return current
  if (starting) return starting
  starting = (async () => {
    await recoveryFinished
    if (quitting || disabled) return null
    const dir = path.join(app.getPath('userData'), 'native')
    fs.mkdirSync(dir, { recursive: true })
    const hash = createHash('sha256').update(fs.readFileSync(path.join(nativeDir, 'AgendaShell.cs'))).digest('hex').slice(0, 20)
    const assembly = path.join(dir, `shell-${hash}.dll`)
    const journal = path.join(dir, `recovery-${randomUUID()}.txt`)
    const args = ['-OwnerPid', String(process.pid), '-RecoveryFile', journal, '-AssemblyFile', assembly]
    const child = ps('host.ps1', args)
    const session = createSession(child)
    const state = { child, session, guard: null, heartbeat: null, stopping: false }
    current = state
    session.events.on('event', (name) => events.emit(name))
    session.events.on('command-error', (message) => events.emit('warning', message))
    session.events.once('closed', (reason) => {
      clearInterval(state.heartbeat)
      if (current === state) current = null
      try { child.stdin.end() } catch {}
      const kill = setTimeout(() => { if (child.exitCode === null) child.kill() }, 1500)
      kill.unref()
      if (!quitting && !state.stopping) { disabled = true; events.emit('unavailable', reason) }
    })
    child.stderr.on('data', (d) => console.error('Agenda Shell:', d.toString()))
    if (!(await session.ready) || session.closed) return null
    const guard = ps('watchdog.ps1', [...args, '-HelperPid', String(child.pid)])
    state.guard = guard
    // Do not hide Explorer before the independent recovery process is ready.
    const watch = createSession(guard)
    recoveryFinished = new Promise((resolve) => { guard.once('exit', resolve); guard.once('error', resolve) })
    watch.events.once('closed', () => {
      if (!session.closed && !quitting && !state.stopping) session.close()
    })
    guard.stderr.on('data', (d) => console.error('Agenda recovery:', d.toString()))
    if (!(await watch.ready)) { session.close(); guard.kill(); return null }
    if (session.closed) return null
    state.heartbeat = setInterval(() => session.call('heartbeat'), 5000)
    state.heartbeat.unref()
    return state
  })().catch((e) => { disabled = true; events.emit('unavailable', e.message); return null }).finally(() => { starting = null })
  return starting
}

async function call(command) {
  // All callers wait for the watchdog, even if the helper has already emitted ready.
  const state = starting ? await starting : await start()
  return state && !state.session.closed ? state.session.call(command) : ''
}
function retry() { if (!current) disabled = false }
app.on('will-quit', () => {
  quitting = true
  if (current) { current.stopping = true; current.session.close() }
})
const hwndOf = (win) => {
  const b = win.getNativeWindowHandle()
  return (b.length >= 8 ? b.readBigUInt64LE(0) : BigInt(b.readUInt32LE(0))).toString()
}
module.exports = { call, retry, hwndOf, on(name, fn) { events.on(name, fn); return () => events.off(name, fn) } }
