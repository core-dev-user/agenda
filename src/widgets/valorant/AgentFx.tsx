import { useEffect, useRef, type RefObject } from "react"
import { perfPaused, perfVisualFps } from "@/lib/perf"
import { useStore } from "@/lib/store"
import { createScene, type AgentInfo, type FxMode } from "./fx"

/**
 * Liga o motor de efeitos (fx.ts) a dois canvas do widget: um atrás do agente e outro na frente.
 * - Um único laço de requestAnimationFrame por widget, sem re-render do React a cada quadro.
 * - O tempo é medido em segundos (performance.now), então 60, 144 ou 180 Hz andam na mesma velocidade.
 * - No máximo 60 quadros por segundo (30 no modo economia, ou o limite de desempenho do Widgy, que cai com jogo
 *   aberto). Para quando o Widgy está oculto, pausado pelo modo jogo ou o widget está fora da tela.
 * - "Reduzir movimento" do sistema ou "Animações" desligado: desenha um quadro parado e não roda o laço.
 */

export interface FxParams {
  agent: AgentInfo
  mode: FxMode
  intensity: number
  speed: number
  particles: number
  eco: boolean
  parallax: boolean
  pauseHidden: boolean
  /** centro do agente, em fração do widget */
  ax: number
  ay: number
}

/** quantos laços estão vivos agora (os testes conferem que volta a zero ao tirar o widget) */
export const fxDebug = { loops: 0, scenes: 0, frames: 0 }
// só no modo de desenvolvimento: os testes leem daqui (o módulo pode ser recarregado e virar outra cópia)
if (import.meta.env?.DEV && typeof window !== "undefined") (window as unknown as { __valfx?: typeof fxDebug }).__valfx = fxDebug

/* ---------------- recursos compartilhados entre widgets ---------------- */
const sprites = new Map<string, HTMLCanvasElement>()
function sprite(color: string, soft = false): HTMLCanvasElement {
  const key = color + (soft ? "|s" : "")
  let c = sprites.get(key)
  if (c) return c
  c = document.createElement("canvas")
  c.width = c.height = 64
  const g = c.getContext("2d")!
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, color)
  if (soft) { grd.addColorStop(0.45, color + "88"); grd.addColorStop(1, color + "00") }
  else { grd.addColorStop(0.2, color + "cc"); grd.addColorStop(0.5, color + "33"); grd.addColorStop(1, color + "00") }
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  if (sprites.size > 80) sprites.delete(sprites.keys().next().value as string)
  sprites.set(key, c)
  return c
}
const images = new Map<string, HTMLImageElement>()
function image(url: string): HTMLImageElement | null {
  let img = images.get(url)
  if (!img) {
    img = new Image()
    img.decoding = "async"
    img.src = url
    if (images.size > 60) images.delete(images.keys().next().value as string)
    images.set(url, img)
  }
  return img.complete && img.naturalWidth > 0 ? img : null
}
const env = { sprite, image }

/** posição do mouse sobre o widget (-1 a 1), para o parallax; o laço de efeitos lê daqui */
export function useParallax(box: RefObject<HTMLElement | null>, enabled: boolean) {
  const pos = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const el = box.current
    if (!el) return
    if (!enabled) { pos.current = { x: 0, y: 0 }; el.style.removeProperty("--vpx"); el.style.removeProperty("--vpy"); return }
    let raf = 0
    let tx = 0, ty = 0
    const apply = () => { raf = 0; pos.current = { x: tx, y: ty }; el.style.setProperty("--vpx", tx.toFixed(3)); el.style.setProperty("--vpy", ty.toFixed(3)) }
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1))
      ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1))
      if (!raf) raf = requestAnimationFrame(apply)
    }
    const leave = () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(apply) }
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerleave", leave)
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); cancelAnimationFrame(raf) }
  }, [box, enabled])
  return pos
}

