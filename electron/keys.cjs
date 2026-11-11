// Tecla Windows e Win+S/Win+Q abrem o Iniciar e a pesquisa do Agenda (quando a barra do Agenda substitui a do Windows).
//
// Um PowerShell separado instala um gancho de teclado (WH_KEYBOARD_LL) numa thread própria:
//  - Windows sozinha (apertou e soltou sem outra tecla): o Windows não abre o Iniciar dele, o Agenda abre o seu
//  - Win+S / Win+Q: a pesquisa do Agenda no lugar da do Windows
//  - Win+D alterna a área de trabalho sem ocultar a barra do Widgy
//  - outros atalhos (Win+E, Win+Shift+S, Win+V…) continuam nativos
// Para não abrir o Iniciar do Windows, segura o "soltar" da tecla Windows e manda uma tecla neutra antes
// (o mesmo truque do AutoHotkey). Com um jogo aberto o gancho é DESLIGADO (anti-cheats não gostam de ganchos).
// Se o Agenda fechar ou travar, o processo termina e o teclado volta ao normal na hora.
const { app } = require("electron")
const path = require("node:path")
const fs = require("node:fs")
const os = require("node:os")
const { spawn } = require("node:child_process")

const CS = String.raw`
using System;
using System.Threading;
using System.Diagnostics;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
public static class AgKeys {
  delegate IntPtr HookProc(int code, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, HookProc f, IntPtr mod, uint tid);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int code, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern int GetMessage(out MSG m, IntPtr h, uint a, uint b);
  [DllImport("user32.dll")] static extern bool PostThreadMessage(uint tid, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] i, int size);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string n);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr h; public uint msg; public IntPtr w, l; public uint t; public int x, y; }
  [StructLayout(LayoutKind.Sequential)] struct KB { public uint vk, scan, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk, scan; public uint flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint data, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] struct INPUT { [FieldOffset(0)] public uint type; [FieldOffset(8)] public KEYBDINPUT k; [FieldOffset(8)] public MOUSEINPUT m; }

  public static BlockingCollection<string> Events = new BlockingCollection<string>();
  static HookProc proc = Hook; // referência fixa (o coletor de lixo não pode levar)
  static IntPtr hook = IntPtr.Zero;
  static uint tid = 0;
  static Thread th;
  static bool winHeld = false, clean = false, ate = false;
  // Shift, Ctrl ou Alt apertados: o atalho é outro (ex.: Win+Shift+S tira print) — o Agenda não mexe
  static bool shift = false, ctrl = false, alt = false;
  /** tecla Windows sozinha abre o Iniciar do Agenda (false: deixa o Iniciar do Windows abrir normalmente) */
  public static bool WinAlone = false;
  static uint eaten = 0; // tecla engolida (S/Q) — engole também o soltar dela

  const uint MASK = 0xE8; // tecla sem uso: faz o Windows achar que foi um atalho
  static INPUT Key(ushort vk, bool up) {
    var i = new INPUT(); i.type = 1; i.k.vk = vk; i.k.flags = up ? 2u : 0u;
    if (vk == 0x5B || vk == 0x5C) i.k.flags |= 1; // tecla estendida
    return i;
  }

  static IntPtr Hook(int code, IntPtr w, IntPtr l) {
    if (code >= 0) {
      var k = (KB)Marshal.PtrToStructure(l, typeof(KB));
      bool injected = (k.flags & 0x10) != 0;
      bool down = w.ToInt32() == 0x100 || w.ToInt32() == 0x104;
      if (!injected) {
        if (k.vk == 0xA0 || k.vk == 0xA1 || k.vk == 0x10) shift = down;
        else if (k.vk == 0xA2 || k.vk == 0xA3 || k.vk == 0x11) ctrl = down;
        else if (k.vk == 0xA4 || k.vk == 0xA5 || k.vk == 0x12) alt = down;
        bool isWin = k.vk == 0x5B || k.vk == 0x5C;
        if (isWin) {
          if (down) { if (!winHeld) { winHeld = true; clean = true; ate = false; } }
          else {
            winHeld = false;
            // Windows sozinha e o Iniciar é o do Windows: deixa passar normal
            if (!ate && (!WinAlone || !clean || ctrl || shift || alt)) { clean = false; return CallNextHookEx(hook, code, w, l); }
            // segura o soltar de verdade e manda: tecla neutra + soltar Windows (o Iniciar do Windows não abre)
            var seq = new[] { Key((ushort)MASK, false), Key((ushort)MASK, true), Key((ushort)k.vk, true) };
            SendInput(3, seq, Marshal.SizeOf(typeof(INPUT)));
            if (clean && WinAlone) Events.Add("start");
            clean = false; ate = false;
            return new IntPtr(1);
          }
        } else if (eaten != 0 && k.vk == eaten && !down) {
          eaten = 0;
          return new IntPtr(1);
        } else if (WinAlone && ctrl && !alt && !shift && k.vk == 0x1B && down) {
          if (eaten != k.vk) Events.Add("start");
          eaten = k.vk;
          return new IntPtr(1);
        } else if (winHeld && down) {
          clean = false;
          string action = k.vk == 0x44 ? "desktop" : k.vk == 0x53 || k.vk == 0x51 ? "search" : k.vk == 0x49 ? "settings" : k.vk == 0x41 || k.vk == 0x4E ? "notifications" : k.vk == 0x43 ? "assistant" : k.vk >= 0x31 && k.vk <= 0x39 ? "pin:" + (k.vk - 0x31) : null;
          if (action != null && !shift && !ctrl && !alt) { // Win+S ou Win+Q (sem outra tecla junto): pesquisa
            if (eaten != k.vk) Events.Add(action);
            eaten = k.vk; ate = true;
            return new IntPtr(1);
          }
        }
      }
    }
    return CallNextHookEx(hook, code, w, l);
  }

  public static void On() {
    if (th != null) return;
    th = new Thread(() => {
      tid = GetCurrentThreadId();
      hook = SetWindowsHookEx(13, proc, GetModuleHandle(Process.GetCurrentProcess().MainModule.ModuleName), 0);
      Events.Add(hook == IntPtr.Zero ? "error" : "on");
      MSG m;
      while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0) { }
      if (hook != IntPtr.Zero) UnhookWindowsHookEx(hook);
      hook = IntPtr.Zero;
      winHeld = false; eaten = 0; shift = false; ctrl = false; alt = false;
    });
    th.IsBackground = true;
    th.Start();
  }
  public static void Off() {
    if (th == null) return;
    PostThreadMessage(tid, 0x12, IntPtr.Zero, IntPtr.Zero); // WM_QUIT
    th.Join(1000);
    th = null;
    Events.Add("off");
  }
  /** escreve os eventos na saída (fora da thread do gancho: ela nunca pode esperar) */
  public static void Pump() {
    var t = new Thread(() => { foreach (var e in Events.GetConsumingEnumerable()) { Console.Out.WriteLine(e); Console.Out.Flush(); } });
    t.IsBackground = true;
    t.Start();
  }
}
`

