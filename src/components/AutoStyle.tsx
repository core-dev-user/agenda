import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Move, RefreshCw, RotateCcw, Shuffle, Undo2, WandSparkles, X } from "lucide-react"
import { useStore, lookOf } from "@/lib/store"
import { bridge, mediaUrl } from "@/lib/bridge"
import { analyze, buildPlan, FRESH_DEFAULT, MOOD_LABEL, type Analysis, type Plan } from "@/lib/autostyle"
import type { Geo, Widget, WidgetType } from "@/lib/types"
import { cn, uid } from "@/lib/utils"
import { Modal, Segmented, Switch, ThemedButton } from "./ui/controls"
import { LOCK_DEFAULT } from "./LockClock"
import { WIDGET_META } from "@/widgets/WidgetFrame"

/** todos os widgets que existem (atalhos de aba ficam de fora: são um por aba) */
const CHOICES = (Object.keys(WIDGET_META) as WidgetType[]).filter((t) => t !== "shortcut")

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
  // ajustes feitos à mão na prévia (posição/tamanho em pixels da tela), widgets tirados e o relógio grande movido
  const [edits, setEdits] = useState<Record<string, Geo>>({})
  const [removed, setRemoved] = useState<string[]>([])
  const [lockPos, setLockPos] = useState<{ x: number; y: number } | null>(null)
  // o que o planejador respeita (atualiza ao soltar o mouse, para os outros widgets não pularem durante o arrasto)
  const [fixed, setFixed] = useState<Record<string, Geo>>({})
  const [lockFixed, setLockFixed] = useState<{ x: number; y: number } | null>(null)
  const lockRef = useRef(lockPos)
  lockRef.current = lockPos
  const editsRef = useRef(edits)
  editsRef.current = edits
  const resetEdits = () => { setEdits({}); setFixed({}); setRemoved([]); setLockPos(null); setLockFixed(null) }
  const box = useRef<HTMLDivElement>(null)

  const view = { w: innerWidth, h: innerHeight }
  const run = async () => {
    if (!image) return
    setErr(""); setApplied(false)
    setProg({ pct: 0, msg: "Começando…" })
    try {
      const a = await analyze(mediaUrl(image), view, { subject: true, clip: useClip }, (pct, msg) => setProg({ pct, msg }))
      setAn(a); setAnFor(image); setSeed(0); resetEdits()
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    }
    setProg(null)
  }
  // abre já analisando a foto atual
  useEffect(() => { if (open && image && anFor !== image && !prog) run() }, [open, image])

  const plan: Plan | null = useMemo(
    () => (an ? buildPlan(an, { mode, current, pick, seed, lockClock: useLock, taskbar: { position: tbar.position, size: tbar.size }, fixed, exclude: removed, lockAt: lockFixed ?? undefined }) : null),
    [an, mode, pick, seed, useLock, current.length, tbar.position, tbar.size, fixed, removed, lockFixed],
  )

  // plano + ajustes manuais
  const finalWidgets: Widget[] = useMemo(() => {
    if (!plan) return []
    return plan.widgets.filter((w) => !removed.includes(w.id)).map((w) => {
      const g = edits[w.id]
      return g ? { ...w, ...g, config: { ...w.config, look: plan.lookAt(w.type, g) } } : w
    })
  }, [plan, edits, removed])
  const finalRef = useRef(finalWidgets)
  finalRef.current = finalWidgets
  // depois do primeiro ajuste à mão, todos ficam onde estão; só os widgets novos procuram lugar
  const freezeAll = () => {
    const all: Record<string, Geo> = {}
    for (const w of finalRef.current) all[w.id] = { x: w.x, y: w.y, w: w.w, h: w.h }
    setFixed({ ...all, ...editsRef.current })
  }
  const lockRect = plan?.lockRect ? (lockPos ? { ...plan.lockRect, ...lockPos } : plan.lockRect) : undefined
  const finalLock = plan?.lock && lockRect && lockPos
    ? { ...plan.lock, x: Math.round(((lockRect.x + lockRect.w / 2) / view.w) * 100), y: Math.round((lockRect.y / view.h) * 100) }
    : plan?.lock

  /** arrastar (mover) ou puxar o canto (tamanho) direto na prévia */
  const drag = (e: React.PointerEvent, id: string, kind: "move" | "size") => {
    if (e.button !== 0 || !box.current) return
    e.preventDefault()
    e.stopPropagation()
    const scale = view.w / box.current.clientWidth
    const sx = e.clientX, sy = e.clientY
    const isLock = id === "__lock"
    const found = finalWidgets.find((w) => w.id === id)
    const base: Geo = isLock ? { ...lockRect! } : { x: found!.x, y: found!.y, w: found!.w, h: found!.h }
    const snap = (v: number) => Math.round(v / 8) * 8
    const mv = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) * scale, dy = (ev.clientY - sy) * scale
      if (isLock) {
        setLockPos({ x: snap(Math.max(0, Math.min(view.w - base.w, base.x + dx))), y: snap(Math.max(0, Math.min(view.h - base.h, base.y + dy))) })
        return
      }
      const g: Geo = kind === "move"
        ? { ...base, x: snap(Math.max(8, Math.min(view.w - base.w - 8, base.x + dx))), y: snap(Math.max(8, Math.min(view.h - base.h - 8, base.y + dy))) }
        : { ...base, w: snap(Math.max(140, Math.min(view.w - base.x - 8, base.w + dx))), h: snap(Math.max(100, Math.min(view.h - base.y - 8, base.h + dy))) }
      setEdits((m) => ({ ...m, [id]: g }))
    }
    const up = () => {
      removeEventListener("pointermove", mv)
      removeEventListener("pointerup", up)
      if (isLock) setLockFixed(lockRef.current)
      freezeAll()
    }
    addEventListener("pointermove", mv)
    addEventListener("pointerup", up)
    setApplied(false)
  }
  const removeW = (id: string) => {
    const w = plan?.widgets.find((x) => x.id === id)
    freezeAll()
    if (mode === "fresh" && w) setPick((p) => p.filter((t) => t !== w.type))
    else setRemoved((r) => [...r, id])
    setApplied(false)
  }

  const apply = async () => {
    if (!plan || !an || !image) return
    const st = useStore.getState()
    const undo = { name: "Personalização automática", settings: lookOf(st.settings), widgets: JSON.parse(JSON.stringify(st.widgets)) }
    let fg = st.settings.wallpaper.fg, fgFor = st.settings.wallpaper.fgFor
    if (finalLock?.on && an.cutout && !(fg && fgFor === image)) {
      try { fg = await bridge.media.saveDataUrl(an.cutout, "assunto"); fgFor = image } catch {}
    }
    const widgets = mode === "keep"
      ? st.widgets.filter((w) => !removed.includes(w.id)).map((w) => finalWidgets.find((p) => p.id === w.id) ?? w)
      : finalWidgets.map((w) => ({ ...w, id: uid() }))
    useStore.setState({
      templateUndo: undo,
      settings: {
        ...st.settings,
        ...plan.settings,
        wallpaper: { ...st.settings.wallpaper, ...plan.wallpaper, fg, fgFor },
        lockClock: finalLock ? { ...LOCK_DEFAULT, ...(st.settings.lockClock ?? {}), ...finalLock } : st.settings.lockClock,
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
          <div ref={box} className="relative overflow-hidden rounded-xl border border-line select-none" style={{ aspectRatio: `${view.w} / ${view.h}` }}>
            <div className="absolute inset-0" style={{ backgroundImage: `url("${mediaUrl(image)}")`, backgroundSize: "cover", backgroundPosition: "center", filter: plan?.wallpaper.dim ? `brightness(${1 - plan.wallpaper.dim})` : undefined }} />
            {lockRect && (
              <div
                className="absolute flex cursor-grab items-center justify-center rounded-lg border border-dashed font-semibold hover:ring-2 hover:ring-white/70 active:cursor-grabbing"
                style={{ left: pct(lockRect.x, view.w), top: pct(lockRect.y, view.h), width: pct(lockRect.w, view.w), height: pct(lockRect.h, view.h), borderColor: plan!.accent, color: "#fff", fontSize: "2.2vw", textShadow: "0 2px 10px #0008" }}
                onPointerDown={(e) => drag(e, "__lock", "move")}
                title="Arraste para mover o relógio grande"
              >
                {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
            {finalWidgets.map((w) => {
              const M = WIDGET_META[w.type]
              const l = w.config.look ?? {}
              const r = (l.radius ?? 22) * 0.35
              return (
                <div
                  key={w.id}
                  className={cn("group/p absolute flex cursor-grab items-center justify-center gap-1 overflow-hidden text-[10px] font-medium hover:ring-2 hover:ring-white/70 active:cursor-grabbing", !edits[w.id] && "transition-all duration-500")}
                  style={{
                    left: pct(w.x, view.w), top: pct(w.y, view.h), width: pct(w.w, view.w), height: pct(w.h, view.h),
                    borderRadius: r,
                    background: l.surface === "none" ? "transparent" : l.bgColor ? l.bgColor + (l.surface === "solid" ? "ee" : "80") : "rgb(255 255 255 / .18)",
                    border: l.surface === "none" ? `1px dashed ${l.text ?? "#fff"}88` : `1px solid ${l.borderColor ?? "#ffffff44"}`,
                    color: l.text ?? "#fff",
                    backdropFilter: l.surface === "none" ? undefined : "blur(6px)",
                    boxShadow: l.shadow === "glow" ? `0 0 12px ${plan!.accent}` : undefined,
                  }}
                  onPointerDown={(e) => drag(e, w.id, "move")}
                  title="Arraste para mover · puxe o canto para mudar o tamanho"
                >
                  <M.icon size={12} /> <span className="truncate">{M.label.split(" (")[0]}</span>
                  <button
                    className="absolute top-0.5 right-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white group-hover/p:flex hover:bg-red-500"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => removeW(w.id)}
                    title="Tirar este widget"
                  ><X size={10} /></button>
                  <span
                    className="absolute right-0 bottom-0 hidden h-3.5 w-3.5 cursor-nwse-resize group-hover/p:block"
                    style={{ background: "linear-gradient(135deg, transparent 50%, rgb(255 255 255 / .85) 50%)", borderBottomRightRadius: r }}
                    onPointerDown={(e) => drag(e, w.id, "size")}
                    title="Puxe para mudar o tamanho"
                  />
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

          {plan && (
            <div className="-mt-2 flex items-center justify-between gap-3 text-[11px] text-fg-muted">
              <span className="flex items-center gap-1"><Move size={11} /> Arraste os widgets na prévia para mudar o lugar, puxe o canto para o tamanho e use o X para tirar.</span>
              {(Object.keys(edits).length > 0 || removed.length > 0 || !!lockPos) && <button className="flex shrink-0 items-center gap-1 hover:text-fg" onClick={resetEdits}><RotateCcw size={11} /> desfazer ajustes</button>}
            </div>
          )}
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
                <Segmented value={mode} onChange={(v) => { setMode(v); resetEdits(); setApplied(false) }} options={[{ value: "keep", label: `Reorganizar os meus (${current.length})` }, { value: "fresh", label: "Montar um conjunto novo" }]} />
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
              <button className="btn text-sm" disabled={!plan || !!prog} onClick={() => { setSeed((s) => s + 1); resetEdits(); setApplied(false) }}><Shuffle size={14} /> Outra opção</button>
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
