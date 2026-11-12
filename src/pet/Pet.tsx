/**
 * Bichinho da área de trabalho: um gatinho em pixel art que anda pelo chão (em cima da barra de tarefas),
 * pula para cima dos widgets, senta, se lambe, dorme… Clique nele para mudar o que está fazendo
 * (anda → senta → dorme → anda) e segure para pegar no colo e soltar em outro lugar.
 *
 * Tudo roda num laço de animação só (que dorme quando ninguém está vendo) e mexe direto no DOM,
 * sem re-desenhar o React a cada quadro.
 */
import { screenList } from "@/lib/screens"
import { useEffect, useRef } from "react"
import { useStore } from "@/lib/store"
import { perfPaused, perfPetFps } from "@/lib/perf"
import { fontFamily } from "@/lib/fonts"
import type { PetOne, PetPrefs } from "@/lib/types"
import { frame, frameBox, GH, GW, isSpecies, SPECIES, type Pose, type Species } from "./sprites"

export const PET_DEFAULT: PetPrefs = { on: true, species: "cat", color: "orange", scale: 3, widgets: true, energy: 1 }

type Act = "idle" | "fire" | "walk" | "sit" | "groom" | "sleep" | "stretch" | "crouch" | "air" | "land" | "drag"
interface Plat { id: string; x1: number; x2: number; y: number; el?: Element }
interface JumpPlan { plat: Plat; x: number }

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(items: [T, number][]): T => {
  const sum = items.reduce((s, [, w]) => s + w, 0)
  let r = Math.random() * sum
  for (const [v, w] of items) if ((r -= w) <= 0) return v
  return items[0][0]
}
const q = (v: number, steps: number) => Math.round(v * steps) / steps

/**
 * Laço de animação dos bichinhos — UM só para todos.
 * Em cada quadro, primeiro todos leem a tela (onde estão os widgets) e calculam o movimento;
 * depois todos escrevem a posição. Com um laço por bichinho, um lia logo depois de o outro escrever
 * e o navegador recalculava o layout da página várias vezes por quadro: era o "travado".
 * Segue o orçamento de desempenho (Qualidade = ritmo da tela), sempre com passos regulares.
 * Continua quando o Agenda está em segundo plano ou com um jogo aberto (mais leve: 30 quadros por segundo);
 * para de verdade só com a janela invisível, ou se a opção "continuar com jogo aberto" estiver desligada.
 */
type PetJob = { step: () => (() => void) | void; keep: () => boolean }
const petJobs = new Set<PetJob>()
let petRaf = 0, petTimer = 0, petLast = 0
function petTick(ts: number) {
  petRaf = 0
  if (!petJobs.size) return
  const paused = perfPaused()
  const jobs = [...petJobs].filter((j) => !document.hidden && !(paused && !j.keep()))
  if (!jobs.length) { petTimer = window.setTimeout(() => { petTimer = 0; petRaf = requestAnimationFrame(petTick) }, 500); return }
  // Pets têm orçamento de 60 FPS no Auto, independente dos efeitos decorativos.
  // Jogos, economia e valores personalizados continuam respeitados.
  const budget = perfPetFps()
  const fps = paused ? Math.min(24, budget) : budget >= 55 ? 0 : budget
  if (fps) {
    const every = 1000 / fps
    // tolerância de 2 ms e fase preservada: evita o vai-e-vem 33/50 ms numa tela de 60 Hz
    if (ts - petLast < every - 2) { petRaf = requestAnimationFrame(petTick); return }
    petLast = ts - petLast > every * 2 ? ts : petLast + every
  } else petLast = ts
  const commits: (() => void)[] = []
  for (const j of jobs) { const c = j.step(); if (c) commits.push(c) }
  for (const c of commits) c()
  petRaf = requestAnimationFrame(petTick)
}
function petLoop(step: () => (() => void) | void, keepGoing: () => boolean) {
  const job: PetJob = { step, keep: keepGoing }
  petJobs.add(job)
  if (!petRaf && !petTimer) petRaf = requestAnimationFrame(petTick)
  return () => {
    petJobs.delete(job)
    if (!petJobs.size) { cancelAnimationFrame(petRaf); clearTimeout(petTimer); petRaf = 0; petTimer = 0; petLast = 0 }
  }
}

