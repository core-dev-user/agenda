// Finanças: os dados ficam SÓ no seu PC, criptografados com a proteção da sua conta do Windows (DPAPI).
// Nada é enviado para servidor nenhum. Senha/PIN opcional para abrir a aba.
const { app, safeStorage } = require("electron")
const path = require("node:path")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const crypto = require("node:crypto")

const dir = () => app.getPath("userData")
const dataFile = () => path.join(dir(), "finance.dat")
const lockFile = () => path.join(dir(), "finance-lock.json")
const backupDir = () => path.join(dir(), "backups")

let unlocked = false
let failures = 0
let lockUntil = 0
let lastBackup = 0
let onBackup = null

const readLock = () => { try { return JSON.parse(fs.readFileSync(lockFile(), "utf8")) } catch { return null } }
const hashPin = (pin, salt) => crypto.scryptSync(String(pin), Buffer.from(salt, "hex"), 32, { N: 16384, r: 8, p: 1 }).toString("hex")

function encrypt(txt) {
  if (safeStorage.isEncryptionAvailable()) return Buffer.concat([Buffer.from("AGF1"), safeStorage.encryptString(txt)])
  throw new Error("Criptografia do Windows indisponível")
}
function decrypt(buf) {
  if (buf.subarray(0, 4).toString() !== "AGF1") throw new Error("arquivo inválido")
  return safeStorage.decryptString(buf.subarray(4))
}
function readData() {
  const cands = [dataFile(), dataFile() + ".tmp"]
  try { cands.push(...fs.readdirSync(backupDir()).filter((f) => /^finance-.*\.dat$/.test(f)).sort().reverse().map((f) => path.join(backupDir(), f))) } catch {}
  for (const f of cands) {
    try {
      if (!fs.existsSync(f)) continue
      const txt = decrypt(fs.readFileSync(f))
      JSON.parse(txt)
      return txt
    } catch {}
  }
  return null
}

let pending = null
let writing = false
async function flush() {
  if (writing || pending == null) return
  writing = true
  const txt = pending
  pending = null
  try {
    const buf = encrypt(txt)
    const tmp = dataFile() + ".tmp"
    const fh = await fsp.open(tmp, "w")
    try { await fh.writeFile(buf); await fh.sync() } finally { await fh.close() }
    for (let i = 0; ; i++) { try { await fsp.rename(tmp, dataFile()); break } catch (e) { if (i > 5) throw e; await new Promise((r) => setTimeout(r, 60 * (i + 1))) } }
    if (Date.now() - lastBackup > 10 * 60 * 1000) {
      lastBackup = Date.now()
      await fsp.mkdir(backupDir(), { recursive: true })
      const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19)
      await fsp.writeFile(path.join(backupDir(), `finance-${stamp}.dat`), buf)
      const olds = (await fsp.readdir(backupDir())).filter((f) => /^finance-.*\.dat$/.test(f)).sort().reverse().slice(30)
      for (const f of olds) fsp.unlink(path.join(backupDir(), f)).catch(() => {})
      if (onBackup) onBackup(dataFile(), "finance.dat")
    }
  } catch (e) {
    console.error("finanças: falha ao salvar", e)
    if (pending == null) pending = txt
  }
  writing = false
  if (pending != null) setTimeout(flush, 200)
}
function flushSync() {
  if (pending == null) return
  try { fs.writeFileSync(dataFile(), encrypt(pending)); pending = null } catch (e) { console.error(e) }
}

function register(ipcMain, opts = {}) {
  onBackup = opts.onBackup || null
  app.on("before-quit", flushSync)
  app.on("will-quit", flushSync)
  ipcMain.handle("finance:status", () => ({
    exists: fs.existsSync(dataFile()),
    hasPin: !!readLock(),
    unlocked,
    secure: safeStorage.isEncryptionAvailable(),
    waitMs: Math.max(0, lockUntil - Date.now()),
  }))
  ipcMain.handle("finance:open", (_e, pin) => {
    const lock = readLock()
    if (lock && !unlocked) {
      if (Date.now() < lockUntil) return { ok: false, error: "wait", waitMs: lockUntil - Date.now() }
      if (!pin || hashPin(pin, lock.salt) !== lock.hash) {
        failures++
        // tentativas erradas seguidas: espera cada vez maior
        if (failures >= 3) lockUntil = Date.now() + Math.min(5 * 60_000, 15_000 * 2 ** (failures - 3))
        return { ok: false, error: "pin", waitMs: Math.max(0, lockUntil - Date.now()) }
      }
    }
    failures = 0
    unlocked = true
    return { ok: true, data: readData() }
  })
  ipcMain.handle("finance:lock", () => { if (readLock()) unlocked = false; return true })
  ipcMain.handle("finance:save", (_e, txt) => {
    if (!unlocked || typeof txt !== "string") return false
    try { JSON.parse(txt) } catch { return false }
    pending = txt
    flush()
    return true
  })
  ipcMain.handle("finance:setPin", (_e, oldPin, newPin) => {
    const lock = readLock()
    if (lock && hashPin(oldPin || "", lock.salt) !== lock.hash) return false
    if (!newPin) { try { fs.unlinkSync(lockFile()) } catch {} return true }
    const salt = crypto.randomBytes(16).toString("hex")
    fs.writeFileSync(lockFile(), JSON.stringify({ salt, hash: hashPin(newPin, salt) }))
    return true
  })
}

module.exports = { register }
