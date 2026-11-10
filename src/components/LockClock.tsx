import { fontFamily, ensureFont } from "@/lib/fonts"
import { useEffect } from "react"
import type { LockClock as LC } from "@/lib/types"
import { useNow } from "@/widgets/Clock"

export const LOCK_DEFAULT: LC = {
  on: false, style: "ios", color: "#ffffff", size: 1, weight: 700, y: 14, x: 50, align: "center",
  showDate: true, seconds: false, depth: true, opacity: 0.92, glow: false,
}

const z = (n: number) => String(n).padStart(2, "0")

/** Relógio grande desenhado no papel de parede (pode ficar atrás do assunto da foto). */
export function LockClock({ c, preview }: { c: LC; preview?: boolean }) {
  const now = useNow(c.seconds ? 1000 : 5000)
  useEffect(() => { if (c.font) void ensureFont(c.font) }, [c.font])
  let h = now.getHours()
  if (c.h12) h = h % 12 || 12
  const time = `${c.h12 ? h : z(h)}:${z(now.getMinutes())}`
  const date = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
  const base = (preview ? 9 : 17) * c.size // vh
  const family =
    c.font ? fontFamily(c.font)
    : c.style === "serif" ? "'Playfair Display Variable', serif"
    : c.style === "retro" ? "'VT323', monospace"
    : c.style === "neon" ? "'Outfit Variable', sans-serif"
    : "'Segoe UI Variable Display', 'SF Pro Display', 'Outfit Variable', system-ui, sans-serif"
  const weight = c.style === "thin" ? 200 : c.style === "bold" || c.style === "stacked" ? 900 : c.weight
  const glow = c.glow || c.style === "neon"
  const textStyle: React.CSSProperties = {
    fontFamily: family,
    fontWeight: weight,
    color: c.style === "outline" ? "transparent" : c.color,
    WebkitTextStroke: c.style === "outline" ? `${Math.max(1, base / 40)}vh ${c.color}` : undefined,
    opacity: c.opacity,
    letterSpacing: c.style === "thin" ? "-0.02em" : c.style === "retro" ? "0.02em" : "-0.035em",
    lineHeight: c.style === "stacked" ? 0.82 : 0.95,
    fontStyle: c.style === "serif" ? "italic" : undefined,
    textShadow: glow ? `0 0 ${base * 0.12}vh ${c.color}, 0 0 ${base * 0.35}vh ${c.color}99` : "0 0.4vh 2.5vh rgb(0 0 0 / .25)",
    fontVariantNumeric: "tabular-nums",
  }
  const tx = c.align === "left" ? "0%" : c.align === "right" ? "-100%" : "-50%"
  return (
    <div
      className="pointer-events-none absolute select-none"
      style={{ left: `${c.x}%`, top: `${c.y}%`, transform: `translateX(${tx})`, textAlign: c.align }}
    >
      {c.showDate && (
        <div style={{ fontFamily: family, fontWeight: 600, fontSize: `${base * 0.13}vh`, color: c.color, opacity: c.opacity * 0.9, letterSpacing: "0.01em", marginBottom: `${base * 0.02}vh`, textTransform: "capitalize", textShadow: "0 0.3vh 1.5vh rgb(0 0 0 / .3)" }}>
          {date}
        </div>
      )}
      {c.style === "stacked" ? (
        <div style={{ ...textStyle, fontSize: `${base * 1.15}vh` }}>
          <div>{c.h12 ? h : z(h)}</div>
          <div>{z(now.getMinutes())}</div>
        </div>
      ) : (
        <div style={{ ...textStyle, fontSize: `${base}vh`, whiteSpace: "nowrap" }}>
          {time}
          {c.seconds && <span style={{ fontSize: "0.35em", marginLeft: "0.15em", opacity: 0.7 }}>{z(now.getSeconds())}</span>}
        </div>
      )}
    </div>
  )
}
