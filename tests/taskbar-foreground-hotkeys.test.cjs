const { test } = require("node:test")
const assert = require("node:assert/strict")
const { foregroundInfo, shouldCaptureKeys, isProtectedForeground } = require("../electron/taskbar-key-policy.cjs")

test("background games do not disable Win+D / Win+S in Chrome or other applications", () => {
  const foreground = foregroundInfo({
    fg: "102",
    wins: [
      { h: "101", exe: "C:\\Riot Games\\VALORANT-Win64-Shipping.exe" },
      { h: "102", exe: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" },
    ],
    full: false,
  })
  assert.equal(foreground.exe.toLowerCase().endsWith("chrome.exe"), true)
  assert.equal(shouldCaptureKeys({ barActive: true, enabled: true, foreground }), true)
})
test("low-level hook is not installed over protected foreground games by default", () => {
  for (const exe of ["VALORANT-Win64-Shipping.exe", "FortniteClient-Win64-Shipping.exe", "robloxplayerbeta.exe", "cs2.exe"]) {
    const foreground = foregroundInfo({ fg: "31", wins: [{ h: "31", exe: "C:\\Games\\" + exe }], full: true })
    assert.equal(isProtectedForeground(foreground.exe), true, exe)
    assert.equal(shouldCaptureKeys({ barActive: true, enabled: true, foreground }), false, exe)
  }
})
test("Win+D remains handled in ordinary fullscreen apps where Windows allows it", () => {
  const foreground = foregroundInfo({ fg: "33", wins: [{ h: "33", exe: "C:\\Program Files\\Video\\player.exe" }], full: true })
  assert.equal(shouldCaptureKeys({ barActive: true, enabled: true, foreground }), true)
})
test("unknown exclusive fullscreen foreground fails safe rather than hooking blindly", () => {
  const foreground = foregroundInfo({ fg: "40", wins: [], full: true })
  assert.equal(foreground.unresolvedFullscreen, true)
  assert.equal(shouldCaptureKeys({ barActive: true, enabled: true, foreground }), false)
})
test("disabled bar or disabled Widgy hotkeys never intercept Windows shortcuts", () => {
  const foreground = foregroundInfo({ fg: "4", wins: [{ h: "4", exe: "notepad.exe" }] })
  assert.equal(shouldCaptureKeys({ barActive: false, enabled: true, foreground }), false)
  assert.equal(shouldCaptureKeys({ barActive: true, enabled: false, foreground }), false)
})
test("no foreground sample yet means native Windows controls retain ownership", () => {
  assert.equal(shouldCaptureKeys({ barActive: true, enabled: true, foreground: null }), false)
})
test("Widgy's own full-screen desktop in front keeps the Windows key working", () => {
  // a área de trabalho do Widgy ocupa a tela e fica fora da lista de janelas da barra; antes isso desligava o atalho
  const foreground = foregroundInfo({ fg: "77", fx: "C:\\Users\\a\\AppData\\Local\\Programs\\Widgy\\Widgy.exe", wins: [{ h: "5", exe: "chrome.exe" }], full: true })
  assert.equal(foreground.unresolvedFullscreen, false)
  assert.equal(shouldCaptureKeys({ barActive: true, enabled: true, foreground }), true)
})
test("a protected game found only through the foreground program still turns the hook off", () => {
  const foreground = foregroundInfo({ fg: "8", fx: "D:\\Riot\\VALORANT-Win64-Shipping.exe", wins: [], full: true })
  assert.equal(shouldCaptureKeys({ barActive: true, enabled: true, foreground }), false)
})
test("every reason for the hook being off is explained in words", () => {
  const { captureBlockReason } = require("../electron/taskbar-key-policy.cjs")
  const fg = foregroundInfo({ fg: "1", wins: [{ h: "1", exe: "notepad.exe" }] })
  assert.equal(captureBlockReason({ barActive: true, enabled: true, foreground: fg }), "")
  assert.match(captureBlockReason({ barActive: false, enabled: true, foreground: fg }), /barra do Widgy/)
  assert.match(captureBlockReason({ barActive: true, enabled: false, foreground: fg }), /atalhos/)
  assert.match(captureBlockReason({ barActive: true, enabled: true, foreground: null }), /esperando/)
  assert.match(captureBlockReason({ barActive: true, enabled: true, foreground: foregroundInfo({ fg: "2", wins: [{ h: "2", exe: "C:\\G\\cs2.exe" }] }) }), /anti-cheat.*cs2\.exe/)
})
