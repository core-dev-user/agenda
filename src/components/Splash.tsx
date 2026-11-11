import { useEffect, useId, useRef, type RefObject } from "react"
import { animate, motion, useMotionTemplate, useMotionValue, usePresence, useReducedMotion, useSpring, useTransform, type Easing } from "framer-motion"
import { useStore } from "@/lib/store"
import { perfPaused } from "@/lib/perf"

/**
 * Abertura Widgy.
 *
 * A marca é montada em sequência, como um objeto físico:
 *   1. o fundo acende (aurora azul lenta, grão fino e a grade de "dias" do calendário revelada em onda);
 *   2. o contorno do bloco é desenhado e o vidro azul preenche;
 *   3. as duas argolas do calendário encaixam;
 *   4. a sakura desabrocha pétala por pétala, solta algumas pétalas e emite uma onda de luz;
 *   5. o nome sobe letra por letra e a linha de carregamento acompanha o tempo configurado.
 * Ao terminar, a abertura se recolhe num círculo a partir da logo, revelando a área de trabalho.
 *
 * Respeita: duração escolhida nas configurações (a coreografia comprime em aberturas curtas),
 * "reduzir movimento" do Windows (mostra a marca parada, sem partículas) e pular com clique, Esc, Enter ou espaço.
 */

const EASE_OUT: Easing = [0.16, 1, 0.3, 1]
const EASE_IN_OUT: Easing = [0.65, 0, 0.35, 1]
const PETAL = "M0 0C-15-9-19-31-8-43L0-37 8-43C19-31 15-9 0 0Z"
const ANGLES = [0, 72, 144, 216, 288]
const WORD = "Widgy".split("")
const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

/**
 * Pétalas da abertura (canvas próprio, leve): um punhado sai da flor no instante em que ela abre,
 * com impulso para fora, resistência do ar e giro em 3D; depois poucas caem devagar do alto.
 */
const PETAL_COLORS = ["221,240,255", "195,229,255", "165,216,255", "129,193,255"]
type Flake = { x: number; y: number; vx: number; vy: number; rot: number; spin: number; flip: number; flipSpeed: number; size: number; life: number; max: number; color: string; depth: number }

function SplashPetals({ origin, burstAt }: { origin: RefObject<HTMLDivElement | null>; burstAt: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const shape = new Path2D()
    shape.moveTo(0, 10)
    shape.bezierCurveTo(-8, 6, -9, -4, -4, -10)
    shape.lineTo(0, -7)
    shape.lineTo(4, -10)
    shape.bezierCurveTo(9, -4, 8, 6, 0, 10)
    shape.closePath()

    let w = 0, h = 0
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      w = canvas.clientWidth; h = canvas.clientHeight
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener("resize", resize)

    const flakes: Flake[] = []
    const rand = (a: number, b: number) => a + Math.random() * (b - a)
    const make = (x: number, y: number, vx: number, vy: number, depth: number, max: number): Flake => ({
      x, y, vx, vy, depth, max, life: 0,
      rot: rand(0, Math.PI * 2), spin: rand(-2.2, 2.2), flip: rand(0, Math.PI * 2), flipSpeed: rand(2, 4.5),
      size: rand(0.55, 1) * (0.6 + depth * 0.6), color: PETAL_COLORS[(Math.random() * PETAL_COLORS.length) | 0],
    })
    const burst = () => {
      const r = origin.current?.getBoundingClientRect()
      const cr = canvas.getBoundingClientRect()
      if (!r) return
      // centro da flor na logo (≈ 62% da altura do bloco)
      const cx = r.left - cr.left + r.width / 2, cy = r.top - cr.top + r.height * 0.6
      for (let i = 0; i < 20; i++) {
        // ângulos e forças desiguais: nada de anel perfeito
        const a = (i / 20) * Math.PI * 2 + rand(-0.45, 0.45)
        const speed = rand(80, 430) * (Math.random() < 0.25 ? 0.55 : 1)
        const d = rand(8, 30)
        flakes.push(make(cx + Math.cos(a) * d, cy + Math.sin(a) * d, Math.cos(a) * speed, Math.sin(a) * speed - rand(30, 110), rand(0.35, 1), rand(2.2, 4)))
      }
    }

    let raf = 0, last = performance.now(), start = last, burstDone = false, nextDrift = start + 900
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (perfPaused()) return
      const elapsed = (now - start) / 1000
      if (!burstDone && elapsed >= burstAt) { burstDone = true; burst() }
      if (now >= nextDrift && flakes.length < 40) {
        nextDrift = now + rand(260, 520)
        flakes.push(make(rand(-0.1, 1.05) * w, -20, rand(10, 40), rand(25, 55), rand(0.15, 0.7), rand(9, 14)))
      }
      ctx.clearRect(0, 0, w, h)
      for (let i = flakes.length - 1; i >= 0; i--) {
        const f = flakes[i]
        f.life += dt
        const drag = Math.pow(0.12, dt) // impulso inicial perde força rápido, como no ar
        f.vx = f.vx * drag + 14 * dt
        f.vy = f.vy * drag + 34 * dt * (0.5 + f.depth)
        f.x += (f.vx + Math.sin(f.life * 1.6 + f.rot) * 12) * dt
        f.y += f.vy * dt
        f.rot += f.spin * dt
        f.flip += f.flipSpeed * dt
        if (f.life > f.max || f.y > h + 30 || f.x > w + 40) { flakes.splice(i, 1); continue }
        const fadeIn = Math.min(1, f.life / 0.25)
        const fadeOut = Math.min(1, (f.max - f.life) / 0.8)
        const alpha = (0.25 + f.depth * 0.6) * fadeIn * fadeOut
        const flip = Math.cos(f.flip)
        ctx.save()
        ctx.translate(f.x, f.y)
        ctx.rotate(f.rot)
        ctx.scale(f.size * (0.25 + 0.75 * Math.abs(flip)), f.size)
        // o lado de trás da pétala é um pouco mais escuro: dá a sensação de volume ao girar
        ctx.fillStyle = `rgba(${f.color},${(alpha * (flip > 0 ? 1 : 0.7)).toFixed(3)})`
        ctx.fill(shape)
        ctx.restore()
      }
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize) }
  }, [origin, burstAt])
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
}

