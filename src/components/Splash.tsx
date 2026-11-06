import { useEffect } from "react"
import { motion } from "framer-motion"
import { SakuraCanvas } from "./SakuraCanvas"
import { useStore } from "@/lib/store"

/* pétala com a base em (0,0) apontando para cima; o entalhe na ponta é típico da sakura */
const PETAL = "M0,0 C-17,-8 -23,-32 -10,-47 C-6,-51 -3,-49 0,-44 C3,-49 6,-51 10,-47 C23,-32 17,-8 0,0Z"
const VEIN = "M0,-4 L0,-38"
const RING = [0, 72, 144, 216, 288]

/** Abertura: apenas uma flor de sakura desabrochando. */
export function Splash() {
  const seconds = useStore((s) => s.settings.sakura.splashSeconds)
  const done = useStore((s) => s.setSplashDone)

  useEffect(() => {
    const t = setTimeout(done, seconds * 1000)
    const k = (e: KeyboardEvent) => (e.key === "Escape" || e.key === "Enter" || e.key === " ") && done()
    window.addEventListener("keydown", k)
    return () => {
      clearTimeout(t)
      window.removeEventListener("keydown", k)
    }
  }, [seconds, done])

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{ background: "radial-gradient(1100px 700px at 50% 52%, #3d1534 0%, #1e0d1b 48%, #0b0710 100%)" }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
      onClick={done}
    >
      {/* luz que acende atrás da flor */}
      <motion.div
        className="absolute h-[620px] w-[620px] rounded-full"
        style={{ background: "radial-gradient(circle, rgb(255 150 190 / .32), rgb(255 120 170 / .08) 45%, transparent 68%)" }}
        initial={{ scale: 0.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 2.2, ease: [0.2, 0.7, 0.2, 1], delay: 0.2 }}
      />
      <SakuraCanvas density={0.35} interactive={false} opacity={0.5} className="blur-[1.5px]" />

      <motion.div
        style={{ perspective: 1000 }}
        exit={{ scale: 2.6, opacity: 0, filter: "blur(10px)" }}
        transition={{ duration: 0.8, ease: [0.5, 0, 0.75, 0] }}
      >
        <motion.div
          initial={{ rotateX: 62, rotateZ: -40, scale: 0.55, y: 40 }}
          animate={{ rotateX: 0, rotateZ: 0, scale: 1, y: 0 }}
          transition={{ duration: 2.4, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformStyle: "preserve-3d" }}
        >
          <motion.div animate={{ rotate: [0, 4, 0] }} transition={{ duration: 6, delay: 2.4, repeat: Infinity, ease: "easeInOut" }}>
            <Bloom size={340} />
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

function Bloom({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="-70 -70 140 140" style={{ overflow: "visible", filter: "drop-shadow(0 24px 40px rgb(40 0 25 / .55))" }}>
      <defs>
        <radialGradient id="sp-petal" cx="0.5" cy="1" r="1.05">
          <stop offset="0" stopColor="#ff4f93" />
          <stop offset=".38" stopColor="#ffa6c8" />
          <stop offset=".8" stopColor="#ffe3ee" />
          <stop offset="1" stopColor="#fff8fb" />
        </radialGradient>
        <radialGradient id="sp-back" cx="0.5" cy="1" r="1.05">
          <stop offset="0" stopColor="#d83677" />
          <stop offset=".5" stopColor="#f58bb4" />
          <stop offset="1" stopColor="#ffd2e3" />
        </radialGradient>
        <radialGradient id="sp-core" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset=".55" stopColor="#ff7aa8" />
          <stop offset="1" stopColor="#d6206a" />
        </radialGradient>
      </defs>

      {/* anel de trás (mais escuro, entre as pétalas da frente) */}
      {RING.map((deg, i) => (
        <g key={"b" + deg} transform={`rotate(${deg + 36}) scale(.84)`}>
          <path d={PETAL} fill="url(#sp-back)" opacity=".85" className="bloom-petal" style={{ animationDelay: `${0.25 + i * 0.09}s` }} />
        </g>
      ))}
      {/* anel da frente */}
      {RING.map((deg, i) => (
        <g key={"f" + deg} transform={`rotate(${deg})`}>
          <g className="bloom-petal" style={{ animationDelay: `${0.55 + i * 0.11}s` }}>
            <path d={PETAL} fill="url(#sp-petal)" stroke="#fff" strokeOpacity=".55" strokeWidth=".7" />
            <path d={VEIN} stroke="#ff7fae" strokeOpacity=".35" strokeWidth=".8" strokeLinecap="round" fill="none" />
            <path d="M0,-6 L-6,-30 M0,-6 L6,-30" stroke="#ff7fae" strokeOpacity=".2" strokeWidth=".6" fill="none" />
          </g>
        </g>
      ))}
      {/* estames crescendo do centro */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = i * 30 + (i % 2) * 8
        const len = i % 2 ? 15 : 19
        return (
          <g key={"s" + i} transform={`rotate(${a})`}>
            <g className="bloom-stamen" style={{ animationDelay: `${1.25 + (i % 6) * 0.05}s` }}>
              <line x1="0" y1="-3" x2="0" y2={-len} stroke="#ffd36e" strokeWidth="1" strokeLinecap="round" />
              <circle cy={-len - 1.4} r="2" fill="#ffe7a1" />
            </g>
          </g>
        )
      })}
      <circle r="7.5" fill="url(#sp-core)" className="bloom-core" />
    </svg>
  )
}
