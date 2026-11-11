import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { useSettings } from "@/lib/store"
import { perfPaused, perfVisualFps } from "@/lib/perf"

const CLICKABLE = "button,a,[role=button],select,label,.clickable,[data-clickable]"
const TEXT = "input:not([type=range]):not([type=checkbox]):not([type=color]),textarea,[contenteditable=true]"

interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; rot: number; vr: number; kind: number; color: string }

function hexToRgb(h: string) {
  const n = parseInt(h.replace("#", "").padEnd(6, "0").slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function CursorLayer() {
  const s = useSettings()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const cfg = useRef(s)
  cfg.current = s

  useEffect(() => {
    const custom = s.cursorStyle !== "system"
    document.documentElement.classList.toggle("hide-cursor", custom)
    return () => document.documentElement.classList.remove("hide-cursor")
  }, [s.cursorStyle])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!
    let dpr = 1
    const resize = () => {
      const fps = perfVisualFps()
      dpr = Math.min(fps >= 55 ? 2 : fps >= 24 ? 1.5 : 1, window.devicePixelRatio || 1)
      canvas.width = innerWidth * dpr
      canvas.height = innerHeight * dpr
    }
    resize()
    window.addEventListener("resize", resize)
    window.addEventListener("widgy:perf-settings", resize)

    const m = { x: innerWidth / 2, y: innerHeight / 2, px: 0, py: 0, rx: innerWidth / 2, ry: innerHeight / 2, hover: false, text: false, down: false, visible: false }
    const trail: { x: number; y: number; t: number }[] = []
    const parts: P[] = []
    const ripples: { x: number; y: number; t: number }[] = []
    const petal = new Path2D("M0,5 C-4,3 -4.5,-2 -2,-5 L0,-3.5 L2,-5 C4.5,-2 4,3 0,5Z")
    const heart = new Path2D("M0,4 C-6,-1 -5,-6 -2.5,-6 C-1.2,-6 -0.3,-5 0,-4 C0.3,-5 1.2,-6 2.5,-6 C5,-6 6,-1 0,4Z")
    const leaf = new Path2D("M0,-6 C4,-3 4,3 0,6 C-4,3 -4,-3 0,-6Z")
    const star = new Path2D(Array.from({ length: 10 }, (_, j) => { const a = (j / 10) * Math.PI * 2 - Math.PI / 2; const rr = j % 2 ? 2.2 : 5.5; return `${j ? "L" : "M"}${(Math.cos(a) * rr).toFixed(2)},${(Math.sin(a) * rr).toFixed(2)}` }).join(" ") + "Z")
    const CONF = ["#ff5f9e", "#ffd36e", "#5fd3ff", "#7dff8a", "#c49bff", "#ff8a5f"]
    const LEAVES = ["#e0742a", "#e3b13a", "#b8322a", "#c9571f", "#9b6b3d"]
    const rnd = (a: number, b: number) => a + Math.random() * (b - a)
    // novos tipos de partícula: 3 coração · 4 estrela · 5 bolha · 6 confete · 7 fogo · 8 neve · 9 folha · 10 pó mágico
    const spawn = (kind: number, x: number, y: number, color: string, burst = false) => {
      const sp = burst ? 3 : 1
      const a = Math.random() * Math.PI * 2
      const base = { x, y, life: 0, rot: rnd(0, 6), vr: rnd(-0.15, 0.15), kind, color }
      if (kind === 3) parts.push({ ...base, vx: burst ? Math.cos(a) * sp : rnd(-0.6, 0.6), vy: burst ? Math.sin(a) * sp : rnd(-1.4, -0.4), max: rnd(50, 80), size: rnd(1, 1.8), vr: 0 })
      else if (kind === 4) parts.push({ ...base, vx: burst ? Math.cos(a) * sp : rnd(-0.8, 0.8), vy: burst ? Math.sin(a) * sp : rnd(-0.8, 0.8), max: rnd(40, 70), size: rnd(0.8, 1.6) })
      else if (kind === 5) parts.push({ ...base, vx: rnd(-0.4, 0.4), vy: rnd(-1.2, -0.4), max: rnd(60, 110), size: rnd(3, 9) })
      else if (kind === 6) parts.push({ ...base, vx: burst ? Math.cos(a) * sp * 1.4 : rnd(-1.5, 1.5), vy: burst ? Math.sin(a) * sp * 1.4 - 1 : rnd(-2.5, -0.5), max: rnd(60, 100), size: rnd(3, 6), vr: rnd(-0.3, 0.3), color: CONF[Math.floor(Math.random() * CONF.length)] })
      else if (kind === 7) parts.push({ ...base, x: x + rnd(-5, 5), vx: rnd(-0.4, 0.4), vy: rnd(-2, -0.8), max: rnd(25, 45), size: rnd(6, 13) })
      else if (kind === 8) parts.push({ ...base, x: x + rnd(-10, 10), vx: rnd(-0.4, 0.4), vy: rnd(0.3, 1), max: rnd(80, 140), size: rnd(1.2, 3) })
      else if (kind === 9) parts.push({ ...base, vx: rnd(-1, 1), vy: rnd(0.2, 1), max: rnd(90, 140), size: rnd(1, 1.6), vr: rnd(-0.12, 0.12), color: LEAVES[Math.floor(Math.random() * LEAVES.length)] })
      else if (kind === 10) parts.push({ ...base, x: x + rnd(-8, 8), y: y + rnd(-8, 8), vx: rnd(-0.5, 0.5), vy: rnd(-0.5, 0.5), max: rnd(40, 80), size: rnd(1.5, 3.5), color: `hsl(${Math.floor(rnd(0, 360))} 100% 70%)` })
    }
    const EFFECT_KIND: Record<string, number> = { hearts: 3, stars: 4, bubbles: 5, confetti: 6, fire: 7, snow: 8, leaves: 9, magic: 10 }

    let raf = 0
    let frameTimer: ReturnType<typeof setTimeout> | undefined
    const wake = () => { if (!raf && !frameTimer) raf = requestAnimationFrame(loop) }
    const onMove = (e: PointerEvent) => {
      wake()
      m.x = e.clientX
      m.y = e.clientY
      m.visible = true
      const el = e.target as Element | null
      m.hover = !!el?.closest?.(CLICKABLE)
      m.text = !!el?.closest?.(TEXT)
      const c = cfg.current
      const speed = Math.hypot(m.x - m.px, m.y - m.py)
      const color = c.cursorColor
      // modo leve: sem partículas
      const lite = document.documentElement.classList.contains("lite")
      if (lite) { /* nada */ }
      else if (c.cursorEffect === "sakura" && Math.random() < Math.min(0.9, speed / 18)) {
        parts.push({ x: m.x, y: m.y, vx: (Math.random() - 0.5) * 1.5, vy: Math.random() * 0.8, life: 0, max: 90 + Math.random() * 60, size: 1.2 + Math.random() * 1.4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.15, kind: 0, color })
      } else if (c.cursorEffect === "sparkle" && Math.random() < Math.min(1, speed / 10)) {
        parts.push({ x: m.x + (Math.random() - 0.5) * 14, y: m.y + (Math.random() - 0.5) * 14, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6 + 0.2, life: 0, max: 40 + Math.random() * 30, size: 2 + Math.random() * 4, rot: 0, vr: 0, kind: 1, color })
      } else if (EFFECT_KIND[c.cursorEffect]) {
        const dens = c.cursorDensity ?? 1
        const n = Math.min(4, (speed / 12) * dens)
        for (let k = 0; k < Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); k++) spawn(EFFECT_KIND[c.cursorEffect], m.x, m.y, color)
      } else if (c.cursorEffect === "pixels" && Math.random() < Math.min(1, speed / 8)) {
        const cols = ["#ff5f9e", "#5fd3ff", "#ffe066", "#7dff8a", color]
        parts.push({ x: Math.round(m.x / 4) * 4, y: Math.round(m.y / 4) * 4, vx: (Math.random() - 0.5) * 1.2, vy: -Math.random() * 1.5, life: 0, max: 40, size: 4 + Math.floor(Math.random() * 2) * 2, rot: 0, vr: 0, kind: 2, color: cols[Math.floor(Math.random() * cols.length)] })
      }
      m.px = m.x
      m.py = m.y
    }
    const onDown = () => {
      wake()
      m.down = true
      const c = cfg.current
      const ce = c.clickEffect ?? "auto"
      if (ce === "none") return
      if (ce === "burst") { for (let i = 0; i < 14; i++) spawn(4, m.x, m.y, c.cursorColor, true); return }
      if (ce === "hearts") { for (let i = 0; i < 10; i++) spawn(3, m.x, m.y, c.cursorColor, true); return }
      if (ce === "confetti") { for (let i = 0; i < 22; i++) spawn(6, m.x, m.y, c.cursorColor, true); return }
      if (ce === "shock") { ripples.push({ x: m.x, y: m.y, t: 0, shock: true } as any); return }
      ripples.push({ x: m.x, y: m.y, t: 0 })
      if (ce === "auto" && EFFECT_KIND[c.cursorEffect]) for (let i = 0; i < 10; i++) spawn(EFFECT_KIND[c.cursorEffect], m.x, m.y, c.cursorColor, true)
      if (cfg.current.cursorEffect === "sakura")
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2
          parts.push({ x: m.x, y: m.y, vx: Math.cos(a) * 2.5, vy: Math.sin(a) * 2.5, life: 0, max: 60, size: 1.4, rot: a, vr: 0.1, kind: 0, color: cfg.current.cursorColor })
        }
    }
    const onUp = () => { m.down = false; wake() }
    const onLeave = () => { m.visible = false; wake() }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerdown", onDown)
    window.addEventListener("pointerup", onUp)
    document.addEventListener("pointerleave", onLeave)

    let lastX = -1, lastY = -1
    const loop = () => {
      raf = 0
      // Oculto ou em jogo: o loop dorme até um evento de visibilidade.
      if (perfPaused() || document.hidden) return
      // Sem mudanças: ficar realmente ocioso, não gastar 60 callbacks por segundo.
      if (!parts.length && !ripples.length && trail.length < 2 && Math.abs(m.x - m.rx) < 0.2 && Math.abs(m.y - m.ry) < 0.2 && m.x === lastX && m.y === lastY) return
      lastX = m.x; lastY = m.y
      const c = cfg.current
      const [r, g, b] = hexToRgb(c.cursorColor)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, innerWidth, innerHeight)

      // anel atrasado (lerp)
      m.rx += (m.x - m.rx) * 0.18
      m.ry += (m.y - m.ry) * 0.18

      if (c.cursorEffect === "glow") {
        const grd = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 180)
        grd.addColorStop(0, `rgba(${r},${g},${b},0.22)`)
        grd.addColorStop(1, `rgba(${r},${g},${b},0)`)
        ctx.fillStyle = grd
        ctx.fillRect(m.x - 180, m.y - 180, 360, 360)
      }

      if (c.cursorEffect === "rainbow" || c.cursorEffect === "comet") {
        const now = performance.now()
        trail.push({ x: m.x, y: m.y, t: now })
        const keep = c.cursorEffect === "comet" ? 520 : 650
        while (trail.length && now - trail[0].t > keep) trail.shift()
        ctx.lineCap = "round"
        for (let i = 1; i < trail.length; i++) {
          const k = i / trail.length
          ctx.strokeStyle = c.cursorEffect === "rainbow" ? `hsla(${(now / 6 + i * 9) % 360} 100% 65% / ${k})` : `rgba(${r},${g},${b},${k * k})`
          ctx.lineWidth = (c.cursorEffect === "comet" ? k * 14 : 6) * c.cursorSize
          ctx.shadowColor = c.cursorEffect === "rainbow" ? `hsl(${(now / 6 + i * 9) % 360} 100% 60%)` : `rgb(${r},${g},${b})`
          ctx.shadowBlur = c.cursorEffect === "comet" ? 18 : 10
          ctx.beginPath()
          ctx.moveTo(trail[i - 1].x, trail[i - 1].y)
          ctx.lineTo(trail[i].x, trail[i].y)
          ctx.stroke()
        }
        if (c.cursorEffect === "comet" && trail.length) {
          const grd = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 16 * c.cursorSize)
          grd.addColorStop(0, "rgba(255,255,255,0.95)")
          grd.addColorStop(1, `rgba(${r},${g},${b},0)`)
          ctx.fillStyle = grd
          ctx.beginPath(); ctx.arc(m.x, m.y, 16 * c.cursorSize, 0, Math.PI * 2); ctx.fill()
        }
        ctx.shadowBlur = 0
      }

      if (c.cursorEffect === "trail") {
        const now = performance.now()
        trail.push({ x: m.x, y: m.y, t: now })
        while (trail.length && now - trail[0].t > 380) trail.shift()
        ctx.lineCap = "round"
        ctx.lineJoin = "round"
        for (let i = 1; i < trail.length; i++) {
          const k = i / trail.length
          ctx.strokeStyle = `rgba(${r},${g},${b},${k * 0.8})`
          ctx.lineWidth = k * 7 * c.cursorSize
          ctx.shadowColor = `rgb(${r},${g},${b})`
          ctx.shadowBlur = 12
          ctx.beginPath()
          ctx.moveTo(trail[i - 1].x, trail[i - 1].y)
          ctx.lineTo(trail[i].x, trail[i].y)
          ctx.stroke()
        }
        ctx.shadowBlur = 0
      }

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]
        p.life++
        if (p.life > p.max) { parts.splice(i, 1); continue }
        const k = 1 - p.life / p.max
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        if (p.kind === 0) { p.vy += 0.03; p.vx *= 0.98; p.vx += Math.sin(p.life * 0.08) * 0.03 }
        if (p.kind === 2) p.vy += 0.08
        if (p.kind === 6) { p.vy += 0.06; p.vx *= 0.99 }
        if (p.kind === 9) { p.vx += Math.sin(p.life * 0.06) * 0.04; p.vy = Math.min(p.vy + 0.01, 1.2) }
        if (p.kind === 8) p.vx += Math.sin(p.life * 0.05 + p.rot) * 0.02
        if (p.kind === 3) p.vy -= 0.01
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.globalAlpha = k
        if (p.kind === 0) {
          ctx.rotate(p.rot)
          ctx.scale(p.size * Math.abs(Math.cos(p.life * 0.07 + p.rot)) + 0.3, p.size)
          ctx.fillStyle = `rgb(${Math.min(255, r + 10)},${g},${b})`
          ctx.fill(petal)
        } else if (p.kind === 1) {
          const sz = p.size * (0.5 + Math.sin(k * Math.PI) * 0.8)
          ctx.fillStyle = "#fff"
          ctx.shadowColor = p.color
          ctx.shadowBlur = 10
          ctx.beginPath()
          for (let j = 0; j < 8; j++) {
            const a = (j / 8) * Math.PI * 2
            const rr = j % 2 === 0 ? sz : sz * 0.25
            ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
          }
          ctx.closePath()
          ctx.fill()
        } else if (p.kind === 3) {
          ctx.scale(p.size, p.size)
          ctx.fillStyle = p.color
          ctx.shadowColor = p.color
          ctx.shadowBlur = 8
          ctx.fill(heart)
        } else if (p.kind === 4) {
          ctx.rotate(p.rot)
          ctx.scale(p.size, p.size)
          ctx.fillStyle = "#fff"
          ctx.shadowColor = p.color
          ctx.shadowBlur = 12
          ctx.fill(star)
        } else if (p.kind === 5) {
          ctx.strokeStyle = `rgba(${r},${g},${b},0.8)`
          ctx.lineWidth = 1.2
          ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.stroke()
          ctx.fillStyle = "rgba(255,255,255,0.5)"
          ctx.beginPath(); ctx.arc(-p.size * 0.35, -p.size * 0.35, p.size * 0.25, 0, Math.PI * 2); ctx.fill()
        } else if (p.kind === 6) {
          ctx.rotate(p.rot)
          ctx.scale(1, Math.abs(Math.cos(p.life * 0.15 + p.rot)) + 0.2)
          ctx.fillStyle = p.color
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        } else if (p.kind === 7) {
          const sz = p.size * (0.4 + k * 0.6)
          const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, sz)
          grd.addColorStop(0, `rgba(255,${Math.floor(200 + 55 * k)},${Math.floor(120 * k)},0.95)`)
          grd.addColorStop(0.5, `rgba(255,${Math.floor(90 + 80 * k)},0,0.6)`)
          grd.addColorStop(1, "rgba(255,40,0,0)")
          ctx.globalCompositeOperation = "lighter"
          ctx.fillStyle = grd
          ctx.beginPath(); ctx.arc(0, 0, sz, 0, Math.PI * 2); ctx.fill()
          ctx.globalCompositeOperation = "source-over"
        } else if (p.kind === 8) {
          ctx.fillStyle = "rgba(255,255,255,0.95)"
          ctx.shadowColor = "#fff"
          ctx.shadowBlur = 6
          ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill()
        } else if (p.kind === 9) {
          ctx.rotate(p.rot)
          ctx.scale(p.size * (Math.abs(Math.cos(p.life * 0.08)) * 0.7 + 0.3), p.size)
          ctx.fillStyle = p.color
          ctx.fill(leaf)
          ctx.strokeStyle = "rgba(0,0,0,0.25)"
          ctx.lineWidth = 0.4
          ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke()
        } else if (p.kind === 10) {
          const sz = p.size * (0.4 + Math.sin(k * Math.PI))
          ctx.fillStyle = p.color
          ctx.shadowColor = p.color
          ctx.shadowBlur = 10
          ctx.beginPath(); ctx.arc(0, 0, sz, 0, Math.PI * 2); ctx.fill()
        } else {
          ctx.fillStyle = p.color
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
        }
        ctx.restore()
      }

      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i]
        rp.t += 0.04
        if (rp.t > 1) { ripples.splice(i, 1); continue }
        if ((rp as any).shock) {
          ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - rp.t) * 0.9})`
          ctx.lineWidth = 4 * (1 - rp.t) + 1
          ctx.shadowColor = `rgb(${r},${g},${b})`
          ctx.shadowBlur = 16
          for (const k2 of [1, 0.6]) { ctx.beginPath(); ctx.arc(rp.x, rp.y, 8 + rp.t * 90 * k2, 0, Math.PI * 2); ctx.stroke() }
          ctx.shadowBlur = 0
          continue
        }
        ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - rp.t) * 0.7})`
        ctx.lineWidth = 2
        ctx.beginPath()
        if (c.cursorEffect === "pixels") {
          const sz = rp.t * 60
          ctx.strokeRect(rp.x - sz / 2, rp.y - sz / 2, sz, sz)
        } else ctx.arc(rp.x, rp.y, 6 + rp.t * (c.cursorEffect === "ripple" ? 70 : 34), 0, Math.PI * 2)
        ctx.stroke()
      }

      // posiciona cursor DOM
      const cur = cursorRef.current
      const ring = ringRef.current
      if (cur) {
        cur.style.transform = `translate3d(${m.x}px, ${m.y}px, 0) scale(${m.down ? 0.8 : 1})`
        cur.style.opacity = m.visible ? "1" : "0"
        cur.dataset.hover = String(m.hover)
        cur.dataset.text = String(m.text)
      }
      if (ring) {
        const sc = (m.hover ? 1.7 : 1) * (m.down ? 0.8 : 1)
        ring.style.transform = `translate3d(${m.rx}px, ${m.ry}px, 0) scale(${sc})`
        ring.style.opacity = m.visible && !m.text ? "1" : "0"
      }
      const fps = perfVisualFps()
      if (fps >= 55) raf = requestAnimationFrame(loop)
      else frameTimer = setTimeout(() => { frameTimer = undefined; wake() }, Math.max(5, 1000 / fps - 3))
    }
    wake()
    window.addEventListener("widgy:perf-state", wake)
    document.addEventListener("visibilitychange", wake)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(frameTimer)
      window.removeEventListener("resize", resize)
      window.removeEventListener("widgy:perf-settings", resize)
      window.removeEventListener("widgy:perf-state", wake)
      document.removeEventListener("visibilitychange", wake)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerdown", onDown)
      window.removeEventListener("pointerup", onUp)
      document.removeEventListener("pointerleave", onLeave)
    }
  }, [])

  const size = s.cursorSize
  const col = s.cursorColor
  // portal no <body> com z-index máximo: fica acima de modais, visualizador e qualquer camada
  return createPortal(
    <div className="pointer-events-none fixed inset-0" style={{ zIndex: 2147483647 }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {s.cursorStyle !== "system" && (
        <>
          {s.cursorStyle === "ring" && (
            <div
              ref={ringRef}
              className="absolute top-0 left-0 transition-[scale] duration-200"
              style={{ width: 0, height: 0 }}
            >
              <div
                className="absolute rounded-full"
                style={{
                  width: 34 * size, height: 34 * size, left: -17 * size, top: -17 * size,
                  border: `1.5px solid ${col}`,
                  boxShadow: `0 0 12px ${col}88, inset 0 0 8px ${col}55`,
                  backdropFilter: "invert(0.06)",
                }}
              />
            </div>
          )}
          <div ref={cursorRef} className="group absolute top-0 left-0" style={{ width: 0, height: 0, transition: "scale .15s" }}>
            <CursorShape style={s.cursorStyle} color={col} size={size} />
          </div>
        </>
      )}
    </div>,
    document.body
  )
}

