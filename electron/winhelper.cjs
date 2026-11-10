// Ajudante nativo do Windows (Win32) — um PowerShell que fica aberto e responde comandos, uma linha por comando.
// Se o Agenda fechar ou travar, a entrada padrão fecha e o ajudante DEVOLVE a barra do Windows e a área livre da tela.
const { app } = require("electron")
const path = require("node:path")
const fs = require("node:fs")
const os = require("node:os")
const { spawn } = require("node:child_process")

const CS = String.raw`
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class AgWin {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint c);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW")] static extern IntPtr SetWindowLongPtr(IntPtr h, int i, IntPtr v);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [DllImport("user32.dll")] static extern bool SystemParametersInfo(uint a, uint b, ref RECT r, uint f);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindow(string c, string n);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint a, bool i, uint pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, uint f, StringBuilder s, ref uint n);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  public static void Dpi() { SetProcessDPIAware(); }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }

  static IntPtr H(string s) { return new IntPtr(long.Parse(s)); }
  static string Esc(string s) {
    var b = new StringBuilder();
    foreach (char c in s) {
      if (c == '"' || c == '\\') { b.Append('\\'); b.Append(c); }
      else if (c < ' ') b.Append(' ');
      else b.Append(c);
    }
    return b.ToString();
  }
  static string Cls(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
  static Dictionary<uint, string> exes = new Dictionary<uint, string>();
  static string Exe(uint pid) {
    string e;
    if (exes.TryGetValue(pid, out e)) return e;
    e = "";
    IntPtr p = OpenProcess(0x1000, false, pid);
    if (p != IntPtr.Zero) { var s = new StringBuilder(1024); uint n = 1024; if (QueryFullProcessImageName(p, 0, s, ref n)) e = s.ToString(); CloseHandle(p); }
    exes[pid] = e;
    return e;
  }

  // ---- janela pertencendo à área de trabalho / no fundo ----
  public static void Own(string h) { SetWindowLongPtr(H(h), -8, FindWindow("Progman", null)); }
  public static void Bottom(string h) { SetWindowPos(H(h), new IntPtr(1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010); }

  // ---- barra do Windows e área livre da tela (em todos os monitores) ----
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr p, IntPtr after, string c, string n);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromRect(ref RECT r, uint f);
  static bool tbHidden = false;
  // área livre original de cada monitor (para devolver) e a que o Agenda quer
  static Dictionary<long, RECT> origs = new Dictionary<long, RECT>();
  static Dictionary<long, RECT> wants = new Dictionary<long, RECT>();
  static List<IntPtr> Trays() {
    var l = new List<IntPtr>();
    foreach (var c in new[] { "Shell_TrayWnd", "Shell_SecondaryTrayWnd" }) {
      IntPtr t = IntPtr.Zero;
      while ((t = FindWindowEx(IntPtr.Zero, t, c, null)) != IntPtr.Zero) l.Add(t);
    }
    return l;
  }
  static void Tray(bool show) { foreach (var t in Trays()) ShowWindow(t, show ? 5 : 0); }
  static RECT WorkOf(IntPtr mon) { var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO)); GetMonitorInfo(mon, ref mi); return mi.rcWork; }
  public static void HideTaskbar() { tbHidden = true; Tray(false); }
  public static void SetWork(int l, int t, int r, int b) {
    var w = new RECT(); w.L = l; w.T = t; w.R = r; w.B = b;
    IntPtr mon = MonitorFromRect(ref w, 2);
    long k = mon.ToInt64();
    if (!origs.ContainsKey(k)) origs[k] = WorkOf(mon);
    wants[k] = w;
    SystemParametersInfo(0x2F, 0, ref w, 2);
  }
  public static void Restore() {
    tbHidden = false;
    wants.Clear();
    Tray(true);
    foreach (var o in origs.Values) { RECT r = o; SystemParametersInfo(0x2F, 0, ref r, 2); }
    origs.Clear();
  }
  /** o Explorer às vezes mostra a barra de novo ou devolve a área: reaplica */
  static void Heal() {
    if (tbHidden) foreach (var t in Trays()) if (IsWindowVisible(t)) ShowWindow(t, 0);
    foreach (var kv in wants) {
      RECT cur = WorkOf(new IntPtr(kv.Key)); RECT w = kv.Value;
      if (cur.L != w.L || cur.T != w.T || cur.R != w.R || cur.B != w.B) SystemParametersInfo(0x2F, 0, ref w, 2);
    }
  }
  public static void PeekTray(bool show) { Tray(show); tbHidden = !show; }

  // ---- janelas abertas ----
  public static string List() {
    Heal();
    var sb = new StringBuilder();
    IntPtr fg = GetForegroundWindow();
    bool full = false;
    int fl = 0, ft = 0; // canto do monitor onde está a janela em tela cheia
    if (fg != IntPtr.Zero) {
      string c = Cls(fg);
      if (c != "Progman" && c != "WorkerW" && c != "Shell_TrayWnd") {
        RECT r; GetWindowRect(fg, out r);
        var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
        if (GetMonitorInfo(MonitorFromWindow(fg, 2), ref mi)) {
          full = r.L <= mi.rcMonitor.L && r.T <= mi.rcMonitor.T && r.R >= mi.rcMonitor.R && r.B >= mi.rcMonitor.B;
          fl = mi.rcMonitor.L; ft = mi.rcMonitor.T;
        }
      }
    }
    sb.Append("{\"fg\":\"").Append(fg.ToInt64()).Append("\",\"full\":").Append(full ? "true" : "false")
      .Append(",\"fl\":").Append(fl).Append(",\"ft\":").Append(ft).Append(",\"wins\":[");
    bool first = true;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero) return true;
      long ex = GetWindowLongPtr(h, -20).ToInt64();
      if ((ex & 0x80) != 0 && (ex & 0x40000) == 0) return true; // janela de ferramenta
      if ((ex & 0x08000000) != 0 && (ex & 0x40000) == 0) return true; // não ativável
      int len = GetWindowTextLength(h);
      if (len == 0) return true;
      int cloaked; if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
      string cls = Cls(h);
      if (cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd") return true;
      var t = new StringBuilder(len + 1); GetWindowText(h, t, len + 1);
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (!first) sb.Append(',');
      first = false;
      sb.Append("{\"h\":\"").Append(h.ToInt64()).Append("\",\"t\":\"").Append(Esc(t.ToString())).Append("\",\"pid\":").Append(pid)
        .Append(",\"exe\":\"").Append(Esc(Exe(pid))).Append("\",\"min\":").Append(IsIconic(h) ? "true" : "false").Append('}');
      return true;
    }, IntPtr.Zero);
    sb.Append("]}");
    return sb.ToString();
  }
  public static void Activate(string s) {
    IntPtr h = H(s);
    if (!IsWindow(h)) return;
    if (IsIconic(h)) ShowWindow(h, 9);
    // tecla Alt "fantasma": libera trazer outra janela para a frente
    keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero);
    SetForegroundWindow(h);
  }
  public static void Minimize(string s) { ShowWindow(H(s), 6); }
  public static void Close(string s) { PostMessage(H(s), 0x0010, IntPtr.Zero, IntPtr.Zero); }
}
`

