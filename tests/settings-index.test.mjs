import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { SETTINGS_TABS, searchSettings } from "../src/sections/settingsIndex.ts"

const sources = ["src/sections/SettingsView.tsx", "src/sections/SettingsExtra.tsx", "src/shell/PackSettings.tsx", "src/pet/PetSettings.tsx", "src/sections/Templates.tsx", "src/sections/TemplateSharing.tsx"]
  .map((f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8")).join("\n")

test("every indexed section title still exists in the settings code", () => {
  // título fixo (title="…") ou passado por uma linha de fonte (label="…")
  for (const t of SETTINGS_TABS) for (const s of t.sections) assert.ok(sources.includes(`title="${s}"`) || sources.includes(`label="${s}"`), `"${s}" (${t.label}) is no longer a section title`)
})
test("every section title in the settings code can be found by the search", () => {
  const indexed = new Set(SETTINGS_TABS.flatMap((t) => t.sections))
  const inCode = [...sources.matchAll(/<(?:Section|SettingsSection)\s+title="([^"]+)"/g)].map((m) => m[1])
  assert.ok(inCode.length >= 40)
  for (const s of inCode) assert.ok(indexed.has(s), `seção "${s}" não está em settingsIndex.ts: a busca não a encontra`)
  assert.equal(searchSettings("pelagem")[0].tab, "pet")
  assert.equal(searchSettings("titulos")[0].tab, "fonts")
  assert.equal(searchSettings("importar template")[0].tab, "templates")
})
test("every settings tab has at least one section the search can jump to", () => {
  for (const t of SETTINGS_TABS) assert.ok(t.sections.length > 0, `aba "${t.label}" sem seções`)
})
test("every settings tab rendered by SettingsView is in the index", () => {
  const ids = [...sources.matchAll(/tab === "([a-z]+)" &&/g)].map((m) => m[1])
  assert.ok(ids.length >= 14)
  for (const id of ids) assert.ok(SETTINGS_TABS.some((t) => t.id === id), `tab "${id}" missing from the index`)
})
test("search finds sections, tabs and keywords, ignoring accents", () => {
  assert.deepEqual(searchSettings("backup na nuvem")[0], { tab: "system", tabLabel: "Sistema", section: "Backup na nuvem" })
  assert.equal(searchSettings("aparencia")[0].tab, "look")
  assert.equal(searchSettings("tecla windows")[0].tab, "taskbar")
  assert.equal(searchSettings("fps")[0].tab, "system")
  assert.deepEqual(searchSettings("zzzz"), [])
  assert.deepEqual(searchSettings("  "), [])
})
