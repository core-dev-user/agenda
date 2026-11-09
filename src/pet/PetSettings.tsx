import { useEffect, useRef } from "react"
import { useStore } from "@/lib/store"
import type { PetColor, PetPrefs } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Card, Slider, Switch } from "@/components/ui/controls"
import { COATS, frame, GH, GW, type Pose } from "./sprites"
import { callPet, PET_DEFAULT } from "./Pet"

/** gatinho parado (sentado, piscando e balançando o rabo) para escolher a pelagem */
function Preview({ coat, scale = 3 }: { coat: string; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext("2d")!
    let t = 0
    const id = setInterval(() => {
      t += 0.12
      const blink = t % 4 > 3.85
      const p: Pose = { k: "sit", tail: Math.round(Math.sin(t * 1.6) * 4) / 4, eyes: blink ? "blink" : "open" }
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.drawImage(frame(p, coat), 0, 0, cv.width, cv.height)
    }, 120)
    return () => clearInterval(id)
  }, [coat])
  return <canvas ref={ref} width={GW * scale} height={GH * scale} style={{ imageRendering: "pixelated", width: GW * scale, height: GH * scale }} />
}

export function PetTab() {
  const pet = { ...PET_DEFAULT, ...useStore((x) => x.settings.pet) }
  const setS = useStore((x) => x.setSettings)
  const set = (p: Partial<PetPrefs>) => setS((s) => ({ pet: { ...PET_DEFAULT, ...s.pet, ...p } }))
  return (
    <>
      <Card>
        <div className="font-display mb-1 text-lg font-semibold">Gatinho</div>
        <div className="mb-3 text-sm text-fg-muted">
          Um gatinho em pixel art que mora na sua área de trabalho: anda pela barra de tarefas, pula em cima dos widgets, senta, se lambe e tira sonecas.
          Clique nele para mudar o que está fazendo (anda → senta → dorme), ou segure e arraste para pegar no colo e soltar em outro lugar.
        </div>
        <Switch label="Gatinho na tela" checked={pet.on} onChange={(v) => set({ on: v })} />
        <label className="mt-2 block text-sm">Nome
          <input className="field mt-1 w-full" defaultValue={pet.name ?? ""} placeholder="Ex.: Mingau" onBlur={(e) => set({ name: e.target.value.trim() || undefined })} />
        </label>
        <div className="pt-1">
          <button className="btn !py-1 text-xs" disabled={!pet.on} onClick={callPet}>Chamar para o meio da tela</button>
        </div>
      </Card>

      <Card>
        <div className="font-display mb-3 text-lg font-semibold">Pelagem</div>
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(COATS).map(([id, c]) => (
            <button
              key={id}
              onClick={() => set({ color: id as PetColor })}
              className={cn("flex flex-col items-center gap-1 rounded-xl border px-1 pt-1 pb-2 text-xs transition-colors", pet.color === id ? "border-brand bg-brand/15" : "border-line hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]")}
            >
              <Preview coat={id} />
              {c.label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="font-display mb-3 text-lg font-semibold">Jeito</div>
        <Slider label="Tamanho" value={pet.scale} min={2} max={6} step={1} onChange={(v) => set({ scale: v })} format={(v) => ["", "", "Pequeno", "Normal", "Grande", "Bem grande", "Gigante"][v] ?? String(v)} />
        <Slider label="Energia" value={pet.energy} min={0.3} max={1.6} step={0.1} onChange={(v) => set({ energy: v })} format={(v) => (v < 0.6 ? "Preguiçoso" : v < 0.9 ? "Calmo" : v < 1.25 ? "Normal" : "Elétrico")} />
        <Switch label="Subir e andar em cima dos widgets" checked={pet.widgets} onChange={(v) => set({ widgets: v })} />
        <div className="pt-1 text-xs text-fg-muted">De madrugada ele fica com mais sono. As animações param sozinhas quando o Agenda está minimizado ou um jogo está aberto.</div>
      </Card>
    </>
  )
}
