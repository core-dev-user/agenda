import { useEffect, useMemo, useState } from "react"
import { Check, RefreshCw, Shuffle, Undo2, WandSparkles } from "lucide-react"
import { useStore, lookOf } from "@/lib/store"
import { bridge, mediaUrl } from "@/lib/bridge"
import { analyze, buildPlan, FRESH_DEFAULT, MOOD_LABEL, type Analysis, type Plan } from "@/lib/autostyle"
import type { WidgetType } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Modal, Segmented, Switch, ThemedButton } from "./ui/controls"
import { LOCK_DEFAULT } from "./LockClock"
import { WIDGET_META } from "@/widgets/WidgetFrame"

const CHOICES: WidgetType[] = ["clock", "weather", "music", "tasks", "sysmon", "calendar", "agenda", "musicstats", "gaming", "note", "finance", "photo"]

/** Personalizar tudo a partir do papel de parede (cores, fontes, cursor, efeitos, relógio e widgets). */
export function AutoStyle({ open, onClose }: { open: boolean; onClose: () => void }) {
  const wp = useStore((s) => s.settings.wallpaper)
  const current = useStore((s) => s.widgets)
  const tbar = useStore((s) => s.settings.taskbar)
  const image = wp.type === "image" ? wp.image : null
  const [an, setAn] = useState<Analysis | null>(null)
  const [anFor, setAnFor] = useState<string | null>(null)
  const [prog, setProg] = useState<{ pct: number; msg: string } | null>(null)
  const [err, setErr] = useState("")
  const [mode, setMode] = useState<"keep" | "fresh">(current.length >= 3 ? "keep" : "fresh")
  const [pick, setPick] = useState<WidgetType[]>(FRESH_DEFAULT)
  const [useLock, setUseLock] = useState(true)
  const [useClip, setUseClip] = useState(true)
  const [seed, setSeed] = useState(0)
  const [applied, setApplied] = useState(false)

  const view = { w: innerWidth, h: innerHeight }
  const run = async () => {
    if (!image) return
    setErr(""); setApplied(false)
    setProg({ pct: 0, msg: "Começando…" })
    try {
      const a = await analyze(mediaUrl(image), view, { subject: true, clip: useClip }, (pct, msg) => setProg({ pct, msg }))
      setAn(a); setAnFor(image); setSeed(0)
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    }
    setProg(null)
  }
  // abre já analisando a foto atual
  useEffect(() => { if (open && image && anFor !== image && !prog) run() }, [open, image])

  const plan: Plan | null = useMemo(
    () => (an ? buildPlan(an, { mode, current, pick, seed, lockClock: useLock, taskbar: { position: tbar.position, size: tbar.size } }) : null),
    [an, mode, pick, seed, useLock, current.length, tbar.position, tbar.size],
  )

  const apply = async () => {
    if (!plan || !an || !image) return
    const st = useStore.getState()
    const undo = { name: "Personalização automática", settings: lookOf(st.settings), widgets: JSON.parse(JSON.stringify(st.widgets)) }
    let fg = st.settings.wallpaper.fg, fgFor = st.settings.wallpaper.fgFor
    if (plan.lock?.on && an.cutout && !(fg && fgFor === image)) {
      try { fg = await bridge.media.saveDataUrl(an.cutout, "assunto"); fgFor = image } catch {}
    }
    const widgets = mode === "keep" ? st.widgets.map((w) => plan.widgets.find((p) => p.id === w.id) ?? w) : plan.widgets
    useStore.setState({
      templateUndo: undo,
      settings: {
        ...st.settings,
        ...plan.settings,
        wallpaper: { ...st.settings.wallpaper, ...plan.wallpaper, fg, fgFor },
        lockClock: plan.lock ? { ...LOCK_DEFAULT, ...(st.settings.lockClock ?? {}), ...plan.lock } : st.settings.lockClock,
        layoutRef: innerWidth >= innerHeight ? { w: innerWidth, h: innerHeight } : st.settings.layoutRef,
      },
      widgets,
    })
    setApplied(true)
  }
  const undo = () => { useStore.getState().undoTemplate(); setApplied(false) }

  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2"><WandSparkles size={18} className="text-brand" /> Personalizar pela foto</span>} width={760}>
      {!image ? (
        <div className="py-8 text-center text-sm text-fg-muted">Escolha uma imagem como papel de parede primeiro.</div>
      ) : (
        <div className="space-y-4">
          {/* prévia: a foto do jeito que fica na tela, com o layout proposto por cima */}
          <div className="relative overflow-hidden rounded-xl border border-line" style={{ aspectRatio: `${view.w} / ${view.h}` }}>
            <div className="absolute inset-0" style={{ backgroundImage: `url("${mediaUrl(image)}")`, backgroundSize: "cover", backgroundPosition: "center", filter: plan?.wallpaper.dim ? `brightness(${1 - plan.wallpaper.dim})` : undefined }} />
            {plan?.lockRect && (
              <div className="absolute flex items-center justify-center rounded-lg border border-dashed font-semibold" style={{ left: pct(plan.lockRect.x, view.w), top: pct(plan.lockRect.y, view.h), width: pct(plan.lockRect.w, view.w), height: pct(plan.lockRect.h, view.h), borderColor: plan.accent, color: "#fff", fontSize: "2.2vw", textShadow: "0 2px 10px #0008" }}>
                {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
            {plan?.widgets.map((w) => {
              const M = WIDGET_META[w.type]
              const l = w.config.look ?? {}
              return (
                <div
                  key={w.id}
                  className="absolute flex items-center justify-center gap-1 overflow-hidden text-[10px] font-medium transition-all duration-500"
                  style={{
                    left: pct(w.x, view.w), top: pct(w.y, view.h), width: pct(w.w, view.w), height: pct(w.h, view.h),
                    borderRadius: (l.radius ?? 22) * 0.35,
                    background: l.surface === "none" ? "transparent" : l.bgColor ? l.bgColor + (l.surface === "solid" ? "ee" : "80") : "rgb(255 255 255 / .18)",
                    border: l.surface === "none" ? `1px dashed ${l.text ?? "#fff"}88` : `1px solid ${l.borderColor ?? "#ffffff44"}`,
                    color: l.text ?? "#fff",
                    backdropFilter: l.surface === "none" ? undefined : "blur(6px)",
                    boxShadow: l.shadow === "glow" ? `0 0 12px ${plan.accent}` : undefined,
                  }}
                >
                  <M.icon size={12} /> <span className="truncate">{M.label.split(" (")[0]}</span>
                </div>
              )
            })}
            {prog && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 p-6 text-center text-sm text-white backdrop-blur-sm">
                <WandSparkles size={22} className="animate-pulse" />
                <div>{prog.msg}</div>
                <div className="h-1.5 w-64 overflow-hidden rounded-full bg-white/20"><div className="h-full bg-white transition-all" style={{ width: prog.pct + "%" }} /></div>
              </div>
            )}
          </div>

          {err && <div className="text-sm text-[#ff8f8f]">Não deu certo: {err}</div>}

          {an && plan && (
            <div className="grid gap-4 md:grid-cols-[1fr_1.1fr]">
              <div className="space-y-3">
                <div>
                  <div className="mb-1.5 text-xs font-semibold tracking-wide text-fg-muted uppercase">Paleta da foto</div>
                  <div className="flex h-7 overflow-hidden rounded-lg">
                    {an.palette.map((s) => <div key={s.hex} style={{ background: s.hex, flex: Math.max(0.15, s.weight) }} title={s.hex} />)}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <span className="h-5 w-5 rounded-full" style={{ background: plan.accent, boxShadow: `0 0 12px ${plan.accent}` }} /> destaque {plan.accent}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-semibold tracking-wide text-fg-muted uppercase">Estilo</div>
                  <div className="flex flex-wrap gap-1.5">
                    {an.moods.slice(0, 4).map((m, i) => (
                      <span key={m.id} className={cn("rounded-full border px-2.5 py-0.5 text-xs", m.id === plan.mood ? "border-brand bg-brand/20" : "border-line text-fg-muted")}>
                        {MOOD_LABEL[m.id]}{an.usedClip && i < 3 ? ` ${Math.round(m.score * 100)}%` : ""}
                      </span>
                    ))}
                  </div>
                </div>
                <ul className="space-y-1 text-xs text-fg-muted">
                  {plan.notes.map((n) => <li key={n} className="flex gap-1.5"><Check size={12} className="mt-0.5 shrink-0 text-brand" />{n}</li>)}
                </ul>
              </div>

              <div className="space-y-2">
                <Segmented value={mode} onChange={(v) => { setMode(v); setApplied(false) }} options={[{ value: "keep", label: `Reorganizar os meus (${current.length})` }, { value: "fresh", label: "Montar um conjunto novo" }]} />
                {mode === "fresh" && (
                  <div className="flex flex-wrap gap-1.5">
                    {CHOICES.map((t) => {
                      const on = pick.includes(t)
                      const M = WIDGET_META[t]
                      return (
                        <button key={t} onClick={() => { setPick(on ? pick.filter((x) => x !== t) : [...pick, t]); setApplied(false) }} className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", on ? "border-brand bg-brand/20" : "border-line text-fg-muted hover:text-fg")}>
                          <M.icon size={12} /> {M.label.split(" (")[0]}
                        </button>
                      )
                    })}
                  </div>
                )}
                <Switch label="Relógio grande atrás do assunto (estilo iPhone)" checked={useLock} onChange={(v) => { setUseLock(v); setApplied(false) }} />
                {useLock && !an.subject.found && <div className="text-[11px] text-fg-muted">Não achei um assunto destacado nesta foto, então o relógio fica como widget.</div>}
                <Switch label="Reconhecer o estilo com IA (CLIP, roda no PC)" checked={useClip} onChange={setUseClip} />
                {!an.usedClip && useClip && <div className="text-[11px] text-fg-muted">Clique em "Analisar de novo" para usar o reconhecimento de estilo (baixa ~90 MB na primeira vez).</div>}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <div className="flex gap-2">
              <button className="btn text-sm" disabled={!!prog} onClick={run}><RefreshCw size={14} /> Analisar de novo</button>
              <button className="btn text-sm" disabled={!plan || !!prog} onClick={() => { setSeed((s) => s + 1); setApplied(false) }}><Shuffle size={14} /> Outra opção</button>
            </div>
            <div className="flex gap-2">
              {applied && <button className="btn text-sm" onClick={undo}><Undo2 size={14} /> Desfazer</button>}
              <ThemedButton disabled={!plan || !!prog} onClick={apply}>{applied ? <><Check size={15} /> Aplicado</> : <><WandSparkles size={15} /> Aplicar</>}</ThemedButton>
            </div>
          </div>
          <div className="text-[11px] text-fg-muted">Muda tema, cores, fontes, cursor, efeitos, o relógio da tela e os widgets (posição e aparência). Seus dados não mudam. Dá para desfazer aqui ou em Templates.</div>
        </div>
      )}
    </Modal>
  )
}

const pct = (v: number, t: number) => `${(v / t) * 100}%`
