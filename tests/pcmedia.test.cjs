const { test } = require("node:test")
const assert = require("node:assert/strict")
const { pickSession, mergeArtwork, retainRecentSessions } = require("../electron/media-utils.cjs")

test("a Spotify widget never displays a different player when Spotify is absent", () => {
  const sessions = [{ app: "chrome.exe", title: "Other song", playing: true }]
  assert.equal(pickSession(sessions, "spotify"), null)
})
test("a widget follows its own app even when another app has Windows focus", () => {
  const sessions = [
    { app: "chrome.exe", title: "Video", playing: true, primary: true },
    { app: "SpotifyAB.SpotifyMusic", title: "Song", playing: false }
  ]
  assert.equal(pickSession(sessions, "spotify").title, "Song")
  assert.equal(pickSession(sessions, "").title, "Video")
})
test("the playing session wins when no player is selected", () => {
  assert.equal(pickSession([
    { app: "chrome", title: "Video", playing: false, primary: true },
    { app: "spotify", title: "Song", playing: true }
  ]).app, "spotify")
})
test("the cache accepts late artwork and retains it across progress updates", () => {
  const cache = new Map()
  const noArt = mergeArtwork({ app: "Spotify.exe", title: "Song", artist: "A" }, cache)
  assert.equal(noArt.art, null)
  const cover = "data:image/jpeg;base64,YWJj"
  const late = mergeArtwork({ app: "Spotify.exe", title: "Song", artist: "A", art: cover }, cache)
  assert.equal(late.art, cover)
  assert.equal(mergeArtwork({ app: "Spotify.exe", title: "Song", artist: "A", pos: 12 }, cache).art, cover)
  assert.equal(mergeArtwork({ app: "Spotify.exe", title: "Next", artist: "A" }, cache).art, null)
})
test("separate sessions have separate artwork caches", () => {
  const cache = new Map()
  mergeArtwork({ app: "Spotify", title: "A", art: "data:image/png;base64,YWJj" }, cache)
  mergeArtwork({ app: "Chrome", title: "B", art: "data:image/png;base64,ZGVm" }, cache)
  assert.notEqual(mergeArtwork({ app: "Spotify", title: "A" }, cache).art,
    mergeArtwork({ app: "Chrome", title: "B" }, cache).art)
})

test("one missing SMTC poll does not make a Spotify widget flash nothing playing", () => {
  const seen = new Map()
  const song = { app: "Spotify.exe", title: "Example", playing: true, art: "data:image/jpeg;base64,YWJj" }
  const first = retainRecentSessions([], [song], seen, 1000)
  assert.deepEqual(retainRecentSessions(first, [], seen, 2500), [song])
  assert.deepEqual(retainRecentSessions(first, [], seen, 10001), [])
})
test("new metadata replaces retained media immediately without duplicate sessions", () => {
  const seen = new Map()
  const old = { app: "Spotify.exe", title: "Old track" }
  const first = retainRecentSessions([], [old], seen, 1000)
  const next = { app: "Spotify.exe", title: "New track" }
  assert.deepEqual(retainRecentSessions(first, [next], seen, 2000), [next])
})
test("multiple apps keep independent grace windows", () => {
  const seen = new Map()
  const s = { app: "Spotify.exe", title: "Song" }
  const c = { app: "chrome.exe", title: "Video" }
  const first = retainRecentSessions([], [s, c], seen, 1000)
  assert.equal(retainRecentSessions(first, [c], seen, 9500).length, 2)
  assert.deepEqual(retainRecentSessions(first, [c], seen, 10100), [c])
})
