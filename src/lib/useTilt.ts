import { useEffect, type RefObject } from "react"
import { useStore } from "./store"

/** Inclinação 3D + reflexo seguindo o mouse. */
export function useTilt(ref: RefObject<HTMLElement | null>, factor = 1, enabled = true) {
  const tilt = useStore((s) => s.settings.tilt)
  const anim = useStore((s) => s.settings.animations)
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled || !anim || tilt === 0) {
      if (el) el.style.transform = ""
      return
    }
    const max = tilt * factor
    let raf = 0
    let tx = 0, ty = 0, cx = 0, cy = 0
    const tick = () => {
      cx += (tx - cx) * 0.15
      cy += (ty - cy) * 0.15
      el.style.transform = `perspective(900px) rotateX(${cy}deg) rotateY(${cx}deg)`
      if (Math.abs(tx - cx) > 0.01 || Math.abs(ty - cy) > 0.01) raf = requestAnimationFrame(tick)
      else raf = 0
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick) }
    const move = (e: PointerEvent) => {
      if (e.buttons) return
      const r = el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width
      const py = (e.clientY - r.top) / r.height
      tx = (px - 0.5) * 2 * max
      ty = -(py - 0.5) * 2 * max
      el.style.setProperty("--gx", px * 100 + "%")
      el.style.setProperty("--gy", py * 100 + "%")
      el.style.setProperty("--go", "1")
      kick()
    }
    const leave = () => { tx = 0; ty = 0; el.style.setProperty("--go", "0"); kick() }
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerleave", leave)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerleave", leave)
      el.style.transform = ""
    }
  }, [ref, tilt, factor, enabled, anim])
}