const PS = `
$ErrorActionPreference = 'Stop'
try { Add-Type -TypeDefinition @'
${CS}
'@ } catch { [Console]::Out.WriteLine('error ' + ([string]$_).Replace([char]10, ' ')); exit 1 }
[AgKeys]::Pump()
[AgKeys]::Events.Add('ready')
while ($true) {
  $l = [Console]::In.ReadLine()
  if ($l -eq $null) { break }
  if ($l -eq 'on') { [AgKeys]::On() }
  elseif ($l -eq 'off') { [AgKeys]::Off() }
  elseif ($l -eq 'win:agenda') { [AgKeys]::WinAlone = $true }
  elseif ($l -eq 'win:windows') { [AgKeys]::WinAlone = $false }
}
[AgKeys]::Off()
`

let proc = null
let want = false
let winAgenda = false
let onEvent = () => {}
let restartTimer = null
let quitting = false
let failures = 0
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
  const file = path.join(os.tmpdir(), "agenda-keys.ps1")
  try { fs.writeFileSync(file, "﻿" + PS, "utf8") } catch { retry(); return }
  try {
    proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], { windowsHide: true })
  } catch { proc = null; retry(); return }
  const child = proc
  let buf = ""
  proc.stdout.on("data", (d) => {
    if (proc !== child) return
    buf += d.toString("utf8")
    const lines = buf.split(/\r?\n/)
    buf = lines.pop() ?? ""
    for (const raw of lines) {
      const l = raw.trim()
      if (!l) continue
      if (l === "ready") { failures = 0; send(winAgenda ? "win:agenda" : "win:windows"); if (want) send("on"); continue }
      if (l.startsWith("error")) { console.error("keys:", l); if (proc === child) child.kill(); continue }
      if (["start", "search", "settings", "notifications", "assistant", "desktop"].includes(l) || /^pin:[0-8]$/.test(l)) onEvent(l)
    }
  })
  proc.stderr.on("data", (d) => console.error("keys:", d.toString()))
  const disconnected = () => { if (proc !== child) return; proc = null; retry() }
  proc.on("error", (error) => { console.error("keys:", error.message); disconnected() })
  proc.on("exit", disconnected)

}
app.on("will-quit", () => { quitting = true; want = false; cancelRestart(); try { proc && proc.stdin.end() } catch {} })
const send = (cmd) => { try { proc && proc.stdin.write(cmd + "\n") } catch {} }

/** liga/desliga o gancho (desliga com jogo aberto) */
function enable(on) {
  if (on === want) { if (on && !proc) start(); return }
  want = on
  if (on) { if (!proc) start(); else send("on") }
  else { cancelRestart(); send("off") }
}

/** tecla Windows sozinha: true = Iniciar do Agenda; false = Iniciar do Windows (o padrão) */
function winKey(agenda) { winAgenda = !!agenda; send(winAgenda ? "win:agenda" : "win:windows") }

module.exports = { enable, winKey, onKey: (cb) => { onEvent = cb } }
