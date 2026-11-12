import { test } from "node:test"
import assert from "node:assert/strict"
import { findSpot } from "../src/lib/placement.ts"

const view = { w: 1440, h: 900 }
const band = { x: 0, y: 820, w: 1440, h: 80 } // faixa da barra embaixo
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

test("an empty screen puts the widget in the middle", () => {
  assert.deepEqual(findSpot({ w: 300, h: 200 }, [], view), { x: 570, y: 350 })
})
test("while there is room, a new widget never overlaps another one or the taskbar band", () => {
  const placed = []
  for (const s of [[320, 170], [260, 220], [340, 460], [300, 300], [300, 200], [320, 170]]) {
    const g = { ...findSpot({ w: s[0], h: s[1] }, placed, view, [band]), w: s[0], h: s[1] }
    assert.ok(!placed.some((o) => hit(g, o)), `sobrepôs com ${placed.length} widgets na tela`)
    assert.ok(!hit(g, band), "caiu embaixo da barra")
    assert.ok(g.x >= 0 && g.y >= 0 && g.x + g.w <= view.w && g.y + g.h <= view.h, "saiu da tela")
    placed.push(g)
  }
})
test("on a full screen it stays on screen and off the taskbar band", () => {
  const placed = []
  for (let i = 0; i < 24; i++) {
    const s = [[320, 170], [260, 220], [340, 460], [300, 300]][i % 4]
    const g = { ...findSpot({ w: s[0], h: s[1] }, placed, view, [band]), w: s[0], h: s[1] }
    assert.ok(g.x >= 0 && g.y >= 0 && g.x + g.w <= view.w && g.y + g.h <= view.h, "saiu da tela")
    assert.ok(!hit(g, band), `widget ${i + 1} caiu embaixo da barra`)
    placed.push(g)
  }
})
