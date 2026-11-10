import { useEffect } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Logo } from "./Logo"
import { useStore } from "@/lib/store"

/** Abertura Widgy: a sakura do novo ícone emerge, seguida da marca e do progresso. */
export function Splash() {
  const seconds = useStore((s) => s.settings.sakura.splashSeconds)
  const done = useStore((s) => s.setSplashDone)
  const reduceMotion = useReducedMotion()

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
        background: "radial-gradient(ellipse 760px 510px at 50% 46%, rgba(25,108,232,.18), transparent 70%), linear-gradient(145deg, #060B17, #081429 63%, #050B18)",
      }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : .45, ease: "easeInOut" }}
      onClick={done}
    >
      <div className="pointer-events-none absolute inset-0 opacity-40"
        style={{ background: "radial-gradient(circle at 50% 55%, transparent 0 170px, rgba(100,178,255,.045) 171px, transparent 172px)" }} />
      <div className="relative flex -translate-y-4 flex-col items-center px-6 text-center">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16, scale: .88, filter: "blur(5px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: .9, ease: [ .16, 1, .3, 1 ] }}
          className="drop-shadow-[0_16px_50px_rgba(15,99,236,0.24)]"
        >
          <Logo size={132} />
        </motion.div>
        <motion.h1
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: .6, delay: reduceMotion ? 0 : .35 }}
          className="mt-7 font-display text-[42px] font-semibold tracking-[-0.045em] text-[#F5F9FF]"
        >
          Widgy
        </motion.h1>
        <motion.p
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: .6, delay: reduceMotion ? 0 : .48 }}
          className="mt-1 text-[13px] font-medium tracking-[.045em] text-[#98AFCB]"
        >
          Seu espaço, do seu jeito.
        </motion.p>
        <div className="mt-10 h-[3px] w-36 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Carregando Widgy">
          <motion.div
            className="h-full w-full origin-left rounded-full bg-[#55B8FF]"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: reduceMotion ? 0 : Math.max(.5, seconds - .35), ease: "linear" }}
          />
        </div>
      </div>
      <button type="button" onClick={(event) => { event.stopPropagation(); done() }}
        className="absolute bottom-7 right-8 rounded-lg px-3 py-2 text-xs font-medium text-[#8295B1] transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#55B8FF]">
        Pular abertura
      </button>
    </motion.div>
  )
}
