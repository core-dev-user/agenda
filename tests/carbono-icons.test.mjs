import test from "node:test"
import assert from "node:assert/strict"
import { classifyAppIcon } from "../src/shell/monoIconMap.ts"

test("ícones Carbono redesenham programas como pictogramas por categoria", () => {
  const cases = [
    ["Google Chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "browser"],
    ["Discord", "C:\\Users\\user\\AppData\\Local\\Discord\\Discord.exe", "chat"],
    ["VALORANT", "D:\\Riot Games\\VALORANT\\VALORANT-Win64-Shipping.exe", "game"],
    ["Spotify", "C:\\Spotify.exe", "music"],
    ["Visual Studio Code", "C:\\Code.exe", "code"],
    ["Windows PowerShell", "C:\\powershell.exe", "terminal"],
    ["Adobe Photoshop", "C:\\Photoshop.exe", "image"],
    ["File Explorer", "C:\\explorer.exe", "file"],
  ]
  for (const [name, exe, wanted] of cases) assert.equal(classifyAppIcon(name, exe), wanted, name)
})
test("apps desconhecidos sempre recebem ícones abstratos previsíveis, sem logos", () => {
  const name = "Aplicativo Desconhecido 2026"
  const first = classifyAppIcon(name, "C:\\x.exe")
  assert.match(first, /^abstract-[0-5]$/)
  assert.equal(classifyAppIcon(name, "D:\\x.exe"), first)
  assert.ok(classifyAppIcon(""), "even empty names have a fallback")
})
test("pasta do executável não altera a categoria do aplicativo", () => {
  assert.match(classifyAppIcon("Desconhecido", "C:\\Steam\\arquivo.exe"), /^abstract-/)
})

test("launcher, barra e menu Carbono usam pictogramas, sem ícones Windows quebrados", async () => {
  const { readFileSync } = await import("node:fs")
  const { fileURLToPath } = await import("node:url")
  const path = await import("node:path")
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
  const read = (p) => readFileSync(path.join(root, p), "utf8")
  const launcher = read("src/shell/Carbono.tsx")
  const bar = read("src/bar/SystemBar.tsx")
  const menu = read("src/bar/BarMenu.tsx")
  const app = read("src/App.tsx")
  const sync = read("src/bar/sync.ts")
  assert.match(launcher, /MonoAppIcon/)
  assert.doesNotMatch(launcher, /bridge\.bar\.icon\(/)
  assert.match(bar, /mono=\{carbono\}/)
  assert.match(menu, /mono=\{carbono\}/)
  assert.match(app, /mainBar \? <CarbonoBorder \/>/)
  assert.match(sync, /r\.dataset\.pack = "carbono"/)
  assert.match(sync, /surfaceVars\(s\.shell\?\.railBg/)
})

test("a barra nativa importa só a paleta pura e não inicia o store da janela principal", async () => {
  const { readFileSync } = await import("node:fs")
  const { fileURLToPath } = await import("node:url")
  const path = await import("node:path")
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
  const sync = readFileSync(path.join(root, "src/bar/sync.ts"), "utf8")
  const palette = readFileSync(path.join(root, "src/shell/colorTokens.ts"), "utf8")
  assert.match(sync, /from ["']@\/shell\/colorTokens["']/)
  assert.doesNotMatch(sync, /from ["']@\/shell\/pack["']/)
  assert.doesNotMatch(palette, /@\/lib\/store|zustand|Electron|require\(/)
})
