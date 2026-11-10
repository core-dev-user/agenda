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
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
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
  [DllImport("user32.dll")] static extern bool SetLayeredWindowAttributes(IntPtr h, uint key, byte a, uint f);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint f, uint ms, out IntPtr r);
  [StructLayout(LayoutKind.Sequential)] struct ABD { public int cb; public IntPtr h; public uint cbm; public uint edge; public RECT rc; public IntPtr lp; }
  [DllImport("shell32.dll")] static extern IntPtr SHAppBarMessage(uint m, ref ABD d);
  static int AbState() { var d = new ABD(); d.cb = Marshal.SizeOf(d); return SHAppBarMessage(4, ref d).ToInt32(); }
  static void AbSet(int st) { var d = new ABD(); d.cb = Marshal.SizeOf(d); d.lp = new IntPtr(st); SHAppBarMessage(10, ref d); }

  // A barra do Windows não é escondida (o Explorer mostra de novo na hora): fica em "ocultar automaticamente"
  // (não reserva espaço) e invisível + sem receber cliques. Tudo volta como era no Restore.
  static bool tbHidden = false;
  static int abOrig = -1;
  static Dictionary<long, long> exOrig = new Dictionary<long, long>();
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
  static void Ghost(IntPtr t, bool on) {
    long k = t.ToInt64();
    long ex = GetWindowLongPtr(t, -20).ToInt64();
    if (on) {
      if ((ex & 0x80020) == 0x80020) return;
      if (!exOrig.ContainsKey(k)) exOrig[k] = ex;
      SetWindowLongPtr(t, -20, new IntPtr(ex | 0x80000 | 0x20));
      SetLayeredWindowAttributes(t, 0, 0, 2);
    } else {
      long o;
      // Agenda fechou à força numa vez anterior: tira o "invisível" mesmo sem saber o estilo de antes
      if (!exOrig.TryGetValue(k, out o)) { if ((ex & 0x80020) != 0x80020) return; o = ex & ~0x80020L; }
      SetLayeredWindowAttributes(t, 0, 255, 2);
      SetWindowLongPtr(t, -20, new IntPtr(o));
      exOrig.Remove(k);
    }
  }
  static void Tray(bool show) {
    if (!show && abOrig < 0) abOrig = AbState();
    if (abOrig >= 0) AbSet(show ? abOrig : (abOrig | 1));
    foreach (var t in Trays()) Ghost(t, !show);
    if (show) abOrig = -1;
  }
  static RECT WorkOf(IntPtr mon) { var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO)); GetMonitorInfo(mon, ref mi); return mi.rcWork; }
  /** grava a área livre sem esperar programas travados (um jogo pode não responder ao aviso) */
  static void Work(ref RECT w) {
    SystemParametersInfo(0x2F, 0, ref w, 0);
    IntPtr r; SendMessageTimeout(new IntPtr(0xffff), 0x1A, new IntPtr(0x2F), IntPtr.Zero, 0x0002, 200, out r);
  }
  /** devolve o estado original da barra do Windows (o Agenda guarda, caso feche à força) */
  public static string HideTaskbar() { tbHidden = true; Tray(false); return abOrig.ToString(); }
  public static void SetWork(int l, int t, int r, int b) {
    var w = new RECT(); w.L = l; w.T = t; w.R = r; w.B = b;
    IntPtr mon = MonitorFromRect(ref w, 2);
    long k = mon.ToInt64();
    if (!origs.ContainsKey(k)) origs[k] = WorkOf(mon);
    wants[k] = w;
    Work(ref w);
  }
  // ---- barras do Agenda registradas como AppBar: o próprio Windows reserva o espaço delas ----
  static HashSet<long> appbars = new HashSet<long>();
  public static void AppBar(string hs, int l, int t, int r, int b, uint edge) {
    IntPtr h = H(hs);
    var d = new ABD(); d.cb = Marshal.SizeOf(d); d.h = h;
    if (!appbars.Contains(h.ToInt64())) { d.cbm = 0x8000 + 77; SHAppBarMessage(0, ref d); appbars.Add(h.ToInt64()); }
    d.edge = edge; d.rc.L = l; d.rc.T = t; d.rc.R = r; d.rc.B = b;
    SHAppBarMessage(3, ref d); // ABM_SETPOS
  }
  public static void UnAppBar(string hs) {
    IntPtr h = H(hs);
    if (!appbars.Remove(h.ToInt64())) return;
    var d = new ABD(); d.cb = Marshal.SizeOf(d); d.h = h; SHAppBarMessage(1, ref d);
  }
  public static void Restore(int fallback) {
    foreach (var k in new List<long>(appbars)) UnAppBar(k.ToString());
    if (abOrig < 0 && fallback >= 0) abOrig = fallback;
    tbHidden = false;
    wants.Clear();
    Tray(true);
    foreach (var o in origs.Values) { RECT r = o; Work(ref r); }
    origs.Clear();
  }
  /** o Explorer às vezes recria a barra ou devolve a área: reaplica */
  static void Heal() {
    if (tbHidden) foreach (var t in Trays()) Ghost(t, true);
    foreach (var kv in wants) {
      RECT cur = WorkOf(new IntPtr(kv.Key)); RECT w = kv.Value;
      if (cur.L != w.L || cur.T != w.T || cur.R != w.R || cur.B != w.B) Work(ref w);
    }
  }
  public static void PeekTray(bool show) { if (show == !tbHidden) return; Tray(show); tbHidden = !show; }

  // ---- janelas abertas ----
  public static string List() {
    Heal();
    var sb = new StringBuilder();
    IntPtr fg = GetForegroundWindow();
    bool full = false, zoomed = false;
    int fl = 0, ft = 0; // canto do monitor da janela da frente
    if (fg != IntPtr.Zero) {
      string c = Cls(fg);
      if (c != "Progman" && c != "WorkerW" && c != "Shell_TrayWnd") {
        RECT r; GetWindowRect(fg, out r);
        var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
        if (GetMonitorInfo(MonitorFromWindow(fg, 2), ref mi)) {
          // maximizada (ex.: Chrome) não é tela cheia: as bordas dela também passam da tela
          zoomed = IsZoomed(fg);
          full = !zoomed && r.L <= mi.rcMonitor.L && r.T <= mi.rcMonitor.T && r.R >= mi.rcMonitor.R && r.B >= mi.rcMonitor.B;
          fl = mi.rcMonitor.L; ft = mi.rcMonitor.T;
        }
      }
    }
    sb.Append("{\"fg\":\"").Append(fg.ToInt64()).Append("\",\"full\":").Append(full ? "true" : "false")
      .Append(",\"fz\":").Append(zoomed ? "true" : "false").Append(",\"fl\":").Append(fl).Append(",\"ft\":").Append(ft).Append(",\"wins\":[");
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
        .Append(",\"exe\":\"").Append(Esc(Exe(pid))).Append("\",\"min\":").Append(IsIconic(h) ? "true" : "false");
      // maximizada e em qual monitor (a barra se esconde no monitor que tem janela maximizada)
      if (IsZoomed(h) && !IsIconic(h)) {
        var wm = new MONITORINFO(); wm.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
        if (GetMonitorInfo(MonitorFromWindow(h, 2), ref wm)) sb.Append(",\"z\":[").Append(wm.rcMonitor.L).Append(',').Append(wm.rcMonitor.T).Append(']');
      }
      sb.Append('}');
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
  // ---- ícone de qualquer arquivo/atalho, igual ao do Explorer (atalhos .lnk/.url, .msc, .exe…) ----
  [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItemImageFactory { [PreserveSig] int GetImage(SZ size, int flags, out IntPtr phbm); }
  [StructLayout(LayoutKind.Sequential)] struct SZ { public int cx, cy; }
  [StructLayout(LayoutKind.Sequential)] struct BMP { public int type, w, h, stride; public ushort planes, bpp; public IntPtr bits; }
  [DllImport("shell32.dll", CharSet=CharSet.Unicode, PreserveSig=false)] static extern void SHCreateItemFromParsingName(string path, IntPtr bc, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory item);
  [DllImport("gdi32.dll")] static extern int GetObject(IntPtr h, int n, out BMP b);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr h);
  public static string Icon(string path, int px) {
    IntPtr hb = IntPtr.Zero;
    try {
      IShellItemImageFactory f;
      SHCreateItemFromParsingName(path, IntPtr.Zero, typeof(IShellItemImageFactory).GUID, out f);
      var sz = new SZ(); sz.cx = px; sz.cy = px;
      if (f.GetImage(sz, 0x4 | 0x1, out hb) != 0 || hb == IntPtr.Zero) return "";
      BMP b; GetObject(hb, Marshal.SizeOf(typeof(BMP)), out b);
      if (b.bits == IntPtr.Zero || b.bpp != 32) return "";
      int h = Math.Abs(b.h);
      using (var bmp = new System.Drawing.Bitmap(b.w, h, b.stride, System.Drawing.Imaging.PixelFormat.Format32bppPArgb, b.bits))
      using (var copy = new System.Drawing.Bitmap(bmp))
      using (var ms = new System.IO.MemoryStream()) {
        if (b.h > 0) copy.RotateFlip(System.Drawing.RotateFlipType.RotateNoneFlipY); // DIB de baixo para cima
        copy.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
        return Convert.ToBase64String(ms.ToArray());
      }
    } catch { return ""; }
    finally { if (hb != IntPtr.Zero) DeleteObject(hb); }
  }

  // ---- miniatura ao vivo de uma janela (igual à da barra do Windows), desenhada pelo DWM dentro da janela de prévia ----
  [StructLayout(LayoutKind.Sequential)] struct TNP { public int flags; public RECT dst; public RECT src; public byte opacity; public bool visible; public bool clientOnly; }
  [DllImport("dwmapi.dll")] static extern int DwmRegisterThumbnail(IntPtr dest, IntPtr src, out IntPtr thumb);
  [DllImport("dwmapi.dll")] static extern int DwmUnregisterThumbnail(IntPtr thumb);
  [DllImport("dwmapi.dll")] static extern int DwmQueryThumbnailSourceSize(IntPtr thumb, out SZ size);
  [DllImport("dwmapi.dll")] static extern int DwmUpdateThumbnailProperties(IntPtr thumb, ref TNP p);
  static List<IntPtr> thumbs = new List<IntPtr>();
  /** encaixa a janela src dentro do retângulo (l,t,r,b) da janela dst, mantendo a proporção */
  public static void Thumb(string dst, string src, int l, int t, int r, int b) {
    IntPtr th;
    if (DwmRegisterThumbnail(H(dst), H(src), out th) != 0) return;
    thumbs.Add(th);
    SZ sz; DwmQueryThumbnailSourceSize(th, out sz);
    int bw = r - l, bh = b - t;
    double k = (sz.cx > 0 && sz.cy > 0) ? Math.Min((double)bw / sz.cx, (double)bh / sz.cy) : 1;
    if (k > 1) k = 1;
    int w = (int)(sz.cx * k), h = (int)(sz.cy * k);
    var p = new TNP();
    p.flags = 0x1 | 0x4 | 0x8 | 0x10;
    p.dst.L = l + (bw - w) / 2; p.dst.T = t + (bh - h) / 2; p.dst.R = p.dst.L + w; p.dst.B = p.dst.T + h;
    p.opacity = 255; p.visible = true; p.clientOnly = false;
    DwmUpdateThumbnailProperties(th, ref p);
  }
  public static void UnThumb() { foreach (var th in thumbs) DwmUnregisterThumbnail(th); thumbs.Clear(); }

  // O Chromium desenha por cima da miniatura do DWM, então ela fica numa janelinha nativa (sem foco, sem barra,
  // deixa o clique passar para a prévia do Agenda que está embaixo), encaixada no quadro de cada janela.
  class Peek : System.Windows.Forms.Form {
    protected override bool ShowWithoutActivation { get { return true; } }
    protected override System.Windows.Forms.CreateParams CreateParams {
      get { var cp = base.CreateParams; cp.ExStyle |= 0x80000 | 0x20 | 0x08000000 | 0x80 | 0x8; return cp; } // camada, clique passa, sem foco, sem barra, sempre na frente
    }
  }
  static System.Windows.Forms.Form uiRoot;
  static List<Peek> peeks = new List<Peek>();
  static void Ui(Action a) {
    if (uiRoot == null) {
      var ready = new System.Threading.ManualResetEvent(false);
      var t = new System.Threading.Thread(() => {
        uiRoot = new System.Windows.Forms.Form();
        var hh = uiRoot.Handle; // cria a janela (invisível) que recebe os pedidos
        ready.Set();
        System.Windows.Forms.Application.Run(new System.Windows.Forms.ApplicationContext());
      });
      t.SetApartmentState(System.Threading.ApartmentState.STA);
      t.IsBackground = true;
      t.Start();
      ready.WaitOne(3000);
    }
    try { uiRoot.Invoke(a); } catch { }
  }
  /** mostra a miniatura da janela src no retângulo (pixels da tela) */
  public static void PeekShow(string src, int x, int y, int w, int h) {
    Ui(() => {
      var f = new Peek();
      f.FormBorderStyle = System.Windows.Forms.FormBorderStyle.None;
      f.StartPosition = System.Windows.Forms.FormStartPosition.Manual;
      f.ShowInTaskbar = false;
      f.TopMost = true;
      f.BackColor = System.Drawing.Color.FromArgb(255, 1, 254); // cor "furada": a sobra em volta da miniatura fica transparente
      f.Bounds = new System.Drawing.Rectangle(x, y, w, h);
      f.Show();
      f.Bounds = new System.Drawing.Rectangle(x, y, w, h);
      SetLayeredWindowAttributes(f.Handle, 0xFE01FF, 255, 0x1 | 0x2);
      peeks.Add(f);
      Thumb(f.Handle.ToInt64().ToString(), src, 0, 0, w, h);
    });
  }
  public static void PeekHide() {
    Ui(() => {
      UnThumb();
      foreach (var f in peeks) { try { f.Close(); f.Dispose(); } catch { } }
      peeks.Clear();
    });
  }

  public static void Minimize(string s) { ShowWindow(H(s), 6); }
  public static void Close(string s) { PostMessage(H(s), 0x0010, IntPtr.Zero, IntPtr.Zero); }
}
`

const PS = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
try { Add-Type -ReferencedAssemblies System.Drawing, System.Windows.Forms -TypeDefinition @'
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
    'hidetb'   { $out = [AgWin]::HideTaskbar() }
    'work'     { [AgWin]::SetWork([int]$a[1], [int]$a[2], [int]$a[3], [int]$a[4]) }
    'restore'  { $st = -1; if ($a.Length -gt 1) { $st = [int]$a[1] }; [AgWin]::Restore($st) }
    'appbar'   { [AgWin]::AppBar($a[1], [int]$a[2], [int]$a[3], [int]$a[4], [int]$a[5], [uint32]$a[6]) }
    'unappbar' { [AgWin]::UnAppBar($a[1]) }
    'peek'     { [AgWin]::PeekTray($a[1] -eq '1') }
    'list'     { $out = [AgWin]::List() }
    'activate' { [AgWin]::Activate($a[1]) }
    'minimize' { [AgWin]::Minimize($a[1]) }
    'close'    { [AgWin]::Close($a[1]) }
    'thumb'    { [AgWin]::Thumb($a[1], $a[2], [int]$a[3], [int]$a[4], [int]$a[5], [int]$a[6]) }
    'unthumb'  { [AgWin]::UnThumb() }
    'pshow'    { [AgWin]::PeekShow($a[1], [int]$a[2], [int]$a[3], [int]$a[4], [int]$a[5]) }
    'phide'    { [AgWin]::PeekHide() }
    'icon'     { $out = [AgWin]::Icon($l.Substring(5).Trim(), 48); if (-not $out) { $out = 'none' } }
    'desktop'  { (New-Object -ComObject Shell.Application).ToggleDesktop() }
  }
  $out
}
# o Agenda fechou (ou travou): devolve a barra do Windows
[AgWin]::Restore(-1)
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
