// Motor de efeitos do widget do Valorant e catálogo de mapas, fora do navegador.
// O catálogo de agentes e de mapas usado aqui é uma cópia reduzida do catálogo público (tests/fixtures).
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { AGENT_FX, createScene, fallbackRecipe, hasSpecificFx, iconUrls, layersFor, recipeFor } from "../src/widgets/valorant/fx.ts"
import { cleanMaps, mapFromMatch, mapImage, pickRandom } from "../src/widgets/valorant/maps-core.ts"

const agents = JSON.parse(fs.readFileSync(new URL("./fixtures/valorant-agents.json", import.meta.url), "utf8")).data
const mapsRaw = JSON.parse(fs.readFileSync(new URL("./fixtures/valorant-maps.json", import.meta.url), "utf8")).data
const MODES = ["sig", "ult", "amb"]
const OPTS = { intensity: 1, particles: 1, eco: false }
const env = { sprite: () => ({ sprite: true }), image: () => ({ image: true }) }

/** contexto 2D falso: aceita tudo, guarda as chamadas e acusa número inválido (NaN/Infinity) */
function mockCtx() {
  const calls = []
  const bad = []
  const grad = { addColorStop(o, c) { if (!Number.isFinite(o)) bad.push("addColorStop") } }
  const target = { calls, bad, globalAlpha: 1, globalCompositeOperation: "source-over", fillStyle: "", strokeStyle: "", lineWidth: 1, lineCap: "butt", lineJoin: "miter", lineDashOffset: 0 }
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k]
      return (...args) => {
        calls.push([k, args])
        for (const a of args) if (typeof a === "number" && !Number.isFinite(a)) bad.push(String(k))
        if (k === "createLinearGradient" || k === "createRadialGradient") return grad
      }
    },
    set(t, k, v) { if (k === "globalAlpha" && !Number.isFinite(v)) bad.push("globalAlpha"); t[k] = v; return true },
  })
}
function run(agent, mode, size, opts = OPTS, seconds = 4, fps = 60) {
  const sc = createScene(agent, mode, size, opts, env)
  const ctx = mockCtx()
  for (let i = 0; i < seconds * fps; i++) { sc.step(1 / fps); if (i % 7 === 0) { sc.draw(ctx, "back"); sc.draw(ctx, "front") } }
  return { sc, ctx }
}

test("the fixture has the current roster (30 playable agents)", () => {
  assert.equal(agents.length, 30)
  assert.ok(agents.every((a) => /^[0-9a-f-]{36}$/.test(a.uuid)))
})

test("every agent from the catalog has an effect, specific or fallback", () => {
  for (const a of agents) {
    const r = recipeFor(a)
    assert.ok(r.sig.length >= 1, a.displayName)
    for (const m of MODES) assert.ok(layersFor(a, m).length >= 1, `${a.displayName} ${m}`)
  }
  const specific = agents.filter(hasSpecificFx).map((a) => a.displayName)
  // os agentes sem efeito próprio estão listados de propósito (docs/valorant-widget-animado.md)
  assert.deepEqual(agents.filter((a) => !hasSpecificFx(a)).map((a) => a.displayName).sort(), ["Hush", "Miks", "Veto"])
  assert.equal(specific.length, 27)
})

test("every specific recipe points at an agent that exists, by UUID, with a matching name", () => {
  for (const [uuid, r] of Object.entries(AGENT_FX)) {
    const a = agents.find((x) => x.uuid === uuid)
    assert.ok(a, `${r.name}: UUID ${uuid} não está no catálogo`)
    assert.equal(a.displayName, r.name)
  }
})

test("specific recipes are distinct from each other (no two agents share the same set of layers)", () => {
  const sigs = Object.values(AGENT_FX).map((r) => r.sig.map((l) => l.k + (l.v ?? "")).sort().join("+"))
  assert.equal(new Set(sigs).size, sigs.length)
})

test("Jett shows exactly five blades, in every mode and with any option", () => {
  const jett = agents.find((a) => a.displayName === "Jett")
  for (const mode of MODES) for (const opts of [OPTS, { intensity: 0.6, particles: 0.3, eco: true }, { intensity: 1.5, particles: 2, eco: false }]) {
    const { sc } = run(jett, mode, { w: 340, h: 330 }, opts, 1)
    assert.equal(sc.count("blades"), 5, `${mode} ${JSON.stringify(opts)}`)
  }
})

