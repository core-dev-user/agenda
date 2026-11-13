// Tecla Windows e Win+S/Win+Q abrem o Iniciar e a pesquisa do Widgy (quando a barra do Widgy substitui a do Windows).
//
// Um ajudante separado (widgy-keys.exe, compilado aqui mesmo a partir do código C# abaixo; ou o PowerShell, se não
// der) instala um gancho de teclado (WH_KEYBOARD_LL) numa thread própria:
//  - Windows sozinha (apertou e soltou sem outra tecla): o Windows não abre o Iniciar dele, o Widgy abre o seu
//  - Win+S / Win+Q: a pesquisa do Widgy no lugar da do Windows
//  - Win+D alterna a área de trabalho sem ocultar a barra do Widgy
//  - outros atalhos (Win+E, Win+Shift+S, Win+V…) continuam nativos
// Para não abrir o Iniciar do Windows, segura o "soltar" da tecla Windows e manda uma tecla neutra antes
// (o mesmo truque do AutoHotkey e do PowerToys). Com um jogo protegido na frente o gancho é DESLIGADO.
// Se o Widgy fechar ou travar, o ajudante termina e o teclado volta ao normal na hora.
const { app } = require("electron")
const path = require("node:path")
const fs = require("node:fs")
const os = require("node:os")
const { spawn, execFile } = require("node:child_process")
const crypto = require("node:crypto")

