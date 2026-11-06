import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { fontFamily } from "@/lib/fonts"
import type { Widget } from "@/lib/types"
import { cn } from "@/lib/utils"

export function useNow(interval = 1000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), interval)
    return () => clearInterval(id)
  }, [interval])
  return now
}

const z = (n: number) => String(n).padStart(2, "0")

/* número por extenso (0–59), para o relógio "por extenso" */
const UN = ["zero", "uma", "duas", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"]
const DZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta"]
const ext = (n: number, fem = true) => {
  const u = fem ? UN : UN.map((x, i) => (i === 1 ? "um" : i === 2 ? "dois" : x))
  if (n < 20) return u[n]
  const d = Math.floor(n / 10), r = n % 10
  return DZ[d] + (r ? " e " + u[r] : "")
}

export function ClockWidget({ w }: { w: Widget }) {
  const { style = "digital", seconds = true, h12 = false, showDate = true, font } = w.config
  const color: string | undefined = w.config.color || undefined
  const weight: number | undefined = w.config.weight || undefined
  const glow: boolean = !!w.config.glow
  const blink: boolean = w.config.blink ?? true
  const now = useNow(style === "analog" || style === "rings" ? 50 : 500)
  let h = now.getHours()
  const suffix = h12 ? (h >= 12 ? "PM" : "AM") : ""
  if (h12) h = h % 12 || 12
  const ff = font ? fontFamily(font) : "var(--font-num)"
  const date = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
  const scale = Math.min(w.w / 320, w.h / 170) * (w.config.size ?? 1)
  const glowCss = glow ? `0 0 ${10 * scale}px ${color ?? "var(--accent)"}, 0 0 ${28 * scale}px ${color ?? "var(--accent)"}` : undefined
  const sep = <span className={blink && now.getSeconds() % 2 ? "opacity-25" : ""}>:</span>

  if (style === "analog") return <Analog now={now} seconds={seconds} showDate={showDate} />

  if (style === "stacked")
    return (
      <div className="flex h-full items-center justify-center gap-4 px-4">
        <div style={{ fontFamily: ff, fontSize: 70 * scale, lineHeight: 0.84, fontWeight: weight ?? 900, letterSpacing: "-0.04em", color, textShadow: glowCss }} className="font-num">
          <div>{z(h)}</div>
          <div style={{ color: color ?? "var(--accent)" }}>{z(now.getMinutes())}</div>
        </div>
        {showDate && (
          <div className="flex flex-col justify-center" style={{ fontSize: 15 * scale }}>
            <div className="font-semibold capitalize">{now.toLocaleDateString("pt-BR", { weekday: "long" })}</div>
            <div className="text-fg-muted">{now.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}</div>
            {seconds && <div className="font-num mt-1 text-fg-muted">{z(now.getSeconds())}s</div>}
          </div>
        )}
      </div>
    )

  if (style === "neon") {
    const c = color ?? "var(--accent)"
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <div className="clock-neon" style={{ fontFamily: font ? ff : "'Orbitron Variable', sans-serif", fontSize: 60 * scale, fontWeight: weight ?? 500, color: "#fff", textShadow: `0 0 4px #fff, 0 0 ${10 * scale}px ${c}, 0 0 ${22 * scale}px ${c}, 0 0 ${42 * scale}px ${c}`, letterSpacing: "0.04em" }}>
          {z(h)}{sep}{z(now.getMinutes())}{seconds && <span style={{ fontSize: "0.45em" }}> {z(now.getSeconds())}</span>}
        </div>
        {showDate && <div className="mt-2 text-sm tracking-[0.3em] uppercase" style={{ color: c, textShadow: `0 0 8px ${c}` }}>{now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}</div>}
      </div>
    )
  }

  if (style === "nixie") {
    const digits = (z(h) + z(now.getMinutes()) + (seconds ? z(now.getSeconds()) : "")).split("")
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-3">
        <div className="flex items-center gap-1">
          {digits.map((d, i) => (
            <span key={i} className="flex items-center">
              <span className="relative flex items-center justify-center overflow-hidden" style={{ width: 34 * scale, height: 58 * scale, borderRadius: `${16 * scale}px ${16 * scale}px ${6 * scale}px ${6 * scale}px`, background: "radial-gradient(circle at 50% 30%, rgb(255 140 50 / .12), rgb(10 6 4 / .85) 70%)", boxShadow: "inset 0 0 0 1px rgb(255 255 255 / .12), inset 0 6px 10px rgb(255 255 255 / .06), 0 4px 10px rgb(0 0 0 / .5)" }}>
                <span className="absolute inset-0 opacity-25" style={{ backgroundImage: "repeating-linear-gradient(0deg, rgb(255 255 255 / .08) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgb(255 255 255 / .08) 0 1px, transparent 1px 4px)" }} />
                <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 44 * scale, color: color ?? "#ffb15c", textShadow: `0 0 6px ${color ?? "#ff8a2a"}, 0 0 16px ${color ?? "#ff6a00"}` }}>{d}</span>
              </span>
              {(i === 1 || (i === 3 && seconds)) && <span className="mx-0.5 flex flex-col gap-1.5"><i className="h-1.5 w-1.5 rounded-full" style={{ background: color ?? "#ff9a3c", boxShadow: `0 0 6px ${color ?? "#ff6a00"}` }} /><i className="h-1.5 w-1.5 rounded-full" style={{ background: color ?? "#ff9a3c", boxShadow: `0 0 6px ${color ?? "#ff6a00"}` }} /></span>}
            </span>
          ))}
        </div>
        {showDate && <div className="text-xs tracking-widest text-fg-muted uppercase">{date}</div>}
      </div>
    )
  }

  if (style === "words") {
    const hh = now.getHours() % 12 || 12
    const mm = now.getMinutes()
    const hourWord = now.getHours() === 0 ? "meia-noite" : now.getHours() === 12 ? "meio-dia" : ext(hh) + (hh === 1 ? " hora" : " horas")
    return (
      <div className="flex h-full flex-col justify-center p-5" style={{ fontSize: 22 * scale, lineHeight: 1.15 }}>
        <div className="text-fg-muted" style={{ fontSize: "0.7em" }}>{now.getHours() < 12 ? "Bom dia," : now.getHours() < 18 ? "Boa tarde," : "Boa noite,"} são</div>
        <div style={{ fontFamily: font ? ff : "var(--font-display)", fontWeight: weight ?? 600, color, textShadow: glowCss }}>
          {hourWord}{mm ? <> e <span style={{ color: color ?? "var(--accent)" }}>{ext(mm, false)}</span></> : <> em ponto</>}
        </div>
        {showDate && <div className="mt-1 capitalize text-fg-muted" style={{ fontSize: "0.6em" }}>{date}</div>}
      </div>
    )
  }

  if (style === "rings") {
    const s = now.getSeconds() + now.getMilliseconds() / 1000
    const rings = [
      { r: 44, v: (now.getHours() % 12 + now.getMinutes() / 60) / 12, c: color ?? "var(--accent)" },
      { r: 36, v: (now.getMinutes() + s / 60) / 60, c: "#7cc8ff" },
      ...(seconds ? [{ r: 28, v: s / 60, c: "#8cf0b0" }] : []),
    ]
    return (
      <div className="flex h-full items-center justify-center gap-4 p-3">
        <svg viewBox="0 0 100 100" style={{ height: "100%", maxHeight: 170 * scale }}>
          {rings.map((g) => (
            <g key={g.r} transform="rotate(-90 50 50)">
              <circle cx="50" cy="50" r={g.r} fill="none" stroke="currentColor" strokeOpacity=".1" strokeWidth="6" />
              <circle cx="50" cy="50" r={g.r} fill="none" stroke={g.c} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * g.r * g.v} ${2 * Math.PI * g.r}`} style={{ filter: glow ? `drop-shadow(0 0 3px ${g.c})` : undefined }} />
            </g>
          ))}
          <text x="50" y="55" textAnchor="middle" fontSize="15" fontWeight={weight ?? 700} fill={color ?? "currentColor"} style={{ fontFamily: ff }}>{z(h)}:{z(now.getMinutes())}</text>
        </svg>
        {showDate && w.w > 300 && <div className="text-sm capitalize text-fg-muted">{date}</div>}
      </div>
    )
  }

  if (style === "gradient")
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <div className="clock-gradient font-num" style={{ fontFamily: ff, fontSize: 74 * scale, fontWeight: weight ?? 800, lineHeight: 1, letterSpacing: "-0.03em", backgroundImage: `linear-gradient(90deg, ${color ?? "var(--accent)"}, #c49bff, #7cc8ff, ${color ?? "var(--accent)"})`, backgroundSize: "300% 100%", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: glow ? `drop-shadow(0 0 ${8 * scale}px ${color ?? "var(--accent)"})` : undefined }}>
          {z(h)}:{z(now.getMinutes())}
        </div>
        {showDate && <div className="mt-2 text-sm capitalize text-fg-muted">{date}</div>}
      </div>
    )

  if (style === "flip")
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <div className="flex items-center gap-2" style={{ fontFamily: ff, fontSize: 54 * scale }}>
          <Flip v={z(h)} /> <span className="opacity-60">:</span> <Flip v={z(now.getMinutes())} />
          {seconds && (<><span className="opacity-60">:</span><Flip v={z(now.getSeconds())} small /></>)}
        </div>
        {showDate && <div className="text-sm capitalize text-fg-muted">{date}</div>}
      </div>
    )

  if (style === "lcd")
    return (
      <div className="flex h-full flex-col items-center justify-center p-3">
        <div
          className="relative w-full rounded-lg px-4 py-2 text-center"
          style={{ background: "linear-gradient(180deg,#9fb38a,#b7c99f)", boxShadow: "inset 0 3px 8px rgb(0 0 0 / .45), 0 1px 0 rgb(255 255 255 / .2)", color: "#1d2a14", fontFamily: font ? ff : "'VT323', monospace" }}
        >
          <div className="absolute inset-x-4 top-2 text-center opacity-[0.08]" style={{ fontSize: 64 * scale, lineHeight: 1 }}>88:88{seconds && ":88"}</div>
          <div style={{ fontSize: 64 * scale, lineHeight: 1 }}>
            {z(h)}<span className={now.getSeconds() % 2 ? "opacity-30" : ""}>:</span>{z(now.getMinutes())}
            {seconds && <span style={{ fontSize: 36 * scale }}>:{z(now.getSeconds())}</span>}
          </div>
          {showDate && <div className="text-lg uppercase" style={{ lineHeight: 1 }}>{now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })} {suffix}</div>}
        </div>
      </div>
    )

  if (style === "minimal")
    return (
      <div className="flex h-full flex-col justify-end p-5">
        <div className="text-sm capitalize text-fg-muted">{now.toLocaleDateString("pt-BR", { weekday: "long" })}</div>
        <div style={{ fontFamily: ff, fontSize: 72 * scale, lineHeight: 0.95, fontWeight: weight ?? 200, letterSpacing: "-0.04em", color, textShadow: glowCss }}>
          {z(h)}<span className="text-brand">.</span>{z(now.getMinutes())}
        </div>
      </div>
    )

  // digital
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="flex items-baseline" style={{ fontFamily: ff, fontSize: 68 * scale, lineHeight: 1, fontWeight: weight ?? 600, letterSpacing: "-0.02em", color, textShadow: glowCss ?? "0 4px 24px color-mix(in srgb, var(--accent) 40%, transparent)" }}>
        <span className="font-num">{z(h)}</span>
        {/* pisca uma vez por segundo (troca de classe): animação contínua obrigava a refazer o vidro desfocado a cada quadro */}
        <span className={cn("mx-1 text-brand", blink && now.getSeconds() % 2 && "opacity-25")}>:</span>
        <span className="font-num">{z(now.getMinutes())}</span>
        {seconds && <span className="font-num ml-2 text-fg-muted" style={{ fontSize: 26 * scale }}>{z(now.getSeconds())}</span>}
        {suffix && <span className="ml-2 text-fg-muted" style={{ fontSize: 18 * scale }}>{suffix}</span>}
      </div>
      {showDate && <div className="mt-2 text-sm capitalize text-fg-muted">{date}</div>}
    </div>
  )
}