test("Jett's blades really go around her: some are drawn behind and some in front", () => {
  const jett = agents.find((a) => a.displayName === "Jett")
  const sc = createScene(jett, "sig", { w: 340, h: 330 }, OPTS, env)
  let back = 0, front = 0
  for (let i = 0; i < 120; i++) {
    sc.step(1 / 30)
    const b = mockCtx(), f = mockCtx()
    sc.draw(b, "back"); sc.draw(f, "front")
    back += b.calls.filter(([k]) => k === "rotate").length
    front += f.calls.filter(([k]) => k === "rotate").length
  }
  assert.ok(back > 0 && front > 0, `atrás ${back}, na frente ${front}`)
})

test("every agent draws without errors or invalid numbers, small and large, in every mode", () => {
  const extra = { uuid: "00000000-0000-0000-0000-000000000000", displayName: "Agente Novo", role: { displayName: "Sentinela" }, backgroundGradientColors: ["1a5d65ff", "0f1923ff", "0f1923ff", "1a5d65ff"], abilities: [{ slot: "Ultimate", displayIcon: "https://exemplo/ult.png" }] }
  for (const a of [...agents, extra]) for (const mode of MODES) for (const size of [{ w: 150, h: 110 }, { w: 980, h: 720 }]) {
    const { ctx } = run(a, mode, size, OPTS, 3)
    assert.deepEqual(ctx.bad, [], `${a.displayName} ${mode} ${size.w}x${size.h}`)
    assert.ok(ctx.calls.length > 0, `${a.displayName} ${mode} não desenhou nada`)
  }
})

test("a future agent missing from the table still gets an animated fallback from its role, palette and official icon", () => {
  const novo = { uuid: "11111111-2222-3333-4444-555555555555", displayName: "Futuro", role: { displayName: "Duelista" }, backgroundGradientColors: ["80451bff", "0f1923ff", "ffffffff", "0f1923ff"], abilities: [{ slot: "Ultimate", displayIcon: "https://media/ult.png" }, { slot: "Ability1", displayIcon: "https://media/q.png" }] }
  assert.equal(hasSpecificFx(novo), false)
  const r = fallbackRecipe(novo)
  assert.ok(r.sig.some((l) => l.k === "icons"))
  assert.deepEqual(iconUrls(novo), ["https://media/ult.png", "https://media/q.png"])
  const sc = createScene(novo, "sig", { w: 300, h: 300 }, OPTS, env)
  assert.ok(sc.kinds().includes("icons"))
  // sem ícones oficiais, a camada de ícones simplesmente não entra
  const semIcone = createScene({ ...novo, abilities: [] }, "sig", { w: 300, h: 300 }, OPTS, env)
  assert.ok(!semIcone.kinds().includes("icons"))
})

test("speed does not depend on the frame rate (60 Hz and 180 Hz end in the same place)", () => {
  const jett = agents.find((a) => a.displayName === "Jett")
  const where = (fps) => {
    const sc = createScene(jett, "sig", { w: 340, h: 330 }, OPTS, env)
    for (let i = 0; i < 2 * fps; i++) sc.step(1 / fps)
    const ctx = mockCtx()
    sc.draw(ctx, "back"); sc.draw(ctx, "front")
    return ctx.calls.filter(([k]) => k === "translate").map(([, a]) => a.map((v) => Math.round(v * 10) / 10).join(","))
  }
  assert.deepEqual(where(180), where(60))
  assert.deepEqual(where(144), where(60))
})

test("ambient mode drops flashes and explosions; the ultimate mode adds intensity", () => {
  for (const a of agents) {
    assert.ok(layersFor(a, "amb").every((l) => !l.loud), a.displayName)
    const sum = (m) => layersFor(a, m).reduce((n, l) => n + (l.n ?? 1), 0)
    assert.ok(sum("ult") >= sum("sig") || AGENT_FX[a.uuid]?.ult, a.displayName)
  }
})

test("economy mode and fewer particles really draw less", () => {
  const phoenix = agents.find((a) => a.displayName === "Phoenix")
  const full = createScene(phoenix, "sig", { w: 340, h: 330 }, OPTS, env).count("embers")
  const eco = createScene(phoenix, "sig", { w: 340, h: 330 }, { ...OPTS, eco: true }, env).count("embers")
  const few = createScene(phoenix, "sig", { w: 340, h: 330 }, { ...OPTS, particles: 0.3 }, env).count("embers")
  assert.ok(eco < full && few < full, `${full} ${eco} ${few}`)
})

test("resizing keeps the effect and its counts", () => {
  const jett = agents.find((a) => a.displayName === "Jett")
  const sc = createScene(jett, "sig", { w: 340, h: 330 }, OPTS, env)
  sc.resize(180, 140)
  assert.equal(sc.count("blades"), 5)
  const ctx = mockCtx()
  sc.step(0.5); sc.draw(ctx, "back"); sc.draw(ctx, "front")
  assert.deepEqual(ctx.bad, [])
})