const CS = String.raw`
using System;
using System.Threading;
using System.Diagnostics;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
public static class AgKeys {
  delegate IntPtr HookProc(int code, IntPtr w, IntPtr l);
  [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int id, HookProc f, IntPtr mod, uint tid);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int code, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern int GetMessage(out MSG m, IntPtr h, uint a, uint b);
  [DllImport("user32.dll")] static extern bool PostThreadMessage(uint tid, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] i, int size);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string n);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr h; public uint msg; public IntPtr w, l; public uint t; public int x, y; }
  [StructLayout(LayoutKind.Sequential)] struct KB { public uint vk, scan, flags, time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk, scan; public uint flags, time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint data, flags, time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] struct INPUTU { [FieldOffset(0)] public KEYBDINPUT k; [FieldOffset(0)] public MOUSEINPUT m; }
  // layout sequencial: o Windows espera a união alinhada em 4 (32 bits) ou 8 (64 bits); assim vale para os dois
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public INPUTU u; }

  /** marca das teclas que o próprio Widgy injeta: só ELAS são ignoradas pelo gancho. Teclas injetadas por outros
      programas (software de teclado gamer, macros, acesso remoto) contam como teclas de verdade; antes eram todas
      ignoradas, e com um software desses a tecla Windows sempre ia direto para o Iniciar original. */
  public const uint MAGIC = 0x57444759;
  public const uint MASK = 0xE8; // tecla sem uso: faz o Windows achar que foi um atalho e não abrir o Iniciar dele
  public const int UP = 0x10000;

  public static BlockingCollection<string> Events = new BlockingCollection<string>();
  public static Action<string> Emit = (e) => Events.Add(e);
  public static Action<int[]> Send = SendKeys;
  static HookProc proc = Hook; // referência fixa (o coletor de lixo não pode levar)
  static IntPtr hook = IntPtr.Zero;
  static uint tid = 0;
  static Thread th;
  static bool winHeld = false, clean = false, ate = false;
  // Shift, Ctrl ou Alt apertados: o atalho é outro (ex.: Win+Shift+S tira print) e o Widgy não mexe
  static bool shift = false, ctrl = false, alt = false;
  /** tecla Windows sozinha abre o Iniciar do Widgy (false: deixa o Iniciar do Windows abrir normalmente) */
  public static bool WinAlone = false;
  static uint eaten = 0; // tecla engolida (S, D…): engole também o soltar dela

  static void SendKeys(int[] seq) {
    var a = new INPUT[seq.Length];
    for (int n = 0; n < seq.Length; n++) {
      ushort vk = (ushort)(seq[n] & 0xFFFF);
      a[n].type = 1;
      a[n].u.k.vk = vk;
      a[n].u.k.flags = ((seq[n] & UP) != 0 ? 2u : 0u) | (vk == 0x5B || vk == 0x5C ? 1u : 0u);
      a[n].u.k.extra = (UIntPtr)MAGIC;
    }
    SendInput((uint)a.Length, a, Marshal.SizeOf(typeof(INPUT)));
  }

  /** Decide o que fazer com uma tecla de verdade. 1 = engolir (o Windows não vê), 0 = deixar passar.
      Sem chamadas ao Windows aqui dentro: é testado fora do Windows (tests/keys-native.test.cjs). */
  public static int Step(uint vk, bool down) {
    if (vk == 0xA0 || vk == 0xA1 || vk == 0x10) shift = down;
    else if (vk == 0xA2 || vk == 0xA3 || vk == 0x11) ctrl = down;
    else if (vk == 0xA4 || vk == 0xA5 || vk == 0x12) alt = down;
    if (vk == 0x5B || vk == 0x5C) {
      if (down) { if (!winHeld) { winHeld = true; clean = true; ate = false; } return 0; }
      winHeld = false;
      if (!ate && (!WinAlone || !clean || ctrl || shift || alt)) {
        if (clean && !WinAlone && !ctrl && !shift && !alt) Emit("pass:windows");
        clean = false;
        return 0;
      }
      // segura o soltar de verdade e manda: tecla neutra + soltar Windows (o Iniciar do Windows não abre)
      Send(new[] { (int)MASK, (int)MASK | UP, (int)vk | UP });
      if (clean && WinAlone) Emit("start");
      clean = false; ate = false;
      return 1;
    }
    if (eaten != 0 && vk == eaten && !down) { eaten = 0; return 1; }
    if (WinAlone && ctrl && !alt && !shift && vk == 0x1B && down) { // Ctrl+Esc também abre o Iniciar
      if (eaten != vk) Emit("start");
      eaten = vk;
      return 1;
    }
    if (winHeld && down) {
      clean = false;
      string action = vk == 0x44 ? "desktop" : vk == 0x53 || vk == 0x51 ? "search" : vk == 0x49 ? "settings" : vk == 0x41 || vk == 0x4E ? "notifications" : vk == 0x43 ? "assistant" : vk >= 0x31 && vk <= 0x39 ? "pin:" + (vk - 0x31) : null;
      if (action != null && !shift && !ctrl && !alt) {
        if (eaten != vk) Emit(action);
        eaten = vk; ate = true;
        return 1;
      }
    }
    return 0;
  }
  public static void Reset() { winHeld = false; clean = false; ate = false; eaten = 0; shift = false; ctrl = false; alt = false; }

  static IntPtr Hook(int code, IntPtr w, IntPtr l) {
    if (code >= 0) {
      var k = (KB)Marshal.PtrToStructure(l, typeof(KB));
      if ((uint)k.extra != MAGIC) {
        int m = w.ToInt32();
        if (Step(k.vk, m == 0x100 || m == 0x104) == 1) return new IntPtr(1);
      }
    }
    return CallNextHookEx(hook, code, w, l);
  }

  public static void On() {
    if (th != null) return;
    th = new Thread(() => {
      tid = GetCurrentThreadId();
      IntPtr mod = GetModuleHandle(null);
      hook = SetWindowsHookEx(13, proc, mod, 0);
      Emit(hook == IntPtr.Zero ? "hookfail " + Marshal.GetLastWin32Error() : "on");
      MSG m;
      while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0) {
        // 0x8001 = reinstalar. O Windows remove um gancho de teclado em silêncio se ele demorar a responder
        // uma vez (PC ocupado, volta da suspensão): o processo continua vivo, mas a tecla Windows volta a
        // abrir o Iniciar original. Instala o novo ANTES de tirar o antigo (sem intervalo sem gancho) e
        // nunca com a tecla Windows apertada.
        if (m.msg == 0x8001 && !winHeld) {
          IntPtr old = hook;
          IntPtr fresh = SetWindowsHookEx(13, proc, mod, 0);
          if (fresh != IntPtr.Zero) { hook = fresh; if (old != IntPtr.Zero) UnhookWindowsHookEx(old); }
        }
      }
      if (hook != IntPtr.Zero) UnhookWindowsHookEx(hook);
      hook = IntPtr.Zero;
      Reset();
    });
    th.IsBackground = true;
    th.Start();
  }
  public static void Rehook() {
    if (th == null) return;
    PostThreadMessage(tid, 0x8001, IntPtr.Zero, IntPtr.Zero);
  }
  public static void Off() {
    if (th == null) return;
    PostThreadMessage(tid, 0x12, IntPtr.Zero, IntPtr.Zero); // WM_QUIT
    th.Join(1000);
    th = null;
    Emit("off");
  }
  /** escreve os eventos na saída (fora da thread do gancho: ela nunca pode esperar) */
  public static void Pump() {
    var t = new Thread(() => { foreach (var e in Events.GetConsumingEnumerable()) { Console.Out.WriteLine(e); Console.Out.Flush(); } });
    t.IsBackground = true;
    t.Start();
  }
  /** um comando vindo do Widgy (uma linha da entrada) */
  public static void Command(string l) {
    if (l == "on") On();
    else if (l == "off") Off();
    else if (l == "rehook") Rehook();
    else if (l == "win:agenda") WinAlone = true;
    else if (l == "win:windows") WinAlone = false;
    else if (l == "ping") Emit("pong");
  }
}
`
/** programa próprio (widgy-keys.exe): o mesmo código, compilado uma vez com o compilador que vem no Windows */
const PROGRAM = String.raw`
public static class WidgyKeysProgram {
  public static int Main() {
    AgKeys.Pump();
    AgKeys.Emit("ready");
    string l;
    while ((l = System.Console.In.ReadLine()) != null) AgKeys.Command(l.Trim());
    AgKeys.Off();
    System.Threading.Thread.Sleep(50);
    return 0;
  }
}
`