const PS = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
try { Add-Type -TypeDefinition @'
${CS}
'@ } catch { '{"error":' + (ConvertTo-Json ([string]$_)) + '}'; exit 1 }
$ErrorActionPreference = 'SilentlyContinue'
# coordenadas em pixels reais (iguais às do Electron convertidas)
[AgWin]::Dpi()
'{"ready":true}'
while ($true) {
  $l = [Console]::In.ReadLine()
  if ($l -eq $null) { break }
  $a = $l.Split(' ')
  $out = 'ok'
  switch ($a[0]) {
    'own'      { [AgWin]::Own($a[1]) }
    'bottom'   { [AgWin]::Bottom($a[1]) }
    'hidetb'   { [AgWin]::HideTaskbar() }
    'work'     { [AgWin]::SetWork([int]$a[1], [int]$a[2], [int]$a[3], [int]$a[4]) }
    'restore'  { [AgWin]::Restore() }
    'peek'     { [AgWin]::PeekTray($a[1] -eq '1') }
    'list'     { $out = [AgWin]::List() }
    'activate' { [AgWin]::Activate($a[1]) }
    'minimize' { [AgWin]::Minimize($a[1]) }
    'close'    { [AgWin]::Close($a[1]) }
    'desktop'  { (New-Object -ComObject Shell.Application).ToggleDesktop() }
  }
  $out
}
# o Agenda fechou (ou travou): devolve a barra do Windows
[AgWin]::Restore()
`

let proc = null
let buf = ""
const waiting = []
let ready = null

function start() {
  if (proc || process.platform !== "win32") return
  const file = path.join(os.tmpdir(), "agenda-winhelper.ps1")
  try { fs.writeFileSync(file, "﻿" + PS, "utf8") } catch { return }
  try {
    proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], { windowsHide: true })
  } catch { proc = null; return }
  let resolveReady
  ready = new Promise((r) => (resolveReady = r))
  proc.stdout.on("data", (d) => {
    buf += d.toString("utf8")
    const lines = buf.split(/\r?\n/)
    buf = lines.pop() ?? ""
    for (const l of lines) {
      if (!l.trim()) continue
      if (l.startsWith('{"ready"')) { resolveReady(true); continue }
      if (l.startsWith('{"error"')) { console.error("winhelper:", l); resolveReady(false); continue }
      const w = waiting.shift()
      if (w) w(l)
    }
  })
  proc.stderr.on("data", (d) => console.error("winhelper:", d.toString()))
  proc.on("exit", () => {
    proc = null
    while (waiting.length) waiting.shift()("")
  })
  app.on("will-quit", () => { try { proc && proc.stdin.end() } catch {} })
}

/** manda um comando e espera a resposta (uma linha) */
async function call(cmd) {
  start()
  if (!proc) return ""
  if (!(await ready)) return ""
  return new Promise((res) => {
    waiting.push(res)
    try { proc.stdin.write(cmd + "\n") } catch { waiting.pop(); res("") }
  })
}

const hwndOf = (win) => {
  const b = win.getNativeWindowHandle()
  return (b.length >= 8 ? b.readBigUInt64LE(0) : BigInt(b.readUInt32LE(0))).toString()
}

module.exports = { call, hwndOf }