/** Logo desenhada em partes para poder animar cada uma (mesma geometria de public/logos/widgy.svg). */
function AnimatedMark({ size, animated, t }: { size: number; animated: boolean; t: (s: number) => number }) {
  const id = useId().replace(/:/g, "")
  const ids = { bg: id + "bg", head: id + "hd", petal: id + "pt", clip: id + "cl", sheen: id + "sh" }
  const at = (delay: number, duration: number, ease: Easing = EASE_OUT) =>
    animated ? { delay: t(delay), duration: t(duration), ease } : { duration: 0 }
  const from = <T,>(v: T) => (animated ? v : false)

  return (
    <svg width={size} height={size} viewBox="0 0 128 128" role="img" aria-label="Widgy" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={ids.bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3DBAF9" />
          <stop offset=".33" stopColor="#137FFA" />
          <stop offset="1" stopColor="#0647D8" />
        </linearGradient>
        <linearGradient id={ids.head} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#61CCFF" />
          <stop offset="1" stopColor="#168AF7" />
        </linearGradient>
        <linearGradient id={ids.petal} x1=".15" y1="0" x2=".88" y2="1">
          <stop offset="0" stopColor="#FAFDFF" />
          <stop offset=".58" stopColor="#E4F3FF" />
          <stop offset="1" stopColor="#A9D4FF" />
        </linearGradient>
        <linearGradient id={ids.sheen} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".38" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={ids.clip}><rect x="8" y="10" width="112" height="112" rx="28" /></clipPath>
      </defs>

      {/* 1 · contorno desenhado */}
      <motion.rect x="8" y="10" width="112" height="112" rx="28" fill="none" stroke="#8FD3FF" strokeWidth="1.4"
        initial={from({ pathLength: 0, opacity: 0 })}
        animate={{ pathLength: 1, opacity: animated ? [0, 1, 1, 0] : 0 }}
        transition={animated ? { pathLength: at(0.15, 0.6, EASE_IN_OUT), opacity: { ...at(0.15, 0.95), times: [0, 0.1, 0.65, 1] } } : { duration: 0 }} />

      {/* 2 · vidro azul */}
      <motion.g initial={from({ opacity: 0, scale: 0.94 })} animate={{ opacity: 1, scale: 1 }} transition={at(0.5, 0.55)}
        style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}>
        <rect x="8" y="10" width="112" height="112" rx="28" fill={`url(#${ids.bg})`} />
        <g clipPath={`url(#${ids.clip})`}>
          <motion.rect x="8" y="10" width="112" height="28" fill={`url(#${ids.head})`}
            initial={from({ y: -18 })} animate={{ y: 10 }} transition={at(0.62, 0.5)} />
          <motion.path d="M8 37.5H120" stroke="#B6E9FF" strokeOpacity=".28" strokeWidth=".8"
            initial={from({ pathLength: 0 })} animate={{ pathLength: 1 }} transition={at(0.8, 0.45)} />
          {/* reflexo que atravessa o vidro uma vez */}
          {animated && (
            <motion.rect y="-10" width="46" height="160" fill={`url(#${ids.sheen})`} transform="rotate(18 64 64)"
              initial={{ x: -70 }} animate={{ x: 160 }} transition={at(1.35, 1.1, EASE_IN_OUT)} />
          )}
        </g>
      </motion.g>

      {/* 3 · argolas do calendário */}
      {[35, 84].map((x, i) => (
        <motion.g key={x} initial={from({ y: -16, opacity: 0 })} animate={{ y: 0, opacity: 1 }}
          transition={animated ? { delay: t(0.78 + i * 0.07), type: "spring", stiffness: 420, damping: 17, mass: 0.7 } : { duration: 0 }}>
          <rect x={x - 1} y="2" width="12" height="24" rx="6" fill="#003EA9" opacity=".22" />
          <rect x={x} y="0.5" width="10" height="23" rx="5" fill="#DDF2FF" />
        </motion.g>
      ))}

      {/* 4 · sakura desabrochando */}
      <g transform="translate(64 79) scale(.84)">
        {ANGLES.map((deg, i) => (
          <g key={deg} transform={`rotate(${deg})`}>
            <motion.path d={PETAL} fill={`url(#${ids.petal})`}
              style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
              initial={from({ scale: 0, rotate: -28, opacity: 0 })}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={animated ? { delay: t(0.95 + i * 0.065), type: "spring", stiffness: 260, damping: 15, mass: 0.6 } : { duration: 0 }} />
          </g>
        ))}
        {ANGLES.map((deg, i) => (
          <g key={"s" + deg} transform={`rotate(${deg})`}>
            <motion.ellipse cy="-11.8" rx="2.2" ry="4.6" fill="#2184EA"
              style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
              initial={from({ scaleY: 0, opacity: 0 })} animate={{ scaleY: 1, opacity: 1 }}
              transition={at(1.3 + i * 0.03, 0.35)} />
          </g>
        ))}
        <motion.circle r="4" fill="#EDF8FF" initial={from({ scale: 0 })} animate={{ scale: 1 }}
          style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
          transition={animated ? { delay: t(1.28), type: "spring", stiffness: 500, damping: 14 } : { duration: 0 }} />
      </g>
    </svg>
  )
}