function CursorShape({ style, color, size }: { style: string; color: string; size: number }) {
  const textBar = (
    <div className="absolute hidden group-data-[text=true]:block" style={{ width: 2, height: 22 * size, left: -1, top: -11 * size, background: color, boxShadow: `0 0 8px ${color}` }} />
  )
  const hideOnText = "group-data-[text=true]:hidden"
  switch (style) {
    case "dot":
      return (
        <>
          {textBar}
          <div className={"absolute rounded-full transition-all duration-200 group-data-[hover=true]:scale-[2.6] group-data-[hover=true]:opacity-60 " + hideOnText}
            style={{ width: 10 * size, height: 10 * size, left: -5 * size, top: -5 * size, background: color, boxShadow: `0 0 14px ${color}`, mixBlendMode: "difference" }} />
        </>
      )
    case "ring":
      return (
        <>
          {textBar}
          <div className={"absolute rounded-full " + hideOnText} style={{ width: 6 * size, height: 6 * size, left: -3 * size, top: -3 * size, background: color, boxShadow: `0 0 10px ${color}` }} />
        </>
      )
    case "sakura":
      return (
        <>
          {textBar}
          <svg className={"absolute animate-[spin_6s_linear_infinite] transition-transform group-data-[hover=true]:scale-125 " + hideOnText}
            width={28 * size} height={28 * size} viewBox="-20 -20 40 40" style={{ left: -14 * size, top: -14 * size, filter: `drop-shadow(0 0 6px ${color})` }}>
            {[0, 72, 144, 216, 288].map((d) => (
              <path key={d} d="M0,0 C-6,-4 -7,-12 -3,-16 L0,-14 L3,-16 C7,-12 6,-4 0,0Z" transform={`rotate(${d})`} fill={color} stroke="#fff" strokeWidth=".8" />
            ))}
            <circle r="2.5" fill="#ffd36e" />
          </svg>
        </>
      )
    case "pixel":
      return (
        <>
          {textBar}
          <svg className={hideOnText} width={22 * size} height={30 * size} viewBox="0 0 11 15" shapeRendering="crispEdges" style={{ position: "absolute", left: 0, top: 0 }}>
            <path d="M0 0h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h-4v1h1v1h1v2h-2v-1h-1v-2h-1v1h-1v1h-1v1h-1z" fill="#000" />
            <path d="M1 2h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h-3v1h1v1h1v2h-1v-1h-1v-2h-2v1h-1v1h-1z" fill={color === "#ffffff" ? "#fff" : "#fff"} />
          </svg>
        </>
      )
    case "crosshair":
      return (
        <>
          {textBar}
          <div className={"absolute transition-transform duration-200 group-data-[hover=true]:rotate-45 " + hideOnText} style={{ left: -16 * size, top: -16 * size, width: 32 * size, height: 32 * size }}>
            <div className="absolute left-1/2 top-0 h-full -translate-x-1/2" style={{ width: 1.5, background: `linear-gradient(${color} 35%, transparent 35% 65%, ${color} 65%)`, boxShadow: `0 0 6px ${color}` }} />
            <div className="absolute top-1/2 left-0 w-full -translate-y-1/2" style={{ height: 1.5, background: `linear-gradient(90deg, ${color} 35%, transparent 35% 65%, ${color} 65%)`, boxShadow: `0 0 6px ${color}` }} />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ width: 3, height: 3, background: color }} />
          </div>
        </>
      )
    case "arrow":
      return (
        <>
          {textBar}
          <svg className={"absolute transition-transform duration-150 group-data-[hover=true]:scale-110 " + hideOnText} width={26 * size} height={30 * size} viewBox="0 0 26 30" style={{ left: -2 * size, top: -2 * size, filter: `drop-shadow(0 3px 6px rgb(0 0 0 / .45)) drop-shadow(0 0 6px ${color}88)` }}>
            <defs><linearGradient id="cg-arrow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".95" /><stop offset="1" stopColor={color} stopOpacity=".85" /></linearGradient></defs>
            <path d="M2 2 L2 24 L8 18.5 L12.5 28 L16.5 26.2 L12 17 L20 17 Z" fill="url(#cg-arrow)" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        </>
      )
    case "heart":
      return (
        <>
          {textBar}
          <svg className={"absolute transition-transform duration-200 group-data-[hover=true]:scale-[1.35] " + hideOnText} width={26 * size} height={24 * size} viewBox="-7 -7 14 12" style={{ left: -13 * size, top: -12 * size, filter: `drop-shadow(0 0 6px ${color})`, animation: "cursor-beat 1.1s ease-in-out infinite" }}>
            <path d="M0,4 C-6,-1 -5,-6 -2.5,-6 C-1.2,-6 -0.3,-5 0,-4 C0.3,-5 1.2,-6 2.5,-6 C5,-6 6,-1 0,4Z" fill={color} stroke="#fff" strokeWidth=".6" />
          </svg>
        </>
      )
    case "star":
      return (
        <>
          {textBar}
          <svg className={"absolute animate-[spin_8s_linear_infinite] transition-transform group-data-[hover=true]:scale-125 " + hideOnText} width={26 * size} height={26 * size} viewBox="-7 -7 14 14" style={{ left: -13 * size, top: -13 * size, filter: `drop-shadow(0 0 7px ${color})` }}>
            <path d={Array.from({ length: 10 }, (_, j) => { const a = (j / 10) * Math.PI * 2 - Math.PI / 2; const rr = j % 2 ? 2.6 : 6.4; return `${j ? "L" : "M"}${(Math.cos(a) * rr).toFixed(2)},${(Math.sin(a) * rr).toFixed(2)}` }).join(" ") + "Z"} fill={color} stroke="#fff" strokeWidth=".6" strokeLinejoin="round" />
          </svg>
        </>
      )
    case "neon":
      return (
        <>
          {textBar}
          <div className={"absolute rounded-full transition-transform duration-200 group-data-[hover=true]:scale-150 " + hideOnText} style={{ width: 26 * size, height: 26 * size, left: -13 * size, top: -13 * size, border: `2px solid ${color}`, boxShadow: `0 0 8px ${color}, 0 0 20px ${color}, inset 0 0 8px ${color}`, animation: "cursor-pulse 1.6s ease-in-out infinite" }} />
          <div className={"absolute rounded-full " + hideOnText} style={{ width: 4 * size, height: 4 * size, left: -2 * size, top: -2 * size, background: "#fff", boxShadow: `0 0 8px ${color}` }} />
        </>
      )
    case "diamond":
      return (
        <>
          {textBar}
          <div className={"absolute transition-transform duration-200 group-data-[hover=true]:rotate-[225deg] group-data-[hover=true]:scale-125 " + hideOnText} style={{ width: 14 * size, height: 14 * size, left: -7 * size, top: -7 * size, transform: "rotate(45deg)", background: `linear-gradient(135deg, #fff, ${color})`, boxShadow: `0 0 12px ${color}, inset 0 0 4px #fff`, borderRadius: 3 }} />
        </>
      )
    case "bubble":
      return (
        <>
          {textBar}
          <div className={"absolute rounded-full transition-all duration-300 group-data-[hover=true]:scale-[1.8] " + hideOnText} style={{ width: 30 * size, height: 30 * size, left: -15 * size, top: -15 * size, background: `radial-gradient(circle at 32% 28%, rgb(255 255 255 / .8), ${color}55 40%, ${color}22 70%)`, border: `1px solid rgb(255 255 255 / .5)`, backdropFilter: "blur(2px) saturate(160%)", boxShadow: `0 4px 14px ${color}66` }} />
        </>
      )
    case "paw":
      return (
        <>
          {textBar}
          <svg className={"absolute transition-transform duration-200 group-data-[hover=true]:scale-125 group-data-[hover=true]:-rotate-12 " + hideOnText} width={26 * size} height={26 * size} viewBox="-10 -10 20 20" style={{ left: -13 * size, top: -13 * size, filter: `drop-shadow(0 0 5px ${color}) drop-shadow(0 2px 3px rgb(0 0 0 / .4))` }}>
            <ellipse cx="0" cy="4" rx="5" ry="4.2" fill={color} />
            {[[-6, -2], [-2.4, -6.2], [2.4, -6.2], [6, -2]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="2.1" ry="2.6" fill={color} />)}
          </svg>
        </>
      )
    default:
      return null
  }
}
