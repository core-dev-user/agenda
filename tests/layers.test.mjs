import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const read = (rel) => fs.readFileSync(new URL("../src/" + rel, import.meta.url), "utf8")

// O quadro de cada monitor (.screen-frame) tem transform: as camadas de dentro dele (barra 800, painéis 810)
// só valem lá dentro. Estas três peças juntas é que mantêm os painéis da barra acima das janelas.
test("an open dock panel lifts its screen frame above the windows", () => {
  assert.match(read("index.css"), /\.screen-frame:has\(\[data-dock-menu\]\)\s*\{\s*z-index:\s*800;/)
  assert.ok(read("components/Taskbar.tsx").includes("data-dock-menu"), "painéis da barra do Widgy")
  assert.ok(read("shell/Carbono.tsx").includes("data-dock-menu"), "painéis da barra lateral do Carbono")
})
test("widget inner layers stay inside the desktop layer", () => {
  assert.match(read("App.tsx"), /className="absolute inset-0 isolate" data-desktop/)
})
test("dock panels close with Esc and the search adds the first result with Enter", () => {
  const t = read("components/Taskbar.tsx")
  assert.ok(t.includes('e.key !== "Escape"') && t.includes("setMenuRef.current(null)"))
  assert.ok(t.includes('e.key === "Enter" && query && list.length'))
})
