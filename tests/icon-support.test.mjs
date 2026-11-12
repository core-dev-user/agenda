import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { iconSupport } from "../src/lib/iconSupport.ts"

const sup = (iconStyle, extra = {}) => { const s = iconSupport({ iconStyle, theme: "glass", iconPackStyle: "original", ...extra }); return (s.shape ? "F" : "-") + (s.color ? "C" : "-") }

test("matches what was measured in the running app for every icon style", () => {
  const measured = { logos: "--", outline: "F-", pixel: "-C", metal: "FC", neon: "FC", flat: "FC", color: "FC", glass: "FC" }
  for (const [style, want] of Object.entries(measured)) assert.equal(sup(style), want, style)
})
test("automatic follows the theme, and any icon pack disables both", () => {
  assert.equal(sup("auto", { theme: "glass" }), "FC")
  assert.equal(sup("auto", { theme: "retro" }), "-C") // retro resolve para Pixel
  assert.equal(sup("color", { iconPackStyle: "neon" }), "--")
  assert.ok(iconSupport({ iconStyle: "logos", theme: "glass" }).why.length > 10)
  assert.equal(iconSupport({ iconStyle: "color", theme: "glass" }).why, "")
})
test("the automatic-style table stays equal to the one the icons really use", () => {
  const view = fs.readFileSync(new URL("../src/components/AppIconView.tsx", import.meta.url), "utf8")
  assert.ok(view.includes('{ glass: "color", metal: "metal", retro: "pixel", terminal: "neon", minimal: "flat" }'), "resolveIconStyle mudou: atualize iconSupport.ts")
})