export function useAgentFx(back: RefObject<HTMLCanvasElement | null>, front: RefObject<HTMLCanvasElement | null>, box: RefObject<HTMLElement | null>, p: FxParams | null, parallax: RefObject<{ x: number; y: number }>) {
  const animations = useStore((s) => s.settings.animations)
  // valores que mudam sem precisar refazer a cena
  const live = useRef(p)
  live.current = p
  const key = p ? [p.agent.uuid, p.mode, p.intensity, p.particles, p.eco].join("|") : ""

  useEffect(() => {
    const B = back.current, F = front.current, host = box.current
    if (!B || !F || !host) return
    const ctxB = B.getContext("2d"), ctxF = F.getContext("2d")
    if (!ctxB || !ctxF) return
    const clear = () => { ctxB.setTransform(1, 0, 0, 1, 0, 0); ctxB.clearRect(0, 0, B.width, B.height); ctxF.setTransform(1, 0, 0, 1, 0, 0); ctxF.clearRect(0, 0, F.width, F.height) }
    const cur = live.current
    if (!cur) { clear(); return }

    const eco = cur.eco
    let w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight)
    const dpr = eco ? 1 : Math.min(1.5, window.devicePixelRatio || 1)
    const fit = () => { for (const c of [B, F]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr) } }
    fit()
    const scene = createScene(cur.agent, cur.mode, { w, h, cx: w * cur.ax, cy: h * cur.ay }, { intensity: cur.intensity, particles: cur.particles, eco }, env)
    fxDebug.scenes++
    // entra suave
    for (const c of [B, F]) { c.style.transition = "none"; c.style.opacity = "0" }
    const fadeIn = requestAnimationFrame(() => { for (const c of [B, F]) { c.style.transition = "opacity .6s ease"; c.style.opacity = "1" } })

    let px = 0, py = 0
    const draw = () => {
      clear()
      const l = live.current
      const ox = l?.parallax ? px : 0, oy = l?.parallax ? py : 0
      ctxB.setTransform(dpr, 0, 0, dpr, -ox * 7 * dpr, -oy * 5 * dpr)
      scene.draw(ctxB, "back")
      ctxF.setTransform(dpr, 0, 0, dpr, ox * 11 * dpr, oy * 7 * dpr)
      scene.draw(ctxF, "front")
    }

    const reduced = !animations || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (reduced) {
      // um quadro parado, já com as partículas espalhadas
      for (let i = 0; i < 30; i++) scene.step(0.05)
      draw()
      return () => { cancelAnimationFrame(fadeIn); fxDebug.scenes-- }
    }

    let visible = true
    const io = typeof IntersectionObserver === "function" ? new IntersectionObserver((e) => { visible = e.some((x) => x.isIntersecting) }) : null
    io?.observe(host)
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
      const nw = Math.max(1, host.clientWidth), nh = Math.max(1, host.clientHeight)
      if (Math.abs(nw - w) < 1 && Math.abs(nh - h) < 1) return
      w = nw; h = nh; fit()
      const l = live.current
      scene.resize(w, h, w * (l?.ax ?? 0.5), h * (l?.ay ?? 0.46))
    }) : null
    ro?.observe(host)

    let raf = 0, timer: ReturnType<typeof setTimeout> | undefined, dead = false
    let last = performance.now(), lastAnchor = ""
    fxDebug.loops++
    const schedule = (fps: number) => {
      if (dead) return
      if (fps >= 55) raf = requestAnimationFrame(tick)
      else timer = setTimeout(() => { if (!dead) raf = requestAnimationFrame(tick) }, Math.max(8, 1000 / fps - 3))
    }
    const tick = (now: number) => {
      raf = 0
      if (dead) return
      const l = live.current
      if (!l) return
      const asleep = document.hidden || perfPaused() || (l.pauseHidden && !visible)
      if (asleep) { last = now; timer = setTimeout(() => { if (!dead) raf = requestAnimationFrame(tick) }, 450); return }
      // 60 quadros bastam (144/180 Hz não mudam a velocidade, só gastariam mais); economia: 30
      const cap = Math.min(l.eco ? 30 : 60, perfVisualFps())
      if (cap >= 55 && now - last < 1000 / 60 - 2) { raf = requestAnimationFrame(tick); return }
      const dt = (now - last) / 1000
      last = now
      const anchor = l.ax.toFixed(3) + l.ay.toFixed(3)
      if (anchor !== lastAnchor) { lastAnchor = anchor; scene.resize(w, h, w * l.ax, h * l.ay) }
      const k = Math.min(1, dt * 6)
      px += ((parallax.current?.x ?? 0) - px) * k
      py += ((parallax.current?.y ?? 0) - py) * k
      scene.step(dt * l.speed)
      draw()
      fxDebug.frames++
      schedule(cap)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      dead = true
      cancelAnimationFrame(raf); cancelAnimationFrame(fadeIn); clearTimeout(timer)
      io?.disconnect(); ro?.disconnect()
      fxDebug.loops--; fxDebug.scenes--
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, animations])
}
