// Desempenho do PC: CPU, memória, GPU, disco e rede. Só roda enquanto algum widget de desempenho está na tela.
// CPU/RAM: Node (os). GPU NVIDIA: nvidia-smi em modo contínuo. Rede/disco/GPU de outras marcas: contadores do Windows
// via CIM (nomes em inglês, funcionam no Windows em português). Nada sai do PC.
const os = require("node:os")
const { spawn, execFile } = require("node:child_process")

let getWin = () => null
const subs = new Set()
let timer = null
let refreshMs = 3000
let lastCpu = null
let smi = null
let smiOk = null // null = ainda não testado
let ps = null
let psBuf = ""
let staticInfo = null
const state = { gpu: null, net: null, disk: null, drives: [], top: [] }

function cpuSample() {
  const cpus = os.cpus()
  const t = cpus.map((c) => { const v = c.times; return { idle: v.idle, total: v.user + v.nice + v.sys + v.irq + v.idle } })
  let usage = 0, cores = []
  if (lastCpu && lastCpu.length === t.length) {
    let ti = 0, tt = 0
    cores = t.map((c, i) => {
      const di = c.idle - lastCpu[i].idle, dt = c.total - lastCpu[i].total
      ti += di; tt += dt
      return dt > 0 ? Math.round((1 - di / dt) * 100) : 0
    })
    usage = tt > 0 ? (1 - ti / tt) * 100 : 0
  }
  lastCpu = t
  return { usage: Math.round(usage * 10) / 10, cores, speed: cpus[0]?.speed ?? 0 }
}

function startSmi() {
  if (smi || smiOk === false) return
  const q = "name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit,fan.speed,clocks.gr"
  try {
    smi = spawn("nvidia-smi", [`--query-gpu=${q}`, "--format=csv,noheader,nounits", "-lms", String(Math.max(1500, refreshMs))], { windowsHide: true })
  } catch { smiOk = false; smi = null; return }
  let buf = ""
  smi.stdout.on("data", (d) => {
    buf += d.toString()
    const lines = buf.split(/\r?\n/)
    buf = lines.pop() ?? ""
    const line = lines.filter(Boolean).pop()
    if (!line) return
    const p = line.split(",").map((x) => x.trim())
    const n = (x) => (x && !/N\/A|Not Supported/i.test(x) ? Number(x) : null)
    smiOk = true
    state.gpu = { name: p[0], usage: n(p[1]), memUsed: n(p[2]), memTotal: n(p[3]), temp: n(p[4]), power: n(p[5]), powerLimit: n(p[6]), fan: n(p[7]), clock: n(p[8]), vendor: "nvidia" }
  })
  smi.on("error", () => { smiOk = false; smi = null })
  const worker = smi
  smi.on("exit", () => { if (smi === worker) smi = null; if (smiOk !== true) smiOk = false })
}

// PowerShell contínuo: rede, disco e (sem NVIDIA) a GPU pelos contadores do Windows. Uma linha JSON a cada ~2,5 s.
const PS_LOOP = `
$ErrorActionPreference = 'SilentlyContinue'
$i = 0
while ($true) {
  $n = Get-CimInstance Win32_PerfFormattedData_Tcpip_NetworkInterface
  $d = Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk -Filter "Name='_Total'"
  $o = @{ rx = [double](($n | Measure-Object BytesReceivedPersec -Sum).Sum); tx = [double](($n | Measure-Object BytesSentPersec -Sum).Sum);
          busy = [double]$d.PercentDiskTime; rd = [double]$d.DiskReadBytesPersec; wr = [double]$d.DiskWriteBytesPersec }
  if ($env:AGENDA_GPU_CIM -eq '1') {
    $g = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -Filter "Name LIKE '%engtype_3D'"
    $o.gpu = [double](($g | Measure-Object UtilizationPercentage -Sum).Sum)
    $m = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory
    $o.vram = [double](($m | Measure-Object DedicatedUsage -Sum).Sum)
  }
  if ($i % 2 -eq 0) {
    $o.top = @(Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 12 | ForEach-Object { @{ n = $_.ProcessName; m = [double]$_.WorkingSet64 } })
  }
  if ($i % 12 -eq 0) {
    $o.drives = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object { @{ id = $_.DeviceID; size = [double]$_.Size; free = [double]$_.FreeSpace } })
  }
  [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 4))
  $i++
  Start-Sleep -Milliseconds $env:AGENDA_SYSMON_DELAY
}`

