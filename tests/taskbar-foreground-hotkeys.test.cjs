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
