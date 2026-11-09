import { useEffect, useRef } from "react"
import { useStore } from "@/lib/store"
import type { PetColor, PetPrefs } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Card, Slider, Switch } from "@/components/ui/controls"
import { frame, GH, GW, SPECIES, type Pose, type Species } from "./sprites"
import { callPet, PET_DEFAULT } from "./Pet"

/** bichinho parado (sentado/deitado, piscando e balançando o rabo) para escolher a pelagem */
function Preview({ coat, species, scale = 3 }: { coat: string; species: Species; scale?: number }) {
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
      ctx.drawImage(frame(p, coat, species), 0, 0, cv.width, cv.height)
    }, 120)
    return () => clearInterval(id)
  }, [coat, species])
  return <canvas ref={ref} width={GW * scale} height={GH * scale} style={{ imageRendering: "pixelated", width: GW * scale, height: GH * scale }} />
}

export function PetTab() {
  const pet = { ...PET_DEFAULT, ...useStore((x) => x.settings.pet) }
  const setS = useStore((x) => x.setSettings)
  const set = (p: Partial<PetPrefs>) => setS((s) => ({ pet: { ...PET_DEFAULT, ...s.pet, ...p } }))
  const species: Species = pet.species === "goat" ? "goat" : "cat"
  const coats = SPECIES[species].coats
  const coat = coats[pet.color] ? pet.color : Object.keys(coats)[0]
  const who = species === "goat" ? "a cabrinha" : "o gatinho"
  // pelagem escolhida para cada bicho (volta a mesma quando troca de novo)
  const pickSpecies = (sp: Species) => {
    if (sp === species) return
    const mem: Record<string, string> = { ...pet.coatBy, [species]: coat }
    const back = mem[sp] && SPECIES[sp].coats[mem[sp]] ? mem[sp] : Object.keys(SPECIES[sp].coats)[0]
    set({ species: sp, color: back, coatBy: mem })
  }
  return (
    <>
      <Card>
        <div className="font-display mb-1 text-lg font-semibold">Bichinho</div>
        <div className="mb-3 text-sm text-fg-muted">
          Um bichinho em pixel art que mora na sua área de trabalho: anda pela barra de tarefas, pula em cima dos widgets, senta, tira sonecas
          {species === "goat" ? " e bale de vez em quando." : " e se lambe."} Clique nele para mudar o que está fazendo (anda → {species === "goat" ? "deita" : "senta"} → dorme), ou segure e arraste para pegar no colo e soltar em outro lugar.
        </div>
        <div className="mb-2 grid grid-cols-2 gap-2">
          {(Object.keys(SPECIES) as Species[]).map((sp) => (
            <button key={sp} onClick={() => pickSpecies(sp)} className={cn("flex items-center gap-3 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors", species === sp ? "border-brand bg-brand/15" : "border-line hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]")}>
              <Preview coat={sp === species ? coat : Object.keys(SPECIES[sp].coats)[0]} species={sp} scale={2} />
              {SPECIES[sp].label}
            </button>
          ))}
        </div>
        <Switch label={`${SPECIES[species].label} na tela`} checked={pet.on} onChange={(v) => set({ on: v })} />
        <label className="mt-2 block text-sm">Nome
          <input className="field mt-1 w-full" defaultValue={pet.name ?? ""} placeholder={species === "goat" ? "Ex.: Chiquinha" : "Ex.: Mingau"} onBlur={(e) => set({ name: e.target.value.trim() || undefined })} />
        </label>
        <div className="pt-1">
          <button className="btn !py-1 text-xs" disabled={!pet.on} onClick={callPet}>Chamar para o meio da tela</button>
        </div>
      </Card>

      <Card>
        <div className="font-display mb-3 text-lg font-semibold">Pelagem</div>
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(coats).map(([id, c]) => (
            <button
              key={id}
              onClick={() => set({ color: id as PetColor })}
              className={cn("flex flex-col items-center gap-1 rounded-xl border px-1 pt-1 pb-2 text-xs transition-colors", coat === id ? "border-brand bg-brand/15" : "border-line hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]")}
            >
              <Preview coat={id} species={species} />
              {c.label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="font-display mb-3 text-lg font-semibold">Jeito</div>
        <Slider label="Tamanho" value={pet.scale} min={2} max={6} step={1} onChange={(v) => set({ scale: v })} format={(v) => ["", "", "Pequeno", "Normal", "Grande", "Bem grande", "Gigante"][v] ?? String(v)} />
        <Slider label="Energia" value={pet.energy} min={0.3} max={1.6} step={0.1} onChange={(v) => set({ energy: v })} format={(v) => (v < 0.6 ? "Preguiçoso" : v < 0.9 ? "Calmo" : v < 1.25 ? "Normal" : "Elétrico")} />
        <Switch label={`Deixar ${species === "goat" ? "ela" : "ele"} subir e andar em cima dos widgets`} checked={pet.widgets} onChange={(v) => set({ widgets: v })} />
        <div className="pt-1 text-xs text-fg-muted">De madrugada {who} fica com mais sono. As animações param sozinhas quando o Agenda está minimizado ou um jogo está aberto.</div>
      </Card>
    </>
  )
}