function startPs() {
  if (ps) return
  psBuf = ""
  try {
    ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "-"], {
      windowsHide: true, env: { ...process.env, AGENDA_GPU_CIM: smiOk === true ? "0" : "1", AGENDA_SYSMON_DELAY: String(refreshMs) },
    })
  } catch { ps = null; return }
  ps.stdin.end(PS_LOOP)
  ps.stdout.on("data", (d) => {
    psBuf += d.toString()
    const lines = psBuf.split(/\r?\n/)
    psBuf = lines.pop() ?? ""
    for (const l of lines) {
      if (!l.trim().startsWith("{")) continue
      try {
        const o = JSON.parse(l)
        state.net = { rx: o.rx, tx: o.tx }
        state.disk = { busy: Math.min(100, o.busy), read: o.rd, write: o.wr }
        if (o.top) {
          // junta processos com o mesmo nome (Chrome, Discord… abrem vários)
          const m = new Map()
          for (const p of o.top) m.set(p.n, (m.get(p.n) ?? 0) + p.m)
          state.top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, mem]) => ({ name, mem }))
        }
        if (o.drives) state.drives = o.drives
        if (o.gpu != null && smiOk !== true) {
          const total = staticInfo?.gpuMem ?? null
          state.gpu = { name: staticInfo?.gpuName ?? "GPU", usage: Math.min(100, Math.round(o.gpu)), memUsed: o.vram ? Math.round(o.vram / 1048576) : null, memTotal: total, temp: null, power: null, powerLimit: null, fan: null, clock: null, vendor: "windows" }
        }
      } catch {}
    }
  })
  const worker = ps
  ps.on("exit", () => { if (ps === worker) ps = null })
}

function loadStatic() {
  if (staticInfo) return
  staticInfo = { cpuName: os.cpus()[0]?.model?.trim() ?? "CPU", threads: os.cpus().length, memTotal: os.totalmem(), gpuName: null, gpuMem: null }
  execFile("powershell.exe", ["-NoProfile", "-Command", "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress"], { windowsHide: true, timeout: 15000 }, (err, out) => {
    if (err) return
    try {
      let v = JSON.parse(out)
      if (!Array.isArray(v)) v = [v]
      const best = v.find((x) => /nvidia|radeon|amd|arc/i.test(x.Name)) ?? v[0]
      if (best) { staticInfo.gpuName = best.Name; staticInfo.gpuMem = best.AdapterRAM > 0 ? Math.round(best.AdapterRAM / 1048576) : null }
    } catch {}
  })
}

function tick() {
  const w = getWin()
  if (!w || w.isDestroyed()) return
  const total = os.totalmem(), free = os.freemem()
  const data = {
    at: Date.now(),
    cpu: { ...cpuSample(), name: staticInfo?.cpuName, threads: staticInfo?.threads },
    mem: { total, used: total - free },
    gpu: state.gpu,
    net: state.net,
    disk: state.disk,
    drives: state.drives,
    top: state.top,
    uptime: os.uptime(),
  }
  w.webContents.send("sysmon:data", data)
}

function start() {
  if (timer) return
  loadStatic()
  cpuSample()
  startSmi()
  // espera o nvidia-smi responder antes de decidir se a GPU vem dele ou dos contadores do Windows
  setTimeout(() => { if (timer) startPs() }, smiOk === null ? 2500 : 0)
  timer = setInterval(tick, refreshMs)
  setTimeout(tick, 300)
}
function stop() {
  clearInterval(timer); timer = null
  if (smi) { try { smi.kill() } catch {} smi = null }
  if (ps) { try { ps.kill() } catch {} ps = null }
}

/** O monitor só roda enquanto assinado; reduz amostragens CIM durante jogos. */
function setRefresh(value) {
  const raw = Number(value)
  const next = Number.isFinite(raw) ? Math.max(1500, Math.min(8000, Math.round(raw))) : 3000
  if (next === refreshMs) return true
  refreshMs = next
  if (!timer) return true
  clearInterval(timer)
  timer = setInterval(tick, refreshMs)
  if (ps) { const worker = ps; ps = null; try { worker.kill() } catch {}; startPs() }
  if (smi) { const worker = smi; smi = null; try { worker.kill() } catch {}; startSmi() }
  return true
}

function register(ipcMain, gw) {
  getWin = gw
  ipcMain.handle("sysmon:sub", (_e, id) => { subs.add(id); start(); return true })
  ipcMain.handle("sysmon:unsub", (_e, id) => { subs.delete(id); if (!subs.size) stop(); return true })
  ipcMain.handle("sysmon:rate", (_e, ms) => setRefresh(ms))
  const { app } = require("electron")
  app.on("before-quit", stop)
}

module.exports = { register }