/** pede ao gatinho para vir até o meio da tela (Configurações › Bichinho) */
export const callPet = () => window.dispatchEvent(new CustomEvent("agenda:pet", { detail: "call" }))

/** a lista de bichinhos (configurações antigas tinham um só: species/color/name) */
export function petList(prefs: PetPrefs | undefined): PetOne[] {
  const p = { ...PET_DEFAULT, ...prefs }
  if (p.list) return p.list
  return [{ id: "p1", species: isSpecies(p.species) ? p.species : "cat", color: p.color, name: p.name }]
}

export function Pet() {
  const prefs = useStore((s) => s.settings.pet) ?? PET_DEFAULT
  if (!prefs.on) return null
  return <>{petList(prefs).map((one, i) => <Cat key={one.id} prefs={prefs} one={one} index={i} />)}</>
}

function Cat({ prefs, one, index }: { prefs: PetPrefs; one: PetOne; index: number }) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const shadow = useRef<HTMLDivElement>(null)
  const fx = useRef<HTMLDivElement>(null)
  // preferências lidas dentro do laço (sem reiniciar o gato quando muda a cor ou o tamanho)
  const P = useRef(prefs)
  P.current = prefs
  const O1 = useRef(one)
  O1.current = one
  const I = useRef(index)
  I.current = index
  const label = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cv = canvas.current!, wr = wrap.current!, sh = shadow.current!, fxl = fx.current!, lb = label.current!
    const ctx = cv.getContext("2d")!
    const sc = () => Math.max(2, Math.min(6, P.current.scale || 3))
    const energy = () => Math.max(0.3, Math.min(1.6, P.current.energy || 1))
    const species = (): Species => (isSpecies(O1.current.species) ? O1.current.species : "cat")
    const coat = () => O1.current.color

    /* ---------------- plataformas: chão, barra de tarefas e o topo dos widgets ---------------- */
    let plats: Plat[] = []
    // chão: o pé da área livre (em vários monitores, acima da barra de cada um)
    const floor = (): Plat => ({ id: "floor", x1: 0, x2: innerWidth, y: Math.min(innerHeight, ...screenList().map((sc) => sc.y + sc.h)) - 1 })
    const rectPlat = (id: string, el: Element): Plat | null => {
      const r = el.getBoundingClientRect()
      const s = sc()
      if (r.width < 18 * s * 0.8 || r.height < 20 || r.top < GH * s + 8 || r.top > innerHeight - 12 || r.right < 0 || r.left > innerWidth) return null
      return { id, x1: r.left + 4 * s, x2: r.right - 4 * s, y: Math.round(r.top) + 1, el }
    }
    const scan = () => {
      const out: Plat[] = [floor()]
      const tb = document.querySelector("[data-pet-plat]")
      if (tb) { const p = rectPlat("taskbar", tb); if (p) out.push(p) }
      if (P.current.widgets) document.querySelectorAll("[data-widget]").forEach((el) => { const p = rectPlat("w:" + (el as HTMLElement).dataset.widget, el); if (p) out.push(p) })
      plats = out
    }
    /** Reusa as posições medidas no scan; evita getBoundingClientRect a cada frame/pet. */
    const live = (p: Plat): Plat | null => p.id === "floor"
      ? (plats[0] ?? floor())
      : plats.find((item) => item.id === p.id) ?? null

    /* ---------------- estado ---------------- */
    const s0 = sc()
    const st = {
      x: rnd(innerWidth * 0.2, innerWidth * 0.8), y: -GH * s0, vx: 0, vy: 0, dir: 1 as 1 | -1,
      act: "air" as Act, t: 0, dur: 0, plat: null as Plat | null,
      phase: 0, tailT: 0, blinkAt: 2, blinkUntil: 0, happyUntil: 0,
      sq: 1, sqv: 0, targetX: 0, then: null as JumpPlan | null, run: false,
      hold: 0, zAt: 0, groomPaw: 0, swing: 0,
      // dragão: altura do voo, batida das asas e fogo
      hov: 0, flapT: 0, fireUntil: 0, emberAt: 0,
    }
    scan()

    const setAct = (a: Act, dur = 0) => { st.act = a; st.t = 0; st.dur = dur }
    const squash = (v: number) => { st.sq = v; st.sqv = 0 }

    /* ---------------- partículas (coração, zzz) ---------------- */
    const puff = (text: string, color: string, dx: number, dy: number, size: number, rise: number, ms: number) => {
      const s = sc()
      const el = document.createElement("span")
      el.textContent = text
      el.style.cssText = `position:absolute;left:${st.x + dx * s}px;top:${st.y + dy * s}px;font-family:${fontFamily("press")};font-size:${size * s}px;color:${color};text-shadow:0 ${s / 2}px 0 rgb(0 0 0 / .35);pointer-events:none;image-rendering:pixelated;`
      fxl.appendChild(el)
      el.animate([{ transform: "translate(-50%,0) scale(.6)", opacity: 0 }, { transform: `translate(-50%,${-rise * 0.3}px) scale(1)`, opacity: 1, offset: 0.2 }, { transform: `translate(calc(-50% + ${rise * 0.25}px),${-rise}px) scale(1)`, opacity: 0 }], { duration: ms, easing: "cubic-bezier(.2,.7,.3,1)" }).onfinish = () => el.remove()
    }
    const heart = () => puff("♥", "#ff7aa8", 0, -GH + 2, 5, 60, 1100)
    // cabrinha bale, cachorro late, sapo coaxa, dragão ruge
    const sound = () => SPECIES[species()].sound
    const bleat = () => {
      const snd = sound()
      if (!snd) return heart()
      puff(snd[Math.floor(Math.random() * snd.length)], SPECIES[species()].soundColor ?? "#ffffff", st.dir * 9, -GH + 1, 2.6, 50, 1400)
    }

    /* ---------------- fogo do dragão ---------------- */
    const isDragon = () => species() === "dragon"
    const FIRE = ["#fff6b0", "#ffd23f", "#ffb02e", "#ff7a1a", "#ff4d1a"]
    /** uma brasinha quadrada saindo da boca, que voa para a frente, esfria e vira fumaça */
    const ember = () => {
      const s = sc()
      // boca do desenho voando: (28, 8.5) na grade de 32×24
      const mx = st.x + st.dir * (28 - GW / 2) * s
      const my = st.y - st.hov - (GH - 8.5) * s
      const el = document.createElement("span")
      const sz = Math.round(s * rnd(1.2, 2.4))
      const c = FIRE[Math.floor(Math.random() * FIRE.length)]
      el.style.cssText = `position:absolute;left:${mx}px;top:${my}px;width:${sz}px;height:${sz}px;background:${c};box-shadow:0 0 ${s * 2}px ${c};pointer-events:none`
      fxl.appendChild(el)
      const dx = st.dir * rnd(40, 95) * (s / 3), dy = rnd(-12, 8) * (s / 3)
      el.animate([
        { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
        { transform: `translate(calc(-50% + ${dx * 0.55}px), calc(-50% + ${dy * 0.55}px)) scale(1.1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy - 12 * (s / 3)}px)) scale(.4)`, opacity: 0, background: "#5d5566", boxShadow: "none" },
      ], { duration: rnd(420, 760), easing: "cubic-bezier(.2,.7,.4,1)" }).onfinish = () => el.remove()
    }
    const breathe = (ms = 900) => { st.fireUntil = performance.now() + ms }

    /* ---------------- decisões ---------------- */
    const nightOwl = () => { const h = new Date().getHours(); return h >= 23 || h < 6 }

    const planWalk = (run = false) => {
      const p = st.plat!
      const s = sc()
      const m = 10 * s
      if (p.x2 - p.x1 < 2 * m) { setAct("sit", rnd(4, 8)); return }
      const reach = rnd(60, 340) * (s / 3)
      let tx = st.x + (Math.random() < 0.5 ? -1 : 1) * reach
      tx = Math.max(p.x1 + m, Math.min(p.x2 - m, tx))
      if (Math.abs(tx - st.x) < 12) tx = st.x + (st.x > (p.x1 + p.x2) / 2 ? -1 : 1) * Math.min(80, (p.x2 - p.x1) / 3)
      st.targetX = tx; st.run = run; st.then = null
      setAct("walk")
    }

    /** escolhe um widget (ou o chão) para pular */
    const planJump = (): boolean => {
      const cur = st.plat
      if (!cur) return false
      scan()
      const s = sc()
      const maxUp = 105 * s, maxDx = 150 * s, m = 10 * s
      const opts: [JumpPlan & { take: number }, number][] = []
      for (const p of plats) {
        if (p.id === cur.id || p.x2 - p.x1 < 2 * m) continue
        const up = st.y - p.y
        if (up > maxUp || (p.id === "floor" && cur.id === "floor")) continue
        let lx: number, take: number
        if (up < 0 && cur.id !== "floor") {
          // descer: vai até uma beirada e pula para fora dela
          const side = Math.random() < 0.5 ? -1 : 1
          take = side > 0 ? cur.x2 - m : cur.x1 + m
          lx = Math.max(p.x1 + m, Math.min(p.x2 - m, take + side * rnd(40, 110) * (s / 3)))
          if (lx > cur.x1 - 4 * s && lx < cur.x2 + 4 * s) continue
        } else {
          // subir: chega no ponto do widget mais perto do gato, saindo um pouco antes
          lx = Math.max(p.x1 + m, Math.min(p.x2 - m, st.x + rnd(-40, 40) * (s / 3)))
          const side = lx >= st.x ? 1 : -1
          take = Math.max(cur.x1 + m, Math.min(cur.x2 - m, lx - side * rnd(20, 50) * (s / 3)))
        }
        if (Math.abs(lx - take) > maxDx) continue
        // prefere subir em widgets; o chão e a barra só de vez em quando
        const w = p.id.startsWith("w:") ? (up > 0 ? 3 : 1.5) : p.id === "taskbar" ? 1.6 : 0.7
        opts.push([{ plat: p, x: lx, take }, w / (1 + Math.abs(lx - st.x) / 400)])
      }
      if (!opts.length) return false
      const j = pick(opts)
      st.targetX = j.take; st.then = { plat: j.plat, x: j.x }; st.run = Math.abs(j.take - st.x) > 120
      setAct("walk")
      return true
    }

    const next = () => {
      const e = energy()
      st.hold = 0
      const from = st.act
      if (from === "sleep") { setAct("stretch", 1.3); return }
      const sleepy = nightOwl() ? 3 : 1
      const onWidget = !!st.plat?.id.startsWith("w:")
      const choice = pick<string>([
        ["walk", 40 * e],
        ["jump", (onWidget ? 14 : 22) * e * e * (SPECIES[species()].jumpy ?? 1)],
        ["sit", from === "sit" ? 6 : 24],
        ["groom", from === "sit" || from === "groom" ? 14 : 4],
        ["sleep", (from === "sit" || from === "groom" ? 16 : 4) * sleepy / e],
        ["idle", 10],
        ["fire", isDragon() ? 7 * e : 0],
      ])
      if (choice === "walk") planWalk(Math.random() < 0.18 * e)
      else if (choice === "jump") { if (!planJump()) planWalk() }
      else if (choice === "sit") setAct("sit", rnd(4, 14))
      else if (choice === "fire") { setAct("fire", rnd(1.2, 1.8)); breathe(rnd(800, 1200)) }
      else if (choice === "groom") setAct("groom", rnd(2.2, 4.5))
      else if (choice === "sleep") setAct("sleep", rnd(25, 80) * sleepy)
      else { setAct("idle", rnd(1, 3)); if (sound() && Math.random() < 0.25) bleat() }
    }

    const launch = (j: JumpPlan) => {
      const s = sc()
      const g = 900 * s
      const dx = j.x - st.x, dy = j.plat.y - st.y
      const T = Math.max(0.32 + Math.abs(dx) / (520 * s), Math.sqrt((2 * Math.max(0, -dy)) / g) * 1.28)
      st.vx = dx / T
      st.vy = dy / T - 0.5 * g * T
      st.dir = dx >= 0 ? 1 : -1
      st.plat = null
      // dragão voando baixinho: o pulo sai da altura em que ele está
      st.y -= st.hov; st.hov = 0
      squash(1.18)
      setAct("air")
    }

    /* ---------------- clique e arrastar ---------------- */
    let press: { x: number; y: number; t: number; moved: boolean; lx: number; ly: number; lt: number; vx: number; vy: number } | null = null
    const hit = wr.querySelector("[data-pet-hit]") as HTMLElement
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault(); e.stopPropagation()
      hit.setPointerCapture(e.pointerId)
      press = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, lx: e.clientX, ly: e.clientY, lt: performance.now(), vx: 0, vy: 0 }
    }
    const move = (e: PointerEvent) => {
      if (!press) return
      const now = performance.now()
      if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) { press.moved = true; st.plat = null; setAct("drag"); st.hold = 0; st.hov = 0; st.fireUntil = 0 }
      const dt = Math.max(1, now - press.lt) / 1000
      press.vx = press.vx * 0.6 + ((e.clientX - press.lx) / dt) * 0.4
      press.vy = press.vy * 0.6 + ((e.clientY - press.ly) / dt) * 0.4
      press.lx = e.clientX; press.ly = e.clientY; press.lt = now
      if (press.moved) { st.x = e.clientX; st.y = e.clientY + 17 * sc() }
    }
    const up = () => {
      if (!press) return
      const p = press
      press = null
      if (p.moved) {
        // solta: cai com um pouco do embalo do mouse
        st.vx = Math.max(-1400, Math.min(1400, p.vx * 0.6)); st.vy = Math.max(-1200, Math.min(900, p.vy * 0.5))
        setAct("air")
        return
      }
      // clique: muda o que está fazendo (anda → senta → dorme → anda)
      if (isDragon() && Math.random() < 0.5) breathe(800)
      else if (sound() && Math.random() < 0.6) bleat()
      else heart()
      st.happyUntil = performance.now() + 1300
      if (!st.plat) return
      const a = st.act
      if (a === "sleep") { st.hold = 0; setAct("stretch", 1.3) }
      else if (a === "sit" || a === "groom") { setAct("sleep", 120); st.hold = performance.now() + 110_000 }
      else if (a === "walk" || a === "stretch" || a === "crouch") { setAct("sit", 25); st.hold = performance.now() + 22_000 }
      else { st.hold = 0; planWalk(Math.random() < 0.3) }
    }
    hit.addEventListener("pointerdown", down)
    hit.addEventListener("pointermove", move)
    hit.addEventListener("pointerup", up)
    hit.addEventListener("pointercancel", up)

    const onCall = () => {
      const s = sc()
      // vários bichinhos: cada um cai um pouco ao lado do outro
      const n = petList(P.current).length, i = I.current
      st.x = innerWidth / 2 + (i - (n - 1) / 2) * GW * s * 1.3; st.y = -GH * s - i * 30; st.vx = 0; st.vy = 0; st.plat = null; st.hold = 0
      setAct("air")
    }
    window.addEventListener("agenda:pet", onCall)

    /* ---------------- laço ---------------- */
    let last = performance.now()
    let lastKey = ""
    let lastHit = ""
    let scanAt = 0
    const stop = petLoop(() => {
      const now = performance.now()
      // Preserva a velocidade física mesmo em 12–15 FPS; limite evita saltos grandes.
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const s = sc()
      const g = 900 * s
      st.t += dt
      st.tailT += dt

      if (now > scanAt) { scan(); scanAt = now + (st.plat?.id.startsWith("w:") ? 200 : 700) }

      // segue a plataforma (widget arrastado) ou cai se ela sumiu
      if (st.plat && st.act !== "drag") {
        const lp = live(st.plat)
        if (!lp) { st.plat = null; st.vx = 0; st.vy = 0; setAct("air") }
        else {
          const dx = lp.x1 - st.plat.x1
          if (Math.abs(dx) < 400) st.x += dx
          st.y = lp.y
          st.plat = lp
          if (st.x < lp.x1 - 6 * s || st.x > lp.x2 + 6 * s) { st.plat = null; st.vy = 0; st.vx = st.dir * 40; setAct("air") }
        }
      }

      switch (st.act) {
        case "walk": {
          const sp = (st.run ? 2.6 : 1) * (26 + 12 * energy()) * (s / 3)
          const d = st.targetX - st.x
          st.dir = d >= 0 ? 1 : -1
          const stepX = Math.min(Math.abs(d), sp * dt)
          st.x += st.dir * stepX
          st.phase = (st.phase + stepX / ((st.run ? 17 : 11) * s)) % 1
          if (Math.abs(d) < 1) {
            if (st.then) {
              st.dir = st.then.x >= st.x ? 1 : -1
              setAct("crouch", 0.34)
              squash(0.86)
            } else next()
          }
          break
        }
        case "crouch":
          if (st.t >= st.dur && st.then) { const j = st.then; st.then = null; launch(j) }
          else if (st.t >= st.dur) next()
          break
        case "air": {
          const py = st.y
          st.vy += g * dt
          st.x += st.vx * dt
          st.y += st.vy * dt
          if (st.vx) st.dir = st.vx > 0 ? 1 : -1
          // bateu na beirada da tela: desliza
          if (st.x < 10 * s) { st.x = 10 * s; st.vx = Math.abs(st.vx) * 0.3 }
          if (st.x > innerWidth - 10 * s) { st.x = innerWidth - 10 * s; st.vx = -Math.abs(st.vx) * 0.3 }
          if (st.vy > 0) {
            // primeira plataforma que ele cruzou de cima para baixo
            let best: Plat | null = null
            for (const p of plats) {
              const lp = p.id === "floor" ? floor() : p
              if (py <= lp.y + 2 && st.y >= lp.y && st.x >= lp.x1 && st.x <= lp.x2 && (!best || lp.y < best.y)) best = lp
            }
            const fl = floor()
            if (!best && st.y >= fl.y) best = fl
            if (best) {
              st.y = best.y; st.plat = best; st.vx = 0
              squash(Math.max(0.72, 1 - st.vy / (g * 1.4)))
              st.vy = 0
              setAct("land", 0.22)
            }
          }
          break
        }
        case "land":
          if (st.t >= st.dur) {
            // acabou de subir num widget: costuma sentar para olhar a vista
            if (st.plat?.id.startsWith("w:") && Math.random() < 0.45) setAct("sit", rnd(5, 14))
            else next()
          }
          break
        case "drag":
          st.swing += ((press ? Math.max(-1, Math.min(1, -press.vx / 500)) : 0) - st.swing) * Math.min(1, dt * 10)
          break
        default:
          if (st.dur && st.t >= st.dur) {
            if (st.hold > now) st.t = 0
            else next()
          }
      }

      // mola do esmaga-estica
      st.sqv += (1 - st.sq) * 260 * dt
      st.sqv *= Math.exp(-14 * dt)
      st.sq += st.sqv * dt

      // piscar
      if (st.tailT > st.blinkAt) { st.blinkUntil = st.tailT + 0.13; st.blinkAt = st.tailT + rnd(2, 6) }
      const blink = st.tailT < st.blinkUntil
      const happy = now < st.happyUntil

      // ----- dragão: voa em vez de andar (e sobe um pouco para cuspir fogo) -----
      const firing = isDragon() && (st.act === "fire" || now < st.fireUntil) && st.act !== "drag" && st.act !== "air"
      const flying = isDragon() && (st.act === "walk" || firing)
      if (isDragon()) {
        // de vez em quando solta uma labaredinha no meio do voo
        if (st.act === "walk" && now > st.fireUntil && Math.random() < dt * 0.06) breathe(rnd(600, 1000))
        const want = st.act === "air" || st.act === "drag" ? st.hov : flying ? (7 + Math.sin(st.tailT * 3) * 1.5) * s : 0
        st.hov += (want - st.hov) * Math.min(1, dt * 5)
        if (st.hov < 0.3) st.hov = 0
        st.flapT += dt * (st.act === "walk" && st.run ? 13 : 9)
        if (firing && now > st.emberAt) { st.emberAt = now + 28; ember(); if (Math.random() < 0.5) ember() }
      } else st.hov = 0

      // ----- escolhe o quadro -----
      const tailWave = (sp: number) => q(Math.sin(st.tailT * sp), 4)
      let pose: Pose
      switch (st.act) {
        case "walk":
          pose = { k: "stand", phase: q(st.phase, 8) % 1, move: 1, tail: st.run ? q(Math.sin(st.tailT * 9) * 0.5, 4) : tailWave(4), eyes: happy ? "happy" : blink ? "blink" : "open", run: st.run }
          break
        case "crouch":
          pose = { k: "stand", phase: 0, move: 0, tail: tailWave(14), eyes: "open", crouch: 2 }
          break
        case "land":
          pose = { k: "stand", phase: 0, move: 0, tail: 0, eyes: "open", crouch: 1 }
          break
        case "air":
          pose = st.vy < -80 ? { k: "jump", tail: tailWave(6) } : { k: "fall", tail: tailWave(8) }
          break
        case "sit":
          pose = { k: "sit", tail: q(Math.sin(st.tailT * 1.7) * (Math.sin(st.tailT * 0.31) > 0 ? 1 : 0.35), 4), eyes: happy ? "happy" : blink ? "blink" : "open" }
          break
        case "groom": {
          const lick = Math.sin(st.t * 7)
          pose = { k: "sit", tail: tailWave(1.2), eyes: "closed", paw: lick > 0 ? 1 : 0.5 }
          break
        }
        case "sleep":
          pose = { k: "sleep", breath: q((Math.sin(st.tailT * 1.9) + 1) / 2, 3), tail: q(Math.sin(st.tailT * 0.4), 2) }
          if (st.tailT > st.zAt) { st.zAt = st.tailT + 1.6; puff(Math.random() < 0.5 ? "z" : "Z", "#e8e4ff", st.dir * (species() === "cat" ? 6 : 8), -10, 3.2, 46, 2200) }
          break
        case "stretch":
          pose = { k: "stretch", amt: q(Math.min(1, Math.sin((st.t / st.dur) * Math.PI) * 1.3), 2) * 2, tail: tailWave(2) }
          break
        case "drag":
          pose = { k: "drag", swing: q(st.swing, 2) }
          break
        default:
          pose = { k: "stand", phase: 0, move: 0, tail: tailWave(1.4), eyes: happy ? "happy" : blink ? "blink" : "open" }
      }

      if (isDragon() && st.act !== "air" && st.act !== "drag" && (flying || st.hov > s)) {
        pose = { k: "fly", flap: q((Math.sin(st.flapT) + 1) / 2, 4), tail: tailWave(5), fire: firing }
      }

      // ----- desenha (só quando o quadro muda); as escritas na tela ficam para depois de todos lerem -----
      return () => {
      const dpr = devicePixelRatio || 1
      const W = GW * s, H = GH * s
      const key = JSON.stringify(pose) + species() + coat() + s + dpr
      if (key !== lastKey) {
        lastKey = key
        const pw = Math.round(W * dpr), ph = Math.round(H * dpr)
        if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; cv.style.width = W + "px"; cv.style.height = H + "px" }
        ctx.imageSmoothingEnabled = false
        ctx.clearRect(0, 0, pw, ph)
        const img = frame(pose, coat(), species())
        // sombrinha de 1 px embaixo do contorno, desenhada aqui só quando a pose muda
        // (antes era um filtro CSS refeito em todo quadro, porque a imagem estica e encolhe)
        ctx.filter = "brightness(0)"
        ctx.globalAlpha = 0.18
        ctx.drawImage(img, 0, Math.max(1, Math.round(dpr)), pw, ph)
        ctx.filter = "none"
        ctx.globalAlpha = 1
        ctx.drawImage(img, 0, 0, pw, ph)
      }
      const sx = 1 / Math.sqrt(Math.max(0.5, st.sq))
      // pixel físico da tela (não o pixel inteiro): andar devagar não vira saltos de 0/1 pixel
      const px = (v: number) => Math.round(v * dpr) / dpr
      const x = px(st.x - W / 2), y = px(st.y - H - st.hov)
      wr.style.transform = `translate3d(${x}px,${y}px,0)`
      cv.style.transform = `scale(${st.dir * sx},${st.sq})`
      const grounded = !!st.plat && st.act !== "drag"
      sh.style.transform = `translate3d(${px(st.x - 9 * s)}px,${px(st.y - 1.5 * s)}px,0)`
      sh.style.width = 18 * s + "px"
      sh.style.height = 3 * s + "px"
      sh.style.opacity = grounded ? "1" : "0"
      // área de clique: só o corpo do bichinho (o retângulo do desenho atual)
      const bb = frameBox(pose, coat(), species())
      const hb = { l: bb.l, t: bb.t, w: bb.w, h: bb.h }
      const hl = st.dir > 0 ? hb.l : GW - hb.l - hb.w
      const css = `position:absolute;left:${hl * s}px;top:${hb.t * s}px;width:${hb.w * s}px;height:${hb.h * s}px;pointer-events:auto;cursor:${st.act === "drag" ? "grabbing" : "grab"}`
      // plaquinha com o nome logo acima da cabeça
      const nm = P.current.showNames !== false ? (O1.current.name?.trim() ?? "") : ""
      if (lb.textContent !== nm) lb.textContent = nm
      lb.style.display = nm ? "block" : "none"
      if (nm) {
        const cx = (st.dir > 0 ? hb.l + hb.w / 2 : GW - hb.l - hb.w / 2) * s
        lb.style.transform = `translate(${Math.round(cx)}px, ${Math.round(H - (H - hb.t * s) * st.sq)}px) translate(-50%, calc(-100% - 4px))`
      }
      if (css !== lastHit) { lastHit = css; hit.style.cssText = css }
      }
    }, () => P.current.background !== false)

    return () => {
      stop()
      hit.removeEventListener("pointerdown", down)
      hit.removeEventListener("pointermove", move)
      hit.removeEventListener("pointerup", up)
      hit.removeEventListener("pointercancel", up)
      window.removeEventListener("agenda:pet", onCall)
    }
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" data-pet>
      <div ref={shadow} className="absolute top-0 left-0 rounded-[50%]" style={{ background: "radial-gradient(closest-side, rgb(0 0 0 / .32), transparent)", transition: "opacity .2s" }} />
      <div ref={wrap} className="absolute top-0 left-0" style={{ willChange: "transform" }}>
        <canvas ref={canvas} style={{ imageRendering: "pixelated", transformOrigin: "50% 100%", display: "block", willChange: "transform" }} />
        <div ref={label} className="pointer-events-none absolute top-0 left-0 rounded-md px-1.5 py-0.5 whitespace-nowrap" style={{ display: "none", fontFamily: fontFamily("press"), fontSize: 8 + Math.max(0, (prefs.scale || 3) - 3) * 1.5, lineHeight: 1.25, color: "#fff", background: "rgb(15 12 22 / .62)", boxShadow: "0 1px 0 rgb(255 255 255 / .12) inset, 0 2px 6px rgb(0 0 0 / .3)", textShadow: "0 1px 0 rgb(0 0 0 / .5)" }} />
        <div data-pet-hit title={`${one.name?.trim() || SPECIES[isSpecies(one.species) ? one.species : "cat"].name} — clique para ele mudar (anda, senta, dorme) · segure para pegar no colo`} onContextMenu={(e) => e.stopPropagation()} />
      </div>
      <div ref={fx} className="absolute inset-0" />
    </div>
  )
}
