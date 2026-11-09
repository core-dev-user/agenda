
using System;
using System.Text;
using System.IO;
using System.Diagnostics;
using System.Threading;
using System.Windows.Forms;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class AgWin {
  static IntPtr barHandle = IntPtr.Zero;
  static IntPtr desktopHandle = IntPtr.Zero;
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
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindow(string c, string n);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint a, bool i, uint pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, uint f, StringBuilder s, ref uint n);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  public static void Dpi() {
    try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; } catch (EntryPointNotFoundException) {}
    SetProcessDPIAware();
  }
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
  public static void Own(string h) { desktopHandle = H(h); SetWindowLongPtr(desktopHandle, -8, FindWindow("Progman", null)); }
  public static void Bottom(string h) { SetWindowPos(H(h), new IntPtr(1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010); }

  // ---- AppBar: o Explorer calcula a área de trabalho; não usamos SPI_SETWORKAREA. ----
  [StructLayout(LayoutKind.Sequential)] struct APPBARDATA {
    public uint cbSize; public IntPtr hWnd; public uint uCallbackMessage, uEdge;
    public RECT rc; public IntPtr lParam;
  }
  [DllImport("shell32.dll")] static extern UIntPtr SHAppBarMessage(uint msg, ref APPBARDATA data);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern uint RegisterWindowMessage(string name);
  delegate void WinEventProc(IntPtr hook, uint ev, IntPtr hwnd, int obj, int child, uint thread, uint time);
  [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr module, WinEventProc callback, uint process, uint thread, uint flags);
  [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr hook);
  static APPBARDATA Data(IntPtr hwnd) { var d = new APPBARDATA(); d.cbSize = (uint)Marshal.SizeOf(typeof(APPBARDATA)); d.hWnd = hwnd; return d; }
  const uint CallbackMessage = 0x8001;
  static bool registered, replacing, peeking;
  static uint originalState;
  static string recoveryFile;
  static int ownerPid;
  static RECT lastRect;
  static bool haveRect;
  static DateTime lastHeartbeat = DateTime.UtcNow, peekUntil;
  static Form host;
  static System.Windows.Forms.Timer changes, health;
  static readonly object outputLock = new object();
  static readonly List<IntPtr> hooks = new List<IntPtr>();
  static WinEventProc eventCallback;

  static void Write(string line) { lock (outputLock) { Console.WriteLine(line); Console.Out.Flush(); } }
  static void Event(string name) { Write("{\"event\":\"" + name + "\"}"); }
  static bool Same(RECT a, RECT b) { return a.L == b.L && a.T == b.T && a.R == b.R && a.B == b.B; }
  static string RectJson(RECT r) { return "{\"x\":" + r.L + ",\"y\":" + r.T + ",\"width\":" + (r.R-r.L) + ",\"height\":" + (r.B-r.T) + "}"; }
  static void NativeTray(bool show) {
    // Só substituímos a barra principal. As barras dos outros monitores continuam utilizáveis.
    IntPtr tray = FindWindow("Shell_TrayWnd", null);
    if (tray != IntPtr.Zero && IsWindowVisible(tray) != show) ShowWindow(tray, show ? 5 : 0);
  }
  static void SetTaskbarState(uint state) {
    var d = Data(FindWindow("Shell_TrayWnd", null));
    if ((uint)SHAppBarMessage(4, ref d).ToUInt64() == state) return;
    d.lParam = new IntPtr(state);
    SHAppBarMessage(10, ref d); // ABM_SETSTATE
  }
  static void SaveRecovery() {
    // Journal fica pronto ANTES de mudar o Explorer. O guardião só recupera sua própria sessão.
    string tmp = recoveryFile + ".tmp";
    File.WriteAllLines(tmp, new[] { Process.GetCurrentProcess().Id.ToString(), originalState.ToString(), barHandle.ToInt64().ToString() });
    if (File.Exists(recoveryFile)) File.Delete(recoveryFile);
    File.Move(tmp, recoveryFile);
  }
  static readonly Mutex recoveryMutex = new Mutex(false, @"Local\AgendaShellRecovery");
  static T Locked<T>(Func<T> action) {
    try { recoveryMutex.WaitOne(); } catch (AbandonedMutexException) {}
    try { return action(); } finally { recoveryMutex.ReleaseMutex(); }
  }
  public static void Recover(string file, int expectedHelper) { Locked(() => { RecoverLocked(file, expectedHelper); return true; }); }
  static void RecoverLocked(string file, int expectedHelper) {
    if (!File.Exists(file)) return;
    string[] data = File.ReadAllLines(file);
    if (data.Length != 3 || (expectedHelper != 0 && int.Parse(data[0]) != expectedHelper)) return;
    var d = Data(H(data[2])); SHAppBarMessage(1, ref d); // ABM_REMOVE
    SetTaskbarState(uint.Parse(data[1])); NativeTray(true);
    File.Delete(file);
  }
  public static string SetBar(string handle, int edge, int x, int y, int width, int height, int thickness) {
    return Locked(() => SetBarLocked(handle, edge, x, y, width, height, thickness));
  }
  static string SetBarLocked(string handle, int edge, int x, int y, int width, int height, int thickness) {
    var hwnd = H(handle); uint pid;
    if (!IsWindow(hwnd)) throw new InvalidOperationException("Janela da barra indisponível");
    GetWindowThreadProcessId(hwnd, out pid);
    if (pid != (uint)ownerPid) throw new InvalidOperationException("Janela não pertence ao Agenda");
    if (edge != 1 && edge != 3) throw new ArgumentException("Borda inválida");
    if (width <= 0 || height <= 0 || thickness < 1 || thickness >= height) throw new ArgumentException("Geometria inválida");
    if (registered && barHandle != hwnd) Restore();
    barHandle = hwnd;
    if (!replacing) {
      var td = Data(FindWindow("Shell_TrayWnd", null));
      if (td.hWnd == IntPtr.Zero) throw new InvalidOperationException("Explorer ainda não está pronto");
      originalState = (uint)SHAppBarMessage(4, ref td).ToUInt64(); // ABM_GETSTATE
      SaveRecovery();
      replacing = true;
    }
    try {
      if (hooks.Count == 0) InstallHooks();
      var d = Data(hwnd); d.uCallbackMessage = CallbackMessage;
      if (!registered) {
        if (SHAppBarMessage(0, ref d).ToUInt64() == 0) throw new InvalidOperationException("O Windows recusou a AppBar");
        registered = true; haveRect = false;
      }
      // Libera a reserva da barra do Explorer sem removê-lo do sistema.
      SetTaskbarState(originalState | 1); // ABS_AUTOHIDE
      if (!peeking) NativeTray(false);
      d.uEdge = (uint)edge;
      d.rc = new RECT { L=x, T=y, R=x+width, B=y+height };
      if (edge == 1) d.rc.B = d.rc.T + thickness; else d.rc.T = d.rc.B - thickness;
      SHAppBarMessage(2, ref d); // ABM_QUERYPOS: respeita outras AppBars
      if (edge == 1) d.rc.B = d.rc.T + thickness; else d.rc.T = d.rc.B - thickness;
      if (!haveRect || !Same(lastRect, d.rc)) {
        SHAppBarMessage(3, ref d); // ABM_SETPOS
        lastRect = d.rc; haveRect = true;
        SetWindowPos(hwnd, IntPtr.Zero, d.rc.L, d.rc.T, d.rc.R-d.rc.L, d.rc.B-d.rc.T, 0x0004 | 0x0010);
      }
      var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
      if (!GetMonitorInfo(MonitorFromWindow(hwnd, 2), ref mi)) throw new InvalidOperationException("Monitor indisponível");
      return "{\"bar\":" + RectJson(lastRect) + ",\"work\":" + RectJson(mi.rcWork) + "}";
    } catch { Restore(); throw; }
  }
  public static void Restore() { Locked(() => { RestoreLocked(); return true; }); }
  static void RestoreLocked() {
    if (registered) { var d = Data(barHandle); SHAppBarMessage(1, ref d); }
    registered = false; haveRect = false; peeking = false;
    foreach (IntPtr hook in hooks) UnhookWinEvent(hook); hooks.Clear();
    if (replacing) { SetTaskbarState(originalState); NativeTray(true); }
    replacing = false; barHandle = IntPtr.Zero;
    if (recoveryFile != null && File.Exists(recoveryFile)) File.Delete(recoveryFile);
  }
  public static void PeekTray(bool show) {
    if (!replacing) return;
    peeking = show; peekUntil = DateTime.UtcNow.AddSeconds(12);
    NativeTray(show);
  }
  static void Dirty() { if (changes != null && !changes.Enabled) changes.Start(); }
  sealed class ShellHost : Form {
    readonly uint taskbarCreated = RegisterWindowMessage("TaskbarCreated");
    protected override void WndProc(ref Message m) {
      if ((uint)m.Msg == taskbarCreated) {
        registered = false; haveRect = false;
        if (desktopHandle != IntPtr.Zero && IsWindow(desktopHandle)) Own(desktopHandle.ToInt64().ToString());
        Event("shell-restarted"); Dirty();
      }
      base.WndProc(ref m);
    }
  }
  static void InstallHooks() {
    eventCallback = (hook, ev, hwnd, obj, child, thread, time) => {
      if (ev >= 0x8000 && (obj != 0 || child != 0)) return; // OBJID_WINDOW, não os controles
      if (hwnd == IntPtr.Zero) return;
      uint pid; GetWindowThreadProcessId(hwnd, out pid);
      if (pid == (uint)ownerPid && ev != 3) return; // as nossas janelas não disparam outra listagem
      if (replacing && !peeking && ev == 0x8002 && Cls(hwnd) == "Shell_TrayWnd") NativeTray(false);
      Dirty();
    };
    uint[,] ranges = { {3,3}, {0x16,0x17}, {0x8000,0x8003}, {0x800B,0x800C} };
    for (int i=0; i<ranges.GetLength(0); i++) {
      IntPtr h = SetWinEventHook(ranges[i,0], ranges[i,1], IntPtr.Zero, eventCallback, 0, 0, 2); // OUTOFCONTEXT | SKIPOWNPROCESS
      if (h == IntPtr.Zero) throw new InvalidOperationException("Não foi possível acompanhar as janelas");
      hooks.Add(h);
    }
  }
  static string Command(string line) {
    string[] a = line.Split(' ');
    switch (a[0]) {
      case "own": Own(a[1]); break;
      case "bottom": Bottom(a[1]); break;
      case "appbar": return SetBar(a[1], int.Parse(a[2]), int.Parse(a[3]), int.Parse(a[4]), int.Parse(a[5]), int.Parse(a[6]), int.Parse(a[7]));
      case "position": if (registered) { var d=Data(barHandle); SHAppBarMessage(9, ref d); } break;
      case "restore": Restore(); break;
      case "recover": Recover(recoveryFile, 0); if (!replacing) NativeTray(true); break;
      case "peek": PeekTray(a[1] == "1"); break;
      case "list": return List();
      case "activate": Activate(a[1]); break;
      case "minimize": Minimize(a[1]); break;
      case "close": Close(a[1]); break;
      case "desktop": keybd_event(0x5B,0,0,UIntPtr.Zero); keybd_event(0x44,0,0,UIntPtr.Zero); keybd_event(0x44,0,2,UIntPtr.Zero); keybd_event(0x5B,0,2,UIntPtr.Zero); break;
      case "heartbeat": lastHeartbeat=DateTime.UtcNow; break;
      default: throw new ArgumentException("Comando desconhecido");
    }
    return "ok";
  }
  public static void Run(int parentPid, string journal) {
    ownerPid = parentPid; recoveryFile = journal; Dpi();
    Locked(() => {
      foreach (string file in Directory.GetFiles(Path.GetDirectoryName(journal), "recovery-*.txt")) {
        string[] data = File.ReadAllLines(file);
        if (data.Length != 3) continue;
        bool alive; try { alive = !Process.GetProcessById(int.Parse(data[0])).HasExited; } catch { alive = false; }
        if (!alive) RecoverLocked(file, 0);
      }
      return true;
    });
    host = new ShellHost(); host.ShowInTaskbar=false;
    var handle = host.Handle; // janela oculta normal recebe broadcasts do Explorer
    changes = new System.Windows.Forms.Timer { Interval=100 };
    changes.Tick += (s,e) => { changes.Stop(); Event("windows"); };
    health = new System.Windows.Forms.Timer { Interval=2000 };
    health.Tick += (s,e) => {
      bool alive;
      try { alive = !Process.GetProcessById(ownerPid).HasExited; } catch { alive=false; }
      if (!alive || DateTime.UtcNow-lastHeartbeat > TimeSpan.FromSeconds(30)) {
        Restore(); Event("expired"); Application.ExitThread(); return;
      }
      if (replacing && !IsWindow(barHandle)) { Restore(); Event("bar-lost"); }
      if (peeking && DateTime.UtcNow > peekUntil) { PeekTray(false); Event("peek-ended"); }
    };
    try {
      health.Start(); Write("{\"ready\":true}");
      var input = new Thread(() => {
        try {
          string line;
          while ((line=Console.ReadLine()) != null) {
            string request=line;
            host.BeginInvoke((Action)(() => {
              int id=0;
              try {
                int split=request.IndexOf('\t');
                if (split < 1 || !int.TryParse(request.Substring(0,split).Trim('\uFEFF'), out id))
                  throw new ArgumentException("Cabeçalho inválido no protocolo nativo (separador " + split + ")");
                string result=Command(request.Substring(split+1));
                Write("{\"id\":"+id+",\"result\":\""+Esc(result)+"\"}");
              } catch (Exception e) { Write("{\"id\":"+id+",\"error\":\""+Esc(e.Message)+"\"}"); }
            }));
          }
        } finally { try { host.BeginInvoke((Action)(() => Application.ExitThread())); } catch {} }
      });
      input.IsBackground=true; input.Start(); Application.Run();
    } finally {
      Restore(); foreach (IntPtr hook in hooks) UnhookWinEvent(hook); hooks.Clear();
      changes.Dispose(); health.Dispose(); host.Dispose();
    }
  }

  // ---- janelas abertas ----
  public static string List() {
    exes.Clear(); // evita reutilizar caminhos de processos cujo PID foi reciclado
    var sb = new StringBuilder();
    IntPtr fg = GetForegroundWindow();
    bool full = false;
    if (fg != IntPtr.Zero) {
      string c = Cls(fg);
      if (c != "Progman" && c != "WorkerW" && c != "Shell_TrayWnd") {
        RECT r; GetWindowRect(fg, out r);
        var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
        if ((barHandle == IntPtr.Zero || MonitorFromWindow(fg, 2) == MonitorFromWindow(barHandle, 2)) && GetMonitorInfo(MonitorFromWindow(fg, 2), ref mi))
          full = r.L <= mi.rcMonitor.L && r.T <= mi.rcMonitor.T && r.R >= mi.rcMonitor.R && r.B >= mi.rcMonitor.B;
      }
    }
    sb.Append("{\"fg\":\"").Append(fg.ToInt64()).Append("\",\"full\":").Append(full ? "true" : "false").Append(",\"wins\":[");
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
      if (cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd") return true;
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