export function Splash() {
  const seconds = useStore((s) => s.settings.sakura.splashSeconds)
  const done = useStore((s) => s.setSplashDone)
  const reduceMotion = !!useReducedMotion()
  const animated = !reduceMotion && seconds > 0
  // a coreografia completa leva ~2,2 s; aberturas curtas comprimem tudo proporcionalmente
  const k = Math.min(1, Math.max(0.45, (seconds - 0.5) / 2.2))
  const t = (s: number) => s * k
  const LOGO = 128

  // inclinação 3D muito leve seguindo o mouse (a luz de fundo anda ao contrário)
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 60, damping: 18 })
  const sy = useSpring(my, { stiffness: 60, damping: 18 })
  const rotateY = useTransform(sx, [-1, 1], [-7, 7])
  const rotateX = useTransform(sy, [-1, 1], [6, -6])
  const glowX = useTransform(sx, [-1, 1], [24, -24])
  const glowY = useTransform(sy, [-1, 1], [18, -18])

  const root = useRef<HTMLDivElement>(null)
  const mark = useRef<HTMLDivElement>(null)

  // saída: um círculo transparente cresce a partir da logo e revela a área de trabalho
  const iris = useMotionValue(-220)
  const irisEdge = useTransform(iris, (r) => r + 220)
  const mask = useMotionTemplate`radial-gradient(circle at 50% 44%, transparent ${iris}px, #000 ${irisEdge}px)`
  const [isPresent, safeToRemove] = usePresence()
  useEffect(() => {
    if (isPresent) return
    if (!animated) { safeToRemove?.(); return }
    // até o canto mais distante do centro da logo (50% / 44%), mais a borda suave
    const w = window.innerWidth, h = window.innerHeight
    const target = Math.hypot(w / 2, Math.max(h * 0.44, h * 0.56)) + 40
    const run = animate(iris, target, { duration: 1.05, ease: [0.5, 0, 0.15, 1] })
    run.then(() => safeToRemove?.())
    return () => run.stop()
  }, [isPresent, animated, iris, safeToRemove])

  useEffect(() => {
    const timer = window.setTimeout(done, Math.max(0, seconds) * 1000)
    const skip = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter" || event.key === " ") done()
    }
    const move = (event: PointerEvent) => {
      if (!animated) return
      mx.set((event.clientX / window.innerWidth) * 2 - 1)
      my.set((event.clientY / window.innerHeight) * 2 - 1)
    }
    window.addEventListener("keydown", skip)
    window.addEventListener("pointermove", move)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("keydown", skip)
      window.removeEventListener("pointermove", move)
    }
  }, [seconds, done, animated, mx, my])

  return (
    <motion.div
      ref={root}
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden text-white"
      style={{
        background: "linear-gradient(160deg,#040914 0%,#071328 52%,#030812 100%)",
        WebkitMaskImage: mask,
        maskImage: mask,
      }}
      onClick={done}
    >
      {/* aurora: duas luzes azuis grandes e lentas, atrás de tudo */}
      <motion.div aria-hidden className="pointer-events-none absolute inset-0" style={{ x: glowX, y: glowY }}>
        <motion.div className="absolute left-1/2 top-[44%] size-[62vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(28,128,255,.30), rgba(10,70,180,.10) 45%, transparent 70%)", filter: "blur(10px)" }}
          initial={animated ? { opacity: 0, scale: 0.7 } : false}
          animate={animated ? { opacity: [0, 1, 0.82, 1], scale: [0.7, 1.06, 1, 1.04] } : { opacity: 0.9, scale: 1 }}
          transition={animated ? { duration: t(2.4) + 4, times: [0, 0.25, 0.6, 1], ease: "easeInOut", repeat: Infinity, repeatType: "mirror" } : { duration: 0 }} />
        <motion.div className="absolute left-[64%] top-[30%] size-[48vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(61,186,249,.14), transparent 68%)", filter: "blur(30px)" }}
          animate={animated ? { x: ["-6vmin", "5vmin", "-6vmin"], y: ["-2vmin", "4vmin", "-2vmin"] } : undefined}
          transition={{ duration: 11, ease: "easeInOut", repeat: Infinity }} />
        <motion.div className="absolute left-[34%] top-[64%] size-[44vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(6,71,216,.20), transparent 68%)", filter: "blur(36px)" }}
          animate={animated ? { x: ["4vmin", "-5vmin", "4vmin"], y: ["2vmin", "-3vmin", "2vmin"] } : undefined}
          transition={{ duration: 13, ease: "easeInOut", repeat: Infinity }} />
      </motion.div>

      {/* grade de pontos (os "dias" do calendário) revelada em onda a partir do centro */}
      <motion.div aria-hidden className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(160,208,255,.55) 1px, transparent 1.5px)",
          backgroundSize: "28px 28px",
          backgroundPosition: "center",
          WebkitMaskImage: "radial-gradient(circle at 50% 44%, transparent calc(var(--wave) - 160px), #000 calc(var(--wave) - 60px), #000 var(--wave), transparent calc(var(--wave) + 40px)), radial-gradient(circle at 50% 44%, rgba(0,0,0,.35), transparent 55%)",
          maskImage: "radial-gradient(circle at 50% 44%, transparent calc(var(--wave) - 160px), #000 calc(var(--wave) - 60px), #000 var(--wave), transparent calc(var(--wave) + 40px)), radial-gradient(circle at 50% 44%, rgba(0,0,0,.35), transparent 55%)",
          ["--wave" as string]: animated ? "0px" : "0px",
          opacity: 0.55,
        }}
        animate={animated ? { ["--wave" as string]: "120vmax" } : undefined}
        transition={{ delay: t(0.1), duration: t(1.9) + 0.6, ease: [0.3, 0, 0.2, 1] }} />

      {/* vinheta e grão: dão profundidade sem chamar atenção */}
      <div aria-hidden className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse 75% 70% at 50% 45%, transparent 55%, rgba(1,4,10,.75) 100%)" }} />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[.07] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />

      {/* pétalas: algumas soltas pela flor quando ela abre, depois poucas caindo devagar */}
      {animated && <SplashPetals origin={mark} burstAt={t(1.2)} />}

      <motion.div className="relative flex -translate-y-3 flex-col items-center px-6 text-center" style={{ perspective: 900 }}
        exit={animated ? { scale: 1.06, opacity: 0, filter: "blur(4px)" } : undefined}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}>
        <div className="relative" ref={mark}>
          {/* onda de luz no momento em que a flor abre */}
          {animated && [0, 1].map((i) => (
            <motion.div key={i} aria-hidden className="pointer-events-none absolute left-1/2 top-[56%] rounded-full border"
              style={{ width: LOGO, height: LOGO, marginLeft: -LOGO / 2, marginTop: -LOGO / 2, borderColor: "rgba(140,205,255,.55)" }}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: [0.4, 2.6 + i * 0.8], opacity: [0, 0.55 - i * 0.2, 0] }}
              transition={{ delay: t(1.22) + i * 0.12, duration: 1.4 + i * 0.3, ease: "easeOut", times: [0, 0.15, 1] }} />
          ))}
          <motion.div aria-hidden className="pointer-events-none absolute inset-[8%] rounded-[30%]"
            style={{ background: "#1D8CFF", filter: "blur(38px)" }}
            initial={animated ? { opacity: 0 } : false}
            animate={animated ? { opacity: [0, 0.55, 0.38] } : { opacity: 0.38 }}
            transition={animated ? { delay: t(0.5), duration: t(1.2), times: [0, 0.6, 1] } : { duration: 0 }} />
          <motion.div style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
            initial={animated ? { y: 10, scale: 0.92 } : false}
            animate={{ y: 0, scale: 1 }}
            transition={animated ? { duration: t(1.4), ease: EASE_OUT } : { duration: 0 }}
            className="relative drop-shadow-[0_22px_48px_rgba(4,40,120,.55)]">
            <AnimatedMark size={LOGO} animated={animated} t={t} />
          </motion.div>
        </div>

        {/* nome: cada letra sobe de dentro de uma máscara, do desfocado para o nítido */}
        <h1 className="mt-8 flex text-[44px] font-semibold leading-none tracking-[-.045em] text-[#F5F9FF]"
          style={{ fontFamily: "'Outfit Variable', 'Inter Variable', sans-serif" }} aria-label="Widgy">
          {WORD.map((ch, i) => (
            <span key={i} aria-hidden className="inline-block overflow-hidden pb-[.12em] pt-[.04em]">
              <motion.span className="inline-block"
                initial={animated ? { y: "105%", opacity: 0, filter: "blur(6px)" } : false}
                animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
                transition={animated ? { delay: t(1.3 + i * 0.055), duration: t(0.7), ease: EASE_OUT } : { duration: 0 }}>
                {ch}
              </motion.span>
            </span>
          ))}
        </h1>
        <motion.p
          initial={animated ? { opacity: 0, y: 6, letterSpacing: ".18em" } : false}
          animate={{ opacity: 1, y: 0, letterSpacing: ".06em" }}
          transition={animated ? { delay: t(1.65), duration: t(0.9), ease: EASE_OUT } : { duration: 0 }}
          className="mt-2 text-[13px] font-medium text-[#94AECD]"
        >Seu espaço, do seu jeito.</motion.p>

        {/* carregamento: linha fina com um ponto de luz na ponta, no ritmo do tempo configurado */}
        <motion.div
          className="relative mt-10 h-px w-40 bg-white/[.09]"
          initial={animated ? { opacity: 0, scaleX: 0.6 } : false}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={animated ? { delay: t(1.7), duration: t(0.5), ease: EASE_OUT } : { duration: 0 }}
          role="progressbar"
          aria-label="Carregando Widgy"
        >
          <motion.div
            className="absolute inset-y-0 left-0 w-full origin-left"
            style={{ background: "linear-gradient(90deg, rgba(22,141,247,0), #3DA5FF 60%, #CDEBFF)" }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: animated ? Math.max(0.3, seconds - 0.2) : 0, ease: [0.4, 0, 0.6, 1] }}
          />
          <motion.span
            className="absolute top-1/2 size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#E6F5FF]"
            style={{ boxShadow: "0 0 10px 2px rgba(80,170,255,.8)" }}
            initial={{ left: "0%", opacity: 0 }}
            animate={{ left: "100%", opacity: animated ? 1 : 0 }}
            transition={{ duration: animated ? Math.max(0.3, seconds - 0.2) : 0, ease: [0.4, 0, 0.6, 1], opacity: { delay: t(1.7), duration: 0.3 } }}
          />
        </motion.div>
      </motion.div>

      <motion.button
        type="button"
        onClick={(event) => { event.stopPropagation(); done() }}
        initial={animated ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ delay: animated ? 0.6 : 0, duration: 0.4 }}
        className="group absolute bottom-7 right-8 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#7F98B8] transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#55B8FF]"
      >
        Pular abertura
        <kbd className="rounded border border-white/10 px-1.5 py-px font-sans text-[10px] text-[#6A84A6] transition-colors group-hover:text-white/80">Esc</kbd>
      </motion.button>
    </motion.div>
  )
}