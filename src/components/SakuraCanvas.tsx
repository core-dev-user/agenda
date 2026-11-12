import { perfPaused, perfVisualFps } from "@/lib/perf"
import { useEffect, useRef } from "react"

interface Petal {
  x: number; y: number; z: number
  vx: number; vy: number
  rx: number; ry: number; rz: number
  srx: number; sry: number; srz: number
  size: number; hue: number; sway: number; phase: number
}

const PINK = [
  [255, 183, 207],
  [255, 205, 222],
  [255, 160, 195],
  [255, 228, 236],
  [247, 170, 205],
]
const BLUE = [
  [195, 229, 255],
  [165, 216, 255],
  [129, 193, 255],
  [220, 240, 255],
  [110, 182, 246],
]

function makePetalPath() {
  // pétala de cerejeira com o entalhe característico na ponta
  const p = new Path2D()
  p.moveTo(0, 10)
  p.bezierCurveTo(-8, 6, -9, -4, -4, -10)
  p.lineTo(0, -7)
  p.lineTo(4, -10)
  p.bezierCurveTo(9, -4, 8, 6, 0, 10)
  p.closePath()
  return p
}

/**
 * Pétalas de sakura em pseudo-3D: cada pétala gira em 3 eixos,
 * tem profundidade (tamanho/velocidade/opacidade) e reage ao mouse.
 */
