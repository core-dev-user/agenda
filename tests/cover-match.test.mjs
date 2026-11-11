import { test } from "node:test"
import assert from "node:assert/strict"
import { baseTitle, sameSong } from "../src/lib/coverMatch.ts"

test("suffixes added by players do not prevent a match", () => {
  assert.ok(sameSong("Bohemian Rhapsody - Remastered 2011", "Queen", "Bohemian Rhapsody", "Queen"))
  assert.ok(sameSong("Good Looking", "Suki Waterhouse", "Good Looking", "Suki Waterhouse"))
  assert.ok(sameSong("Envolver (Ao Vivo)", "Anitta, Justin Quiles", "Envolver", "Anitta"))
  assert.equal(baseTitle("Song (feat. Someone)"), "song")
})
test("a different song or artist is never accepted", () => {
  assert.equal(sameSong("Good Looking", "Suki Waterhouse", "Good Looking", "Another Band"), false)
  assert.equal(sameSong("Yellow", "Coldplay", "Fix You", "Coldplay"), false)
})
