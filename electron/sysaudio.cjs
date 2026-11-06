// Som do PC para transmitir junto com a tela — SEM o som de um programa (Discord ou o próprio Agenda).
// Usa a captura "por processo" do Windows 10 2004+/11 (process loopback, modo excluir árvore do processo).
// Sai PCM 16 bits, 48 kHz, estéreo pela saída padrão; o processo principal repassa para a página.
const path = require("node:path")
const fs = require("node:fs")
const os = require("node:os")
const { spawn } = require("node:child_process")

const CS = String.raw`
using System;
using System.IO;
using System.Threading;
using System.Runtime.InteropServices;

[ComImport, Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IActivateAudioInterfaceCompletionHandler { void ActivateCompleted(IActivateAudioInterfaceAsyncOperation op); }
[ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IActivateAudioInterfaceAsyncOperation { void GetActivateResult(out int hr, [MarshalAs(UnmanagedType.IUnknown)] out object iface); }
[ComImport, Guid("94ea2b94-e9cc-49e0-c0ff-ee64ca8f5b90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAgileObject { }
[ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioClient {
  [PreserveSig] int Initialize(int shareMode, uint streamFlags, long bufferDuration, long periodicity, IntPtr pFormat, IntPtr sessionGuid);
  [PreserveSig] int GetBufferSize(out uint n);
  [PreserveSig] int GetStreamLatency(out long l);
  [PreserveSig] int GetCurrentPadding(out uint p);
  [PreserveSig] int IsFormatSupported(int m, IntPtr f, out IntPtr c);
  [PreserveSig] int GetMixFormat(out IntPtr f);
  [PreserveSig] int GetDevicePeriod(out long d, out long m);
  [PreserveSig] int Start();
  [PreserveSig] int Stop();
  [PreserveSig] int Reset();
  [PreserveSig] int SetEventHandle(IntPtr h);
  [PreserveSig] int GetService([MarshalAs(UnmanagedType.LPStruct)] Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object s);
}
[ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioCaptureClient {
  [PreserveSig] int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devPos, out ulong qpcPos);
  [PreserveSig] int ReleaseBuffer(uint frames);
  [PreserveSig] int GetNextPacketSize(out uint frames);
}

public class AgActivate : IActivateAudioInterfaceCompletionHandler, IAgileObject {
  public ManualResetEvent Done = new ManualResetEvent(false);
  public IActivateAudioInterfaceAsyncOperation Op;
  public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation op) { Op = op; Done.Set(); }
}

public static class AgAudio {
  [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = false)]
  static extern void ActivateAudioInterfaceAsync([MarshalAs(UnmanagedType.LPWStr)] string path, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, IntPtr prm, IActivateAudioInterfaceCompletionHandler handler, out IActivateAudioInterfaceAsyncOperation op);

  static volatile bool stop = false;
  static string error = null;

  public static string Run(uint pid, bool exclude) {
    var t = new Thread(() => Capture(pid, exclude));
    t.SetApartmentState(ApartmentState.MTA);
    t.IsBackground = true;
    t.Start();
    // a entrada padrão fechou (o Agenda parou a transmissão ou fechou): encerra
    var r = new Thread(() => { try { var s = Console.OpenStandardInput(); var b = new byte[16]; while (s.Read(b, 0, 16) > 0) { } } catch { } stop = true; });
    r.IsBackground = true;
    r.Start();
    t.Join();
    return error ?? "fim";
  }

  static void Capture(uint pid, bool exclude) {
    IntPtr prm = IntPtr.Zero, blob = IntPtr.Zero, fmt = IntPtr.Zero;
    try {
      // AUDIOCLIENT_ACTIVATION_PARAMS { tipo = loopback de processo; { pid; modo } }
      blob = Marshal.AllocHGlobal(12);
      Marshal.WriteInt32(blob, 0, 1);
      Marshal.WriteInt32(blob, 4, (int)pid);
      Marshal.WriteInt32(blob, 8, exclude ? 1 : 0);
      // PROPVARIANT VT_BLOB
      prm = Marshal.AllocHGlobal(24);
      for (int i = 0; i < 24; i++) Marshal.WriteByte(prm, i, 0);
      Marshal.WriteInt16(prm, 0, 65);
      Marshal.WriteInt32(prm, 8, 12);
      Marshal.WriteIntPtr(prm, IntPtr.Size == 8 ? 16 : 12, blob);

      var h = new AgActivate();
      IActivateAudioInterfaceAsyncOperation op;
      ActivateAudioInterfaceAsync("VAD\\Process_Loopback", typeof(IAudioClient).GUID, prm, h, out op);
      h.Done.WaitOne(5000);
      int hr; object o;
      h.Op.GetActivateResult(out hr, out o);
      if (hr != 0) { error = "ativar " + hr.ToString("X"); return; }
      var ac = (IAudioClient)o;

      // WAVEFORMATEX: PCM 16 bits, 2 canais, 48 kHz
      fmt = Marshal.AllocHGlobal(18);
      Marshal.WriteInt16(fmt, 0, 1);
      Marshal.WriteInt16(fmt, 2, 2);
      Marshal.WriteInt32(fmt, 4, 48000);
      Marshal.WriteInt32(fmt, 8, 48000 * 4);
      Marshal.WriteInt16(fmt, 12, 4);
      Marshal.WriteInt16(fmt, 14, 16);
      Marshal.WriteInt16(fmt, 16, 0);
      // LOOPBACK | EVENTCALLBACK | SRC_DEFAULT_QUALITY | AUTOCONVERTPCM
      hr = ac.Initialize(0, 0x00020000u | 0x00040000u | 0x08000000u | 0x80000000u, 200000, 0, fmt, IntPtr.Zero);
      if (hr != 0) { error = "iniciar " + hr.ToString("X"); return; }
      var ev = new AutoResetEvent(false);
      ac.SetEventHandle(ev.SafeWaitHandle.DangerousGetHandle());
      object so;
      ac.GetService(typeof(IAudioCaptureClient).GUID, out so);
      var cc = (IAudioCaptureClient)so;
      var outp = Console.OpenStandardOutput();
      var buf = new byte[48000 * 4];
      ac.Start();
      while (!stop) {
        ev.WaitOne(100);
        uint n;
        while (!stop && cc.GetNextPacketSize(out n) == 0 && n > 0) {
          IntPtr data; uint frames, flags; ulong a, b;
          if (cc.GetBuffer(out data, out frames, out flags, out a, out b) != 0) break;
          int bytes = (int)frames * 4;
          if (bytes > buf.Length) buf = new byte[bytes];
          if ((flags & 2) != 0) Array.Clear(buf, 0, bytes); else Marshal.Copy(data, buf, 0, bytes);
          cc.ReleaseBuffer(frames);
          try { outp.Write(buf, 0, bytes); outp.Flush(); } catch { stop = true; }
        }
      }
      ac.Stop();
    } catch (Exception e) { error = e.Message; }
    finally {
      if (prm != IntPtr.Zero) Marshal.FreeHGlobal(prm);
      if (blob != IntPtr.Zero) Marshal.FreeHGlobal(blob);
      if (fmt != IntPtr.Zero) Marshal.FreeHGlobal(fmt);
    }
  }
}
`

