import { useEffect } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Logo } from "./Logo"
import { SakuraCanvas } from "./SakuraCanvas"
import { useStore } from "@/lib/store"

/**
 * Abertura Widgy: pétalas azuis, halo de luz e anéis sutis em volta da marca.
 * O tempo continua sendo o tempo configurado pelo usuário (sem atrasar o boot).
 */
const SPARKLES = [
  { x: "17%", y: "24%", size: 2.5, delay: .05 },
  { x: "83%", y: "26%", size: 2, delay: .65 },
  { x: "31%", y: "69%", size: 2.5, delay: 1.1 },
  { x: "70%", y: "74%", size: 2, delay: .4 },
  { x: "26%", y: "41%", size: 1.5, delay: 1.65 },
  { x: "77%", y: "46%", size: 2.5, delay: 1.3 },
] as const

export function Splash() {
  const seconds = useStore((s) => s.settings.sakura.splashSeconds)
  const done = useStore((s) => s.setSplashDone)
  const reduceMotion = !!useReducedMotion()
  const animated = !reduceMotion && seconds > 0
  const intro = (delay: number) => animated ? delay : 0

  useEffect(() => {
    const timer = window.setTimeout(done, Math.max(0, seconds) * 1000)
    const skip = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter" || event.key === " ") done()
    }
    window.addEventListener("keydown", skip)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("keydown", skip)
    }
  }, [seconds, done])

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden text-white"
      style={{
        background: "radial-gradient(ellipse 780px 580px at 50% 44%, rgba(18,82,190,.19), transparent 72%), linear-gradient(145deg,#050A15 0%,#09172D 57%,#050C19 100%)",
      }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, filter: animated ? "blur(5px)" : "none" }}
      transition={{ duration: animated ? .44 : 0, ease: "easeOut" }}
      onClick={done}
    >
      {/* Ambient illumination — the motion is gentle, not a flashing or neon effect. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[45%] h-[440px] w-[440px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(circle,rgba(25,117,255,.20),rgba(7,62,146,.08) 44%,transparent 71%)" }}
        animate={animated ? { opacity: [.6, 1, .6], scale: [.96, 1.16, .96] } : { opacity: .7, scale: 1 }}
        transition={{ duration: 4, ease: "easeInOut", repeat: animated ? Infinity : 0 }}
      />
      {animated && <SakuraCanvas density={0.07} opacity={0.42} burst interactive={false} palette="blue" />}

      {/* Quiet orbiting rings and tiny glints reinforce the calendar/sakura symbol. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {[216, 290].map((size, index) => (
          <motion.div
            key={size}
            className="absolute left-1/2 top-[45%] rounded-full border border-[#76BCFF]/20"
            style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }}
            initial={animated ? { opacity: 0, scale: .78 } : false}
            animate={{ opacity: index ? .13 : .25, scale: 1 }}
            transition={{ delay: intro(.25 + index * .15), duration: .85, ease: "easeOut" }}
          />
        ))}
        {SPARKLES.map((spark) => (
          <motion.span
            key={spark.x + spark.y}
            className="absolute rounded-full bg-[#BBDFFF]"
            style={{ left: spark.x, top: spark.y, width: spark.size, height: spark.size, boxShadow: "0 0 10px rgba(100,174,255,.6)" }}
            initial={animated ? { opacity: 0, scale: .7 } : false}
            animate={animated ? { opacity: [0, .65, 0], scale: [.7, 1.25, .7] } : { opacity: .32 }}
            transition={{ duration: 2.5, delay: spark.delay, repeat: animated ? Infinity : 0, ease: "easeInOut" }}
          />
        ))}
      </div>

      <div className="relative flex -translate-y-3 flex-col items-center px-6 text-center">
        <motion.div
          className="relative"
          initial={animated ? { opacity: 0, y: 18, scale: .86, filter: "blur(6px)" } : false}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: .9, ease: [.16, 1, .3, 1] }}
        >
          <div className="pointer-events-none absolute inset-[13%] rounded-[28%] bg-[#2A9FFF]/30 blur-3xl" />
          <div className="relative drop-shadow-[0_16px_50px_rgba(10,92,220,.28)]">
            <Logo size={132} />
            {animated && <div className="widgy-splash-sheen pointer-events-none absolute inset-0 overflow-hidden rounded-[30px]" aria-hidden="true" />}
          </div>
        </motion.div>
        <motion.h1
          initial={animated ? { opacity: 0, y: 12 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: .6, delay: intro(.3) }}
          className="mt-7 text-[42px] font-semibold tracking-[-.045em] text-[#F5F9FF]"
          style={{ fontFamily: "'Outfit Variable', 'Inter Variable', sans-serif" }}
        >Widgy</motion.h1>
        <motion.p
          initial={animated ? { opacity: 0, y: 8 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: .6, delay: intro(.46) }}
          className="mt-1 text-[13px] font-medium tracking-[.045em] text-[#9AB4D1]"
        >Seu espaço, do seu jeito.</motion.p>
        <motion.div
          className="mt-9 h-[3px] w-36 overflow-hidden rounded-full bg-white/10"
          initial={animated ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: .4, delay: intro(.55) }}
          role="progressbar"
          aria-label="Carregando Widgy"
        >
          <motion.div
            className="h-full w-full origin-left rounded-full"
            style={{ background: "linear-gradient(90deg,#168DF7,#9ADBFF)", boxShadow: "0 0 12px rgba(79,175,255,.65)" }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: animated ? Math.max(.3, seconds - .25) : 0, ease: "linear" }}
          />
        </motion.div>
      </div>
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); done() }}
        className="absolute bottom-7 right-8 rounded-lg px-3 py-2 text-xs font-medium text-[#8BA2BF] transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#55B8FF]"
      >Pular abertura</button>
    </motion.div>
  )
}