function Flip({ v, small }: { v: string; small?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-lg px-2" style={{ perspective: 300, background: "linear-gradient(180deg, rgb(0 0 0 / .45) 50%, rgb(0 0 0 / .55) 50%)", boxShadow: "inset 0 1px 0 rgb(255 255 255 / .15), 0 6px 14px rgb(0 0 0 / .35)", fontSize: small ? "0.55em" : undefined, color: "#fff" }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={v} initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} exit={{ rotateX: -90, opacity: 0 }} transition={{ duration: 0.35 }} className="font-num">
          {v}
        </motion.div>
      </AnimatePresence>
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/60" />
    </div>
  )
}

function Analog({ now, seconds, showDate }: { now: Date; seconds: boolean; showDate: boolean }) {
  const ms = now.getMilliseconds()
  const s = now.getSeconds() + ms / 1000
  const m = now.getMinutes() + s / 60
  const h = (now.getHours() % 12) + m / 60
  return (
    <div className="flex h-full items-center justify-center p-3">
      <svg viewBox="-100 -100 200 200" className="h-full max-h-full" style={{ filter: "drop-shadow(0 8px 16px rgb(0 0 0 / .35))" }}>
        <defs>
          <radialGradient id="face" cx=".35" cy=".3" r=".9">
            <stop offset="0" stopColor="#fff" stopOpacity=".18" />
            <stop offset="1" stopColor="#fff" stopOpacity=".02" />
          </radialGradient>
        </defs>
        <circle r="94" fill="url(#face)" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" />
        {Array.from({ length: 60 }, (_, i) => (
          <line key={i} x1="0" y1={i % 5 ? -86 : -80} x2="0" y2="-90" stroke="currentColor" strokeOpacity={i % 5 ? 0.3 : 0.9} strokeWidth={i % 5 ? 1 : 2.5} transform={`rotate(${i * 6})`} strokeLinecap="round" />
        ))}
        {showDate && (
          <text y="42" textAnchor="middle" fontSize="12" fill="currentColor" opacity=".6" style={{ fontFamily: "var(--font-ui)", textTransform: "uppercase", letterSpacing: 2 }}>
            {now.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" })}
          </text>
        )}
        <line y1="10" y2="-48" stroke="currentColor" strokeWidth="6" strokeLinecap="round" transform={`rotate(${h * 30})`} />
        <line y1="12" y2="-72" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" transform={`rotate(${m * 6})`} />
        {seconds && (
          <g transform={`rotate(${s * 6})`}>
            <line y1="18" y2="-80" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
            <circle cy="-62" r="3" fill="var(--accent)" />
          </g>
        )}
        <circle r="5" fill="var(--accent)" stroke="#fff" strokeWidth="1.5" />
      </svg>
    </div>
  )
}
