const { test } = require("node:test")
const assert = require("node:assert/strict")
const { canPopup, canPermission } = require("../electron/webapp-security.cjs")
const { safeRemoteUrl, fetchSafeText, readLimitedText } = require("../electron/net-guard.cjs")

test("web apps can only open trusted HTTPS popups", () => {
  assert.equal(canPopup("discord", "https://discord.com/login"), true)
  assert.equal(canPopup("discord", "https://cdn.discordapp.com/"), true)
  assert.equal(canPopup("discord", "https://fake-discord.com/login"), false)
  assert.equal(canPopup("discord", "https://discord.com.evil.test/app"), false)
  assert.equal(canPopup("ifood", "https://accounts.google.com/signin"), true)
  assert.equal(canPopup("ifood", "http://google.com/signin"), false)
  assert.equal(canPopup("whatsapp", "javascript:alert(1)"), false)
})
test("permission policy restricts capability and requesting origin", () => {
  assert.equal(canPermission("discord", "media", "https://discord.com/channels/@me"), true)
  assert.equal(canPermission("discord", "display-capture", "https://discord.com/app"), true)
  assert.equal(canPermission("whatsapp", "media", "https://web.whatsapp.com/"), true)
  assert.equal(canPermission("whatsapp", "display-capture", "https://web.whatsapp.com/"), false)
  assert.equal(canPermission("ifood", "notifications", "https://www.ifood.com.br/"), true)
  assert.equal(canPermission("ifood", "clipboard-read", "https://www.ifood.com.br/"), false)
  assert.equal(canPermission("discord", "media", "https://discord.com.evil.example/"), false)
  assert.equal(canPermission("discord", "media", "https://hcaptcha.com/"), false)
  assert.equal(canPermission("discord", "media", "https://discord.com@evil.example/"), false)
  assert.equal(canPermission("unknown", "media", "https://discord.com/"), false)
})
test("public RSS, weather and iCal URLs stay compatible", () => {
  for (const url of ["https://api.open-meteo.com/v1/forecast?latitude=0",
    "https://g1.globo.com/rss/g1/", "https://calendar.google.com/calendar/ical/test/basic.ics",
    "http://feeds.example.com/rss.xml"]) {
    assert.equal(safeRemoteUrl(url), url)
  }
})
test("local, special protocol, IP and credentialed URLs are denied", () => {
  for (const url of ["file:///C:/private.txt", "http://localhost:8080/",
    "http://127.0.0.1:8080/", "https://192.168.0.1/", "http://10.1.2.3/",
    "http://[::1]/", "https://router.local/", "https://intranet.internal/",
    "https://example.com:8080/", "https://user:secret@example.com/", "not-a-url"]) {
    assert.throws(() => safeRemoteUrl(url))
  }
})
test("limited fetch accepts ordinary content", async () => {
  const seen = []
  const text = await fetchSafeText(async (url, opts) => {
    seen.push({ url, redirect: opts.redirect })
    return new Response("calendário válido")
  }, "https://calendar.google.com/test.ics")
  assert.equal(text, "calendário válido")
  assert.deepEqual(seen, [{ url: "https://calendar.google.com/test.ics", redirect: "manual" }])
})
test("redirect checks every hop and blocks private destinations", async () => {
  let calls = 0
  await assert.rejects(fetchSafeText(async () => {
    calls++
    return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } })
  }, "https://example.com/feed"), /Endereço de rede local/)
  assert.equal(calls, 1)
})
test("limits both declared and streamed response sizes", async () => {
  const body = "a".repeat(100)
  await assert.rejects(readLimitedText(new Response(body), 25), /limite/)
  await assert.rejects(readLimitedText(new Response(body, { headers: { "content-length": "100" } }), 25), /limite/)
})
test("network timeout aborts a stuck fetch", async () => {
  await assert.rejects(fetchSafeText((_url, opts) => new Promise((_res, reject) => {
    opts.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })
  }), "https://example.com/", { timeoutMs: 15 }), /aborted/)
})