const PS = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
${CS}
'@
$r = [AgAudio]::Run([uint32]$env:AGENDA_AUDIO_PID, $env:AGENDA_AUDIO_MODE -ne 'include')
[Console]::Error.WriteLine($r)
`

/** processo "raiz" do Discord (o pai dos outros); a exclusão pega todos os filhos juntos */
function discordRoot() {
  return new Promise((res) => {
    const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "$d = @(Get-CimInstance Win32_Process -Filter \"Name='Discord.exe' or Name='DiscordPTB.exe' or Name='DiscordCanary.exe'\"); $ids = $d.ProcessId; ($d | Where-Object { $ids -notcontains $_.ParentProcessId } | Select-Object -First 1).ProcessId"],
      { windowsHide: true })
    let out = ""
    ps.stdout.on("data", (d) => (out += d))
    ps.on("exit", () => res(Number(out.trim()) || 0))
    ps.on("error", () => res(0))
  })
}

let proc = null
let getWin = () => null

async function start(without) {
  stop()
  // "discord" = tudo menos o Discord; "agenda" = tudo menos o próprio Agenda (evita eco da voz da sala)
  let pid = 0
  if (without === "discord") pid = await discordRoot()
  if (!pid) pid = process.pid
  const file = path.join(os.tmpdir(), "agenda-sysaudio.ps1")
  fs.writeFileSync(file, "﻿" + PS, "utf8")
  const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], {
    windowsHide: true, env: { ...process.env, AGENDA_AUDIO_PID: String(pid), AGENDA_AUDIO_MODE: "exclude" },
  })
  proc = p
  let err = ""
  p.stdout.on("data", (chunk) => {
    const w = getWin()
    if (w && !w.isDestroyed()) w.webContents.send("sysaudio:data", chunk)
  })
  p.stderr.on("data", (d) => (err += d))
  p.on("exit", () => {
    if (proc === p) proc = null
    const w = getWin()
    if (w && !w.isDestroyed()) w.webContents.send("sysaudio:end", err.trim())
  })
  return { ok: true, excluded: pid === process.pid ? "agenda" : "discord" }
}
function stop() { if (proc) { try { proc.stdin.end(); proc.kill() } catch {} proc = null } }

function register(ipcMain, winGetter) {
  getWin = winGetter
  ipcMain.handle("sysaudio:start", (_e, without) => start(without === "agenda" ? "agenda" : "discord"))
  ipcMain.handle("sysaudio:stop", () => stop())
}

module.exports = { register, stop }
