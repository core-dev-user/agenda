const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { EventEmitter } = require("node:events")
const { createLogger, attachWindowDiagnostics } = require("../electron/diagnostics.cjs")

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8")

test("poll de janelas não bloqueia o Win32 helper aguardando ícones", () => {
  const bar = read("electron/bar.cjs")
  assert.match(bar, /icon: iconForPoll\(w\.exe\)/)
  assert.doesNotMatch(bar, /icon: await iconOf\(w\.exe\)/)
  assert.match(bar, /iconWorkers < 2/)
  assert.match(bar, /ICON_LIMIT = 96/)
  assert.match(bar, /ICON_BYTES = 3 \* 1024 \* 1024/)
  assert.match(bar, /b\.__winsSignature !== signature/)
  assert.match(bar, /previewReadyTimer = setTimeout/)
  assert.match(read("electron/winhelper.cjs"), /child\.pending\.length >= 18/)
})

test("movimentos de mouse de alta frequência não renderizam a barra em todos os eventos", () => {
  const bar = read("src/bar/SystemBar.tsx")
  assert.match(bar, /now - prev\.at < 32/)
  assert.match(bar, /Math\.abs\(coordinate - prev\.coordinate\) < 3/)
  assert.match(bar, /onPointerMove=\{\(e\) => trackMouse/)
  assert.doesNotMatch(bar, /onPointerMove=\{\(e\) => setMouse/)
  assert.match(read("src/bar/Desk.tsx"), /30000/)
})

test("diagnóstico registra somente metadados autorizados, sem dados pessoais", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "widgy-diag-"))
  try {
    const logger = createLogger(dir)
    logger.write("startup", { reason: "meu segredo", file: "C:\\Users\\Pessoal\\senha.txt", token: "SENHA" })
    logger.write("main-loop-delay", { delayMs: 3000, rssMiB: 512, email: "email@exemplo.com" })
    await logger.flush()
    const lines = fs.readFileSync(logger.file, "utf8").trim().split("\n").map(JSON.parse)
    assert.equal(lines.length, 2)
    assert.equal(lines[0].kind, "startup")
    assert.equal(lines[1].delayMs, 3000)
    const full = JSON.stringify(lines)
    for (const secret of ["SENHA", "senha.txt", "email@exemplo", "meu segredo"]) {
      assert.equal(full.includes(secret), false)
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test("queda real do renderizador recupera no máximo duas vezes e gera log", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "widgy-diag-"))
  try {
    const logger = createLogger(dir)
    class FakeWindow extends EventEmitter {
      constructor() {
        super()
        this.count = 0
        this.webContents = new EventEmitter()
        this.webContents.isDestroyed = () => false
        this.webContents.reload = () => { this.count++ }
      }
      isDestroyed() { return false }
    }
    const w = new FakeWindow()
    attachWindowDiagnostics(w, logger, () => "desktop")
    w.webContents.emit("render-process-gone", {}, { reason: "crashed", exitCode: -5 })
    w.webContents.emit("render-process-gone", {}, { reason: "crashed", exitCode: -5 })
    w.webContents.emit("render-process-gone", {}, { reason: "crashed", exitCode: -5 })
    await new Promise((resolve) => setTimeout(resolve, 1350))
    assert.equal(w.count, 2)
    await logger.flush()
    const content = fs.readFileSync(logger.file, "utf8")
    assert.match(content, /renderer-reload-skipped/)
    assert.match(content, /renderer-reload/)
    w.emit("closed")
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