const PS = `
$ErrorActionPreference = 'Stop'
try { Add-Type -TypeDefinition @'
${CS}
'@ } catch { [Console]::Out.WriteLine('error ' + ([string]$_).Replace([char]10, ' ')); exit 1 }
[AgKeys]::Pump()
[AgKeys]::Emit.Invoke('ready')
while ($true) {
  $l = [Console]::In.ReadLine()
  if ($l -eq $null) { break }
  [AgKeys]::Command($l.Trim())
}
[AgKeys]::Off()
`

let proc = null
let engine = "" // "exe" (programa próprio) ou "powershell" (modo de compatibilidade)
let want = false
let winAgenda = false
let onEvent = () => {}
let restartTimer = null
let quitting = false
let failures = 0
let exeFailures = 0
let ready = false

/* ---------------- estado e registro (Configurações mostram; o log ajuda a descobrir o que houve) ---------------- */
const status = { engine: "", hook: "off", error: "", policy: "", lastKey: "", lastKeyAt: 0, since: 0 }
const userDir = () => { try { return app.getPath("userData") } catch { return os.tmpdir() } }
const exists = (f) => { try { return fs.existsSync(f) } catch { return false } }
const logFile = () => path.join(userDir(), "widgy-keys.log")
let logChecked = false
function log(msg) {
  try {
    const f = logFile()
    if (!logChecked) { logChecked = true; try { if (fs.statSync(f).size > 256 * 1024) fs.writeFileSync(f, "") } catch {} }
    fs.appendFileSync(f, new Date().toISOString() + " " + msg + "\n")
  } catch {}
}

/* ---------------- programa próprio (widgy-keys.exe) ----------------
 * O mesmo código C# daqui de cima é compilado UMA vez com o compilador que já vem no Windows (.NET Framework 4,
 * presente no Windows 10 e 11) e guardado em %APPDATA%\Widgy\native. Comparado com o PowerShell:
 *  - abre em milissegundos (o PowerShell levava segundos para compilar a cada início, e nesse tempo a tecla
 *    Windows ia para o Iniciar original);
 *  - não passa pela checagem de scripts do PowerShell (antivírus e políticas de empresa costumam barrar um
 *    script com gancho de teclado);
 * Se o compilador não existir ou o programa não abrir, o PowerShell continua sendo usado. */
