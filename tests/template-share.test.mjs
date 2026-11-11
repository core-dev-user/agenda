import test from "node:test"
import assert from "node:assert/strict"
import {
  encodeTemplate, decodeTemplate, extractShareCode, shareLink,
  importedTemplate, safeAppearance,
} from "../src/lib/templateShare.ts"

const example = {
  name: "Carbono Teste",
  settings: {
    theme: "minimal", dark: true, accent: "#7ca9ff", radius: 18,
    wallpaper: { type: "image", image: "c:\\Users\\Private\\personal.jpg", video: "private.mov", gradient: "dusk", color: "#121212" },
    shell: { pack: "carbono", side: "left", prev: { nick: "Não enviar" } },
    nick: "NOME PESSOAL", pcPins: [{ path: "C:\\private" }],
    calendars: [{ url: "https://private.example/ical/SECRET" }],
    ai: { apiKey: "TOKEN-SECRET" },
  },
  widgets: [
    { id: "personal-id", type: "note", x: 12, y: 40, w: 280, h: 180, config: { text: "CONTEUDO-PRIVADO", color: "#aabbcc", url: "https://private.example" } },
    { id: "private-shortcut", type: "shortcut", x: 20, y: 80, w: 120, h: 80, config: { path: "C:\\private.exe", style: "glass" } },
  ],
}

test("gera código independente de servidor, com link de importação", async () => {
  const code = await encodeTemplate(example)
  assert.ok(code.startsWith("WDG1-"))
  const url = shareLink(code)
  assert.ok(url?.startsWith("widgy://template/WDG1-"))
  assert.equal(extractShareCode(url), code)
  const decoded = await decodeTemplate(url)
  assert.equal(decoded.name, "Carbono Teste")
  assert.equal(decoded.settings.theme, "minimal")
  assert.equal(decoded.widgets?.length, 2)
})

test("remove dados privados, caminhos de mídia e textos antes de exportar", async () => {
  const code = await encodeTemplate(example)
  const result = await decodeTemplate(code)
  const printed = JSON.stringify(result)
  for (const secret of ["CONTEUDO-PRIVADO", "NOME PESSOAL", "TOKEN-SECRET", "personal.jpg", "private.mov", "private.example", "personal-id", "C:\\private", "Não enviar"]) {
    assert.equal(printed.includes(secret), false, secret)
  }
  assert.equal(result.settings.wallpaper.type, "gradient")
  assert.equal(result.widgets[0].config.color, "#aabbcc")
  assert.equal(result.widgets[0].config.text, undefined)
})

test("gera novos IDs em cada importação e não reutiliza IDs originais", async () => {
  const decoded = await decodeTemplate(await encodeTemplate(example))
  let id = 0
  const a = importedTemplate(decoded, () => "id-" + ++id)
  const b = importedTemplate(decoded, () => "id-" + ++id)
  assert.notEqual(a.id, b.id)
  assert.notEqual(a.widgets[0].id, b.widgets[0].id)
  assert.equal(a.settings.nick, undefined)
})

test("códigos inválidos e formatos incompatíveis são rejeitados", async () => {
  assert.throws(() => extractShareCode("https://site-falso.invalid/t/WDG1-abc"))
  await assert.rejects(() => decodeTemplate("WDG1-" + "A".repeat(40)))
  assert.throws(() => safeAppearance(null))
  await assert.rejects(() => encodeTemplate({ name: "teste", settings: { nick: "privado" } }))
})

test("rejeita excesso de widgets e preserva somente aparência permitida", async () => {
  const widgets = Array.from({ length: 81 }, (_, i) => ({ id: String(i), type: "clock", x: i, y: 0, w: 100, h: 100, config: {} }))
  await assert.rejects(() => encodeTemplate({ ...example, widgets }), /widgets/)
  const safe = safeAppearance({ theme: "glass", musicAutostart: true, wallpaperBy: { secret: { image: "private" } } })
  assert.deepEqual(safe, { theme: "glass" })
})
