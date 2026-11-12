import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

const root = new URL("../src/", import.meta.url).pathname
const files = []
const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (p.endsWith(".tsx")) files.push(p) } }
walk(root)
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8")

// botão cujo conteúdo é só um ícone (um componente auto-fechado, ou dois num "a ? <X/> : <Y/>") e que não tem title nem aria-label
const ICON_ONLY = /<(button|motion\.button)\b((?:[^<>]|=>|<[^/!][^<>]*>|\{[^{}]*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}[^{}]*)*\})*?)>\s*((?:\{[^{}]*\?\s*)?<[A-Z][A-Za-z0-9]*\b[^<>]*\/>(?:\s*:\s*<[A-Z][A-Za-z0-9]*\b[^<>]*\/>\s*\})?)\s*<\/\1>/gs

test("every icon-only button has a name for screen readers", () => {
  const bad = []
  for (const f of files) { const s = fs.readFileSync(f, "utf8"); for (const m of s.matchAll(ICON_ONLY)) if (!/\b(title|aria-label)=/.test(m[2])) bad.push(path.relative(root, f) + ":" + (s.slice(0, m.index).split("\n").length)) }
  assert.deepEqual(bad, [], "botões só com ícone sem aria-label/title")
})
test("the detector really finds an unnamed icon button", () => {
  assert.equal([...'<button className="x" onClick={() => go(1)}><Trash2 size={14} /></button>'.matchAll(ICON_ONLY)].length, 1)
  assert.equal([...'<button onClick={go}><Plus size={14} /> Lista</button>'.matchAll(ICON_ONLY)].length, 0)
})
test("shared controls expose role and state", () => {
  const c = read("components/ui/controls.tsx")
  for (const need of ['role="switch"', "aria-checked={checked}", "aria-label={label}", "aria-pressed={value === o.value}", 'role="dialog"', 'aria-modal="true"', 'e.key === "Escape"']) assert.ok(c.includes(need), need)
})
test("keyboard focus ring exists and reduced motion reaches framer-motion", () => {
  const css = read("index.css")
  assert.match(css, /:focus-visible\s*\{\s*outline: 2px solid/)
  assert.match(read("main.tsx"), /<MotionConfig reducedMotion=\{animations \? "user" : "always"\}>/)
})
test("always-dark and retro themes keep their own text colors in light mode", () => {
  const css = read("index.css")
  assert.ok(css.includes('[data-theme="terminal"], html:not(.dark)[data-theme="terminal"] {'))
  assert.ok(css.includes('[data-theme="retro"], html:not(.dark)[data-theme="retro"] {'))
})