const hash = crypto.createHash("sha1").update(CS + PROGRAM).digest("hex").slice(0, 10)
const nativeDir = () => path.join(userDir(), "native")
const exeFile = () => path.join(nativeDir(), "widgy-keys-" + hash + ".exe")
function cscPath() {
  const win = process.env.WINDIR || process.env.SystemRoot || "C:\\Windows"
  for (const fw of process.arch === "ia32" ? ["Framework"] : ["Framework64", "Framework"]) {
    const f = path.join(win, "Microsoft.NET", fw, "v4.0.30319", "csc.exe")
    if (exists(f)) return f
  }
  return ""
}
let compiling = null
let compileFailed = false
function compile() {
  if (compiling) return compiling
  if (compileFailed || exists(exeFile())) return Promise.resolve(exists(exeFile()))
  compiling = new Promise((resolve) => {
    const done = (ok, why) => { compiling = null; if (!ok) { compileFailed = true; log("compilar: " + why) } else log("compilado: " + exeFile()); resolve(ok) }
    try {
      const csc = cscPath()
      if (!csc) return done(false, "compilador do .NET não encontrado")
      fs.mkdirSync(nativeDir(), { recursive: true })
      const src = path.join(nativeDir(), "widgy-keys-" + hash + ".cs")
      const tmp = exeFile() + ".tmp"
      fs.writeFileSync(src, CS + PROGRAM, "utf8")
      const platform = process.arch === "ia32" ? "x86" : process.arch === "arm64" ? "anycpu" : "x64"
      execFile(csc, ["/nologo", "/target:exe", "/optimize+", "/platform:" + platform, "/out:" + tmp, src], { windowsHide: true, timeout: 60000 }, (err, out) => {
        if (err || !exists(tmp)) return done(false, String((out || "") + " " + (err ? err.message : "")).replace(/\s+/g, " ").slice(0, 300))
        try { fs.renameSync(tmp, exeFile()) } catch (e) { return done(false, e.message) }
        // versões antigas do programa (de outras versões do Widgy) saem
        try { for (const f of fs.readdirSync(nativeDir())) if (/^widgy-keys-[0-9a-f]+\.(exe|cs)$/.test(f) && !f.includes(hash)) fs.unlinkSync(path.join(nativeDir(), f)) } catch {}
        done(true)
      })
    } catch (e) { done(false, e.message) }
  })
  return compiling
}

function cancelRestart() { if (restartTimer) clearTimeout(restartTimer); restartTimer = null }
function retry() {
  cancelRestart()
  if (!want || quitting) return
  const backoff = Math.min(8000, 600 * 2 ** Math.min(failures++, 4))
  restartTimer = setTimeout(() => { restartTimer = null; if (want && !quitting && !proc) start() }, backoff)
  restartTimer.unref?.()
}

function start() {
  if (proc || !want || quitting || process.platform !== "win32") return
  cancelRestart()
  ready = false
  // programa próprio quando já existe e não falhou seguidas vezes; senão o PowerShell (e compila para a próxima)
  const useExe = exeFailures < 2 && exists(exeFile())
  if (useExe) {
    try { proc = spawn(exeFile(), [], { windowsHide: true }); engine = "exe" } catch (e) { proc = null; exeFailures++; log("programa: " + e.message) }
  }
  if (!proc) {
    const file = path.join(os.tmpdir(), "agenda-keys.ps1")
    try { fs.writeFileSync(file, "\ufeff" + PS, "utf8") } catch { retry(); return }
    try {
      proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], { windowsHide: true })
      engine = "powershell"
    } catch { proc = null; retry(); return }
    // prepara o programa próprio e troca para ele assim que ficar pronto
    // só troca se o programa próprio ainda não falhou (o Smart App Control pode barrar o .exe; sem esta checagem
    // o swap reabria o PowerShell e trocava de novo, num loop de ~13 processos por segundo que travava o PC)
    if (exeFailures < 2) void compile().then((ok) => { if (ok && exeFailures < 2 && proc && engine === "powershell" && want && !quitting) swap() })
  }
  status.engine = engine
  status.hook = "starting"
  log("iniciando (" + engine + ")")
  const child = proc
  const childEngine = engine
  let buf = ""
  proc.stdout.on("data", (d) => {
    if (proc !== child) return
    buf += d.toString("utf8")
    const lines = buf.split(/\r?\n/)
    buf = lines.pop() ?? ""
    for (const raw of lines) {
      const l = raw.trim()
      if (!l) continue
      if (l === "ready") {
        ready = true; failures = 0; if (childEngine === "exe") exeFailures = 0
        send(winAgenda ? "win:agenda" : "win:windows"); if (want) send("on")
        continue
      }
      if (l === "on") { status.hook = "on"; status.error = ""; status.since = Date.now(); log("gancho ligado (" + childEngine + ")"); continue }
      if (l === "off") { status.hook = "off"; log("gancho desligado"); continue }
      if (l.startsWith("hookfail")) { status.hook = "error"; status.error = "O Windows recusou o atalho de teclado (código " + l.slice(9) + ")."; log(l); continue }
      if (l.startsWith("error")) {
        status.hook = "error"; status.error = "O ajudante de teclado não abriu: " + l.slice(6, 200); log(l)
        if (proc === child) child.kill()
        continue
      }
      if (l === "pass:windows") { status.lastKey = "windows"; status.lastKeyAt = Date.now(); continue }
      if (["start", "search", "settings", "notifications", "assistant", "desktop"].includes(l) || /^pin:[0-8]$/.test(l)) {
        if (l === "start") { status.lastKey = "start"; status.lastKeyAt = Date.now() }
        onEvent(l)
      }
    }
  })
  proc.stderr.on("data", (d) => { const t = d.toString(); console.error("keys:", t); log("stderr: " + t.replace(/\s+/g, " ").slice(0, 300)) })
  const disconnected = (why) => {
    if (proc !== child) return
    proc = null
    if (childEngine === "exe" && !ready) exeFailures++ // o programa nem chegou a abrir: na 2ª vez volta ao PowerShell
    if (status.hook !== "error") status.hook = "off"
    log("ajudante saiu (" + childEngine + "): " + why)
    retry()
  }
  proc.on("error", (error) => { console.error("keys:", error.message); disconnected(error.message) })
  proc.on("exit", (code) => disconnected("código " + code))
}
/** troca o PowerShell pelo programa próprio, sem deixar de pegar a tecla por mais que um instante */
function swap() {
  const old = proc
  proc = null
  try { old.stdin.end() } catch {}
  try { old.kill() } catch {}
  start()
}
app.on("will-quit", () => { quitting = true; want = false; cancelRestart(); try { proc && proc.stdin.end() } catch {} })
const send = (cmd) => { try { proc && proc.stdin.write(cmd + "\n") } catch {} }

/** liga/desliga o gancho (desliga com jogo protegido na frente). `why` diz por que está desligado. */
function enable(on, why = "") {
  status.policy = on ? "" : why
  if (on === want) { if (on && !proc) start(); return }
  want = on
  log(on ? "pedido: ligar" : "pedido: desligar (" + (why || "sem motivo") + ")")
  if (on) { if (!proc) start(); else send("on") }
  else { cancelRestart(); send("off") }
}

/** começa do zero (botão "Reiniciar o atalho" das Configurações) */
function restart() {
  log("reiniciar pedido pelo usuário")
  exeFailures = 0; compileFailed = false; failures = 0
  if (proc) { const old = proc; proc = null; try { old.stdin.end() } catch {}; try { old.kill() } catch {} }
  status.hook = "off"; status.error = ""
  if (want) start()
}

/**
 * Reinstala o gancho (sem intervalo sem gancho). O Windows remove ganchos de teclado em silêncio quando
 * eles demoram a responder; sem isto, a tecla Windows voltava a abrir o Iniciar original até reiniciar o Widgy.
 */
function refresh() { if (want && proc) send("rehook") }
const refreshTimer = setInterval(refresh, 30000)
refreshTimer.unref?.()
if (typeof app.whenReady === "function") app.whenReady().then(() => {
  const { powerMonitor } = require("electron")
  if (!powerMonitor) return
  // voltar da suspensão ou do bloqueio é quando o gancho mais se perde
  for (const ev of ["resume", "unlock-screen"]) powerMonitor.on(ev, () => setTimeout(refresh, 1500))
})

/** tecla Windows sozinha: true = Iniciar do Widgy; false = Iniciar do Windows */
function winKey(agenda) { winAgenda = !!agenda; send(winAgenda ? "win:agenda" : "win:windows") }

/** o que as Configurações mostram */
function getStatus() { return { ...status, winAlone: winAgenda, wanted: want, log: logFile() } }

module.exports = { enable, winKey, refresh, restart, status: getStatus, onKey: (cb) => { onEvent = cb } }