export function SakuraCanvas({
  density = 0.5,
  interactive = true,
  className = "",
  burst = false,
  opacity = 1,
  palette = "blue",
}: {
  density?: number
  interactive?: boolean
  className?: string
  burst?: boolean
  opacity?: number
  palette?: "blue" | "pink"
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext("2d")!
    const path = makePetalPath()
    const PALETTE = palette === "pink" ? PINK : BLUE
    let W = 0, H = 0, dpr = 1
    const mouse = { x: -9999, y: -9999, vx: 0, vy: 0 }
    let raf = 0
    let sleepTimer: ReturnType<typeof setTimeout> | undefined
    let last = performance.now()
    let t = 0

    const resize = () => {
      const fps = perfVisualFps()
      // pétalas são formas suaves: resolução 1x basta fora do modo qualidade (até 2,25x menos pixels por quadro)
      dpr = Math.min(window.devicePixelRatio || 1, fps >= 55 ? 1.5 : 1)
      W = canvas.clientWidth
      H = canvas.clientHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    resize()

    const count = () => Math.round(20 + density * 160 * Math.min(1.6, (W * H) / (1600 * 900)))
    const spawn = (initial: boolean): Petal => {
      const z = 0.35 + Math.random() * 1.05
      return {
        x: initial ? Math.random() * W : -40 - Math.random() * W * 0.3,
        y: initial ? Math.random() * H : Math.random() * H * 0.9 - H * 0.2,
        z,
        vx: (0.5 + Math.random() * 0.9) * z,
        vy: (0.35 + Math.random() * 0.6) * z,
        rx: Math.random() * Math.PI * 2,
        ry: Math.random() * Math.PI * 2,
        rz: Math.random() * Math.PI * 2,
        srx: (Math.random() - 0.5) * 0.06,
        sry: (Math.random() - 0.5) * 0.05,
        srz: (Math.random() - 0.5) * 0.03,
        size: (0.7 + Math.random() * 0.7) * z,
        hue: Math.floor(Math.random() * PALETTE.length),
        sway: 0.4 + Math.random() * 1.2,
        phase: Math.random() * Math.PI * 2,
      }
    }

    // cores prontas (8 tons de luz por cor): não monta uma string nova para cada pétala em cada quadro
    const SHADES = PALETTE.map(([r, g, b]) => Array.from({ length: 8 }, (_, i) => {
      const light = 0.63 + (i / 7) * 0.42
      return `rgb(${Math.min(255, Math.round(r * light))},${Math.min(255, Math.round(g * light))},${Math.min(255, Math.round(b * light))})`
    }))
    let needSort = true
    let petals: Petal[] = []
    if (burst) {
      // explosão inicial saindo do centro (abertura)
      for (let i = 0; i < count(); i++) {
        const p = spawn(true)
        const a = Math.random() * Math.PI * 2
        const sp = 3 + Math.random() * 8
        const r0 = 60 + Math.random() * 140
        p.x = W / 2 + Math.cos(a) * r0
        p.y = H / 2 + Math.sin(a) * r0 * 0.7
        p.vx = Math.cos(a) * sp
        p.vy = Math.sin(a) * sp - 1
        petals.push(p)
      }
    } else {
      petals = Array.from({ length: count() }, () => spawn(true))
    }

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      const nx = e.clientX - r.left
      const ny = e.clientY - r.top
      mouse.vx = nx - mouse.x
      mouse.vy = ny - mouse.y
      mouse.x = nx
      mouse.y = ny
    }
    if (interactive) window.addEventListener("pointermove", onMove)
    window.addEventListener("resize", resize)
    window.addEventListener("widgy:perf-settings", resize)

    const frame = (now: number) => {
      const delay = 1000 / Math.min(30, perfVisualFps())
      if (perfPaused() || document.hidden) {
        sleepTimer = setTimeout(() => { raf = requestAnimationFrame(frame) }, 450)
        return
      }
      // Agenda economia: não agendar 60 callbacks RAF para desenhar apenas 15 pétalas/s.
      if (now - last < delay - 2) {
        sleepTimer = setTimeout(() => { raf = requestAnimationFrame(frame) }, Math.max(5, delay - (now - last) - 3))
        return
      }
      const dt = Math.min(6, (now - last) / 16.67)
      last = now
      t += dt * 0.016
      const gust = Math.sin(t * 0.35) * 0.5 + Math.sin(t * 0.13 + 1) * 0.6
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)

      const target = count()
      while (petals.length < target) { petals.push(spawn(false)); needSort = true }
      if (petals.length > target + 20) petals.length = target

      // ordena por profundidade (as mais distantes primeiro) só quando alguma pétala renasceu
      if (needSort) { petals.sort((a, b) => a.z - b.z); needSort = false }

      for (const p of petals) {
        // física: vento + balanço + arrasto
        const windX = (0.9 + gust) * p.z
        p.vx += (windX - p.vx) * 0.012 * dt
        p.vy += ((0.55 + Math.sin(t * p.sway + p.phase) * 0.35) * p.z - p.vy) * 0.02 * dt
        if (interactive) {
          const dx = p.x - mouse.x
          const dy = p.y - mouse.y
          const d2 = dx * dx + dy * dy
          const R = 130 * p.z
          if (d2 < R * R) {
            const d = Math.sqrt(d2) || 1
            const f = (1 - d / R) * 0.9
            p.vx += (dx / d) * f + mouse.vx * 0.02
            p.vy += (dy / d) * f + mouse.vy * 0.02
            p.srx += 0.004
          }
        }
        p.x += (p.vx + Math.sin(t * p.sway * 2 + p.phase) * 0.35 * p.z) * dt
        p.y += p.vy * dt
        p.rx += p.srx * dt
        p.ry += p.sry * dt
        p.rz += p.srz * dt
        p.srx *= 0.999

        if (p.x > W + 50 || p.y > H + 50 || p.x < -W * 0.5 || p.y < -H) {
          Object.assign(p, spawn(false))
          needSort = true
          if (Math.random() < 0.5) {
            p.x = Math.random() * W
            p.y = -30
          }
        }

        // projeção 3D simples: escala no eixo X/Y pela rotação -> efeito de virar
        if (p.x < -30 || p.y < -30 || p.x > W + 30 || p.y > H + 30) continue
        const sx = Math.cos(p.ry)
        const sy = Math.cos(p.rx)
        const flip = sx * sy
        const light = 0.75 + 0.25 * Math.abs(flip) + (flip < 0 ? -0.12 : 0.05)
        const alpha = Math.min(1, 0.35 + p.z * 0.55) * opacity

        // uma matriz só (antes: setTransform + translate + rotate + scale para cada pétala)
        const cs = Math.cos(p.rz), sn = Math.sin(p.rz)
        const kx = p.size * (0.15 + 0.85 * Math.abs(sx)) * dpr, ky = p.size * (0.2 + 0.8 * Math.abs(sy)) * dpr
        ctx.setTransform(cs * kx, sn * kx, -sn * ky, cs * ky, p.x * dpr, p.y * dpr)
        ctx.globalAlpha = alpha
        ctx.fillStyle = SHADES[p.hue][Math.max(0, Math.min(7, Math.round(((light - 0.63) / 0.42) * 7)))]
        ctx.fill(path)
        // nervura central / brilho: só nas pétalas grandes (nas pequenas nem aparece)
        if (p.size > 0.75) {
          ctx.globalAlpha = alpha * 0.35
          ctx.strokeStyle = flip > 0 ? "rgba(255,255,255,0.9)" : palette === "pink" ? "rgba(200,80,130,0.6)" : "rgba(63,145,238,0.55)"
          ctx.lineWidth = 0.6
          ctx.beginPath()
          ctx.moveTo(0, 9)
          ctx.lineTo(0, -5)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
      mouse.vx *= 0.85
      mouse.vy *= 0.85
      sleepTimer = setTimeout(() => { raf = requestAnimationFrame(frame) }, Math.max(6, 1000 / Math.min(30, perfVisualFps()) - 4))
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(sleepTimer)
      window.removeEventListener("widgy:perf-settings", resize)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("resize", resize)
    }
  }, [density, interactive, burst, opacity, palette])

  return <canvas ref={ref} className={"pointer-events-none absolute inset-0 h-full w-full " + className} />
}
