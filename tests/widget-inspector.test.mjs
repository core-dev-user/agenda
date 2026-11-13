import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const dir = new URL("../src/widgets/", import.meta.url)
const read = (f) => fs.readFileSync(new URL(f, dir), "utf8")
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".tsx"))

test("every widget settings panel is built with the inspector pieces, not the old dialog controls", () => {
  // os controles antigos (Switch, Segmented, Slider, ColorPicker) davam a cada widget um painel diferente
  const old = files.filter((f) => /import \{[^}]*\b(Switch|Segmented|Slider|ColorPicker)\b[^}]*\} from "@\/components\/ui\/controls"/.test(read(f)))
  assert.deepEqual(old, [])
  assert.ok(!read("WidgetFrame.tsx").includes("function WidgetSettings"), "o diálogo antigo voltou")
})
test("every widget type listed as having its own options has a content panel", () => {
  const src = read("WidgetInspector.tsx")
  const listed = [...src.match(/const HAS_CONTENT = new Set\(\[([^\]]+)\]\)/)[1].matchAll(/"([a-z0-9]+)"/g)].map((m) => m[1])
  assert.ok(listed.length >= 15)
  const body = src.slice(src.indexOf("function Content("), src.indexOf("function ClockContent("))
  for (const t of listed) assert.ok(body.includes(`case "${t}"`), `"${t}" está em HAS_CONTENT mas não tem painel de conteúdo`)
  // e o contrário: nenhum painel de conteúdo fica inalcançável por faltar na lista
  for (const m of body.matchAll(/case "([a-z0-9]+)"/g)) assert.ok(listed.includes(m[1]), `"${m[1]}" tem painel mas não está em HAS_CONTENT`)
})
test("the accent color control only shows for widgets that use the accent color", () => {
  const look = read("widgetLook.tsx")
  const uses = [...look.match(/const USES_ACCENT = new Set\(\[([^\]]+)\]\)/)[1].matchAll(/"([a-z0-9]+)"/g)].map((m) => m[1])
  const fileOf = { clock: "Clock.tsx", stopwatch: "Stopwatch.tsx", calendar: "Misc.tsx", tasks: "Tasks.tsx", shortcut: "SectionWidget.tsx", music: "MusicWidget.tsx", pcmusic: "PcMusicWidget.tsx", cs2: "Sports.tsx", valorant: "Sports.tsx", football: "Sports.tsx", countdown: "Countdown.tsx", sysmon: "SysMonWidget.tsx", valagent: "ValAgentWidget.tsx" }
  for (const t of uses) {
    assert.ok(fileOf[t], `diga em qual arquivo "${t}" usa a cor de destaque`)
    assert.match(read(fileOf[t]), /var\(--accent\)|--wacc|\b(bg|text|border|ring)-brand\b/, `"${t}" está em USES_ACCENT mas ${fileOf[t]} não usa a cor de destaque`)
  }
  assert.ok(look.includes("accentMatters &&"))
})
test("the panel opens beside the widget, without a backdrop, one at a time", () => {
  const ins = read("inspector.tsx")
  assert.ok(ins.includes("data-inspector") && ins.includes('role="dialog"') && ins.includes('e.key !== "Escape"'))
  assert.ok(!/bg-black\/\d+[^"]*" (initial|onMouseDown)/.test(ins), "o painel não deve escurecer a tela")
  assert.ok(read("WidgetInspector.tsx").includes("export const useInspector = create<{ id: string | null }>"))
})