test("map catalog: duplicates removed, competitive maps first, images and match lookup", () => {
  const maps = cleanMaps(mapsRaw)
  const names = maps.map((m) => m.displayName)
  assert.equal(new Set(names).size, names.length, "nomes repetidos")
  const firstOther = maps.findIndex((m) => !m.tacticalDescription)
  assert.ok(firstOther > 0 && maps.slice(firstOther).every((m) => !m.tacticalDescription), "competitivos primeiro")
  for (const n of ["Ascent", "Bind", "Haven", "Split", "Lotus", "Sunset"]) assert.ok(names.includes(n), n)
  const ascent = maps.find((m) => m.displayName === "Ascent")
  assert.match(mapImage(ascent, "splash"), /^https:\/\/media\.valorant-api\.com\/maps\/.+\/splash\.png$/)
  assert.match(mapImage(ascent, "stylized"), /stylizedbackgroundimage\.png$/)
  assert.equal(mapFromMatch(maps, "/Game/Maps/Ascent/Ascent")?.displayName, "Ascent")
  assert.equal(mapFromMatch(maps, "/game/maps/ascent/ascent")?.displayName, "Ascent")
  assert.equal(mapFromMatch(maps, "/Game/Maps/Nada/Nada"), undefined)
  assert.equal(mapFromMatch(maps, null), undefined)
})

test("map catalog: missing images fall back to the splash; bad data is ignored", () => {
  const maps = cleanMaps([{ uuid: "x", displayName: "Teste", splash: "https://s.png", stylizedBackgroundImage: null }, { uuid: "y", displayName: "Sem imagem" }, null, 7])
  assert.equal(maps.length, 1)
  assert.equal(mapImage(maps[0], "stylized"), "https://s.png")
  assert.equal(mapImage(maps[0], "premier"), "https://s.png")
  assert.deepEqual(cleanMaps(null), [])
})

test("random map is stable for the same agent and session, and only competitive maps are drawn", () => {
  const maps = cleanMaps(mapsRaw)
  const a = pickRandom(maps, "jett-sessao1"), b = pickRandom(maps, "jett-sessao1")
  assert.equal(a.uuid, b.uuid)
  const seen = new Set()
  for (let i = 0; i < 200; i++) { const m = pickRandom(maps, "seed" + i); assert.ok(m.tacticalDescription, m.displayName); seen.add(m.displayName) }
  assert.ok(seen.size >= 6, "sorteio variado")
  assert.equal(pickRandom([], "x"), undefined)
})

test("the new options are part of the saved look (so templates, backup and restart keep them)", () => {
  const src = fs.readFileSync(new URL("../src/widgets/ValAgentWidget.tsx", import.meta.url), "utf8")
  const def = src.slice(src.indexOf("export const DEFAULT_LOOK"), src.indexOf("export const PRESETS"))
  for (const k of ["fx:", "fxMode:", "fxIntensity:", "fxSpeed:", "fxParticles:", "fxParallax:", "fxPauseHidden:", "fxEco:", "mapFollow:", "mapImage:", "mapScale:", "mapX:", "mapY:", "mapDim:", "mapBlur:", "mapSat:", "mapVivid:", "mapGrad:", "mapParallax:", "mapPan:", "imgBright:", "imgShadow:"]) assert.ok(def.includes(k), k)
  // um look antigo (sem as opções novas) recebe os padrões: lookOf mistura o padrão com o que foi salvo
  assert.match(src, /const lookOf = \(c: Record<string, any>\): ValLook => \(\{ \.\.\.DEFAULT_LOOK, \.\.\.\(c\.look \?\? \{\}\) \}\)/)
})

test("backup keeps the widget look and the agent templates with the new options", async () => {
  const { buildBackup, parseBackup } = await import("../src/lib/backup.ts")
  const look = { bg: "map", mapId: "7eaecc1b-4337-bbf6-6ab9-04b8f06b3319", mapBlur: 3, fx: true, fxMode: "ult", fxIntensity: "high", fxEco: true, imgBright: 1.1 }
  const state = { settings: { theme: "glass" }, widgets: [{ id: "v", type: "valagent", x: 1, y: 2, w: 300, h: 300, config: { auto: false, agent: "add6443a-41bd-e414-f6ad-e58d267f4e95", look } }], valTemplates: [{ id: "t", name: "Jett no Ascent", agent: "add6443a-41bd-e414-f6ad-e58d267f4e95", look }] }
  const r = parseBackup(JSON.stringify(buildBackup(state)), { defaults: { theme: "glass" }, widgetTypes: ["valagent"] })
  assert.equal(r.ok, true)
  assert.deepEqual(r.data.widgets[0].config.look, look)
  assert.deepEqual(r.data.valTemplates[0].look, look)
})
