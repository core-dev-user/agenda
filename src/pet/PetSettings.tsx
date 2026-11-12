import { useEffect, useRef, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { useStore } from "@/lib/store"
import type { PetOne, PetPrefs } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Card, Slider, Switch } from "@/components/ui/controls"
import { frame, GH, GW, isSpecies, SPECIES, type Pose, type Species } from "./sprites"
import { callPet, PET_DEFAULT, petList } from "./Pet"

const MAX_PETS = 8

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

const spOf = (one: PetOne): Species => (isSpecies(one.species) ? one.species : "cat")
const coatFor = (sp: Species, color: string) => (SPECIES[sp].coats[color] ? color : Object.keys(SPECIES[sp].coats)[0])

export function PetTab() {
  const raw = useStore((x) => x.settings.pet)
  const pet = { ...PET_DEFAULT, ...raw }
  const list = petList(raw)
  const setS = useStore((x) => x.setSettings)
  const set = (p: Partial<PetPrefs>) => setS((s) => ({ pet: { ...PET_DEFAULT, ...s.pet, ...p } }))
  const setList = (fn: (l: PetOne[]) => PetOne[]) => setS((s) => ({ pet: { ...PET_DEFAULT, ...s.pet, list: fn(petList(s.pet)) } }))
  const [selId, setSelId] = useState(list[0]?.id ?? "")
  const sel = list.find((p) => p.id === selId) ?? list[0]
  const editSel = (p: Partial<PetOne>) => sel && setList((l) => l.map((o) => (o.id === sel.id ? { ...o, ...p } : o)))

  const add = () => {
    if (list.length >= MAX_PETS) return
    const base = sel ?? { species: "cat" as Species, color: "orange" }
    const one: PetOne = { id: "p" + Date.now().toString(36), species: spOf(base as PetOne), color: base.color }
    setList((l) => [...l, one])
    setSelId(one.id)
    if (!pet.on) set({ on: true })
  }
  const remove = () => {
    if (!sel || list.length <= 1) return
    const i = list.findIndex((p) => p.id === sel.id)
    setList((l) => l.filter((p) => p.id !== sel.id))
    setSelId(list[i === 0 ? 1 : i - 1].id)
  }
  // pelagem escolhida para cada bicho (volta a mesma quando troca de novo)
  const pickSpecies = (sp: Species) => {
    if (!sel || sp === spOf(sel)) return
    const mem: Record<string, string> = { ...pet.coatBy, [spOf(sel)]: sel.color }
    set({ coatBy: mem })
    editSel({ species: sp, color: coatFor(sp, mem[sp] ?? "") })
  }

  const species = sel ? spOf(sel) : "cat"
  const coats = SPECIES[species].coats
  const coat = sel ? coatFor(species, sel.color) : Object.keys(coats)[0]
  const many = list.length > 1

  return (
    <>
      <Card>
        <div className="font-display mb-1 text-lg font-semibold">Bichinhos</div>
        <div className="mb-3 text-sm text-fg-muted">
          Bichinhos em pixel art que moram na sua área de trabalho: andam pela barra de tarefas, pulam em cima dos widgets, sentam e tiram sonecas.
          Clique em um para mudar o que está fazendo (anda → senta → dorme), ou segure e arraste para pegar no colo. Dá para ter vários ao mesmo tempo — até do mesmo tipo, cada um com seu nome.
        </div>
        <Switch label="Bichinhos na tela" checked={pet.on} onChange={(v) => set({ on: v })} />
        <Switch label="Mostrar o nome em cima de cada um" checked={pet.showNames !== false} onChange={(v) => set({ showNames: v })} />

        <div className="mt-3 flex flex-wrap gap-2">
          {list.map((one) => {
            const sp = spOf(one)
            return (
              <button key={one.id} onClick={() => setSelId(one.id)} className={cn("flex items-center gap-2 rounded-xl border py-1 pr-3 pl-1 text-sm transition-colors", sel?.id === one.id ? "border-brand bg-brand/15" : "border-line hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]")}>
                <Preview coat={coatFor(sp, one.color)} species={sp} scale={1.5} />
                <span className="max-w-28 truncate font-medium">{one.name?.trim() || SPECIES[sp].label}</span>
              </button>
            )
          })}
          <button onClick={add} disabled={list.length >= MAX_PETS} className="flex items-center gap-1.5 rounded-xl border border-dashed border-line px-3 text-sm text-fg-muted transition-colors hover:border-brand hover:text-fg disabled:opacity-40">
            <Plus size={15} /> Adicionar
          </button>
        </div>

        <div className="pt-3">
          <button className="btn !py-1 text-xs" disabled={!pet.on} onClick={callPet}>Chamar {many ? "todos" : ""} para o meio da tela</button>
        </div>
      </Card>

      {sel && (
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="font-display text-lg font-semibold">{sel.name?.trim() || SPECIES[species].label}</div>
            {many && <button className="btn btn-ghost !py-1 text-xs" onClick={remove}><Trash2 size={14} /> Tirar este</button>}
          </div>
          <label className="block text-sm">Nome (aparece em cima dele)
            <input className="field mt-1 w-full" value={sel.name ?? ""} maxLength={20} placeholder={{ cat: "Ex.: Mingau", goat: "Ex.: Chiquinha", dog: "Ex.: Caramelo", frog: "Ex.: Kermit", dragon: "Ex.: Banguela" }[species]} onChange={(e) => editSel({ name: e.target.value || undefined })} />
          </label>
          <div className="mt-3 mb-1 text-sm">Bicho</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(Object.keys(SPECIES) as Species[]).map((sp) => (
              <button key={sp} onClick={() => pickSpecies(sp)} className={cn("flex items-center gap-3 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors", species === sp ? "border-brand bg-brand/15" : "border-line hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]")}>
                <Preview coat={sp === species ? coat : coatFor(sp, pet.coatBy?.[sp] ?? "")} species={sp} scale={2} />
                {SPECIES[sp].label}
              </button>
            ))}
          </div>
          <div className="mt-3 mb-1 text-sm">Pelagem</div>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(coats).map(([id, c]) => (
              <button
                key={id}
                onClick={() => editSel({ color: id })}
                className={cn("flex flex-col items-center gap-1 rounded-xl border px-1 pt-1 pb-2 text-xs transition-colors", coat === id ? "border-brand bg-brand/15" : "border-line hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]")}
              >
                <Preview coat={id} species={species} />
                {c.label}
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="font-display mb-3 text-lg font-semibold">Jeito {many ? "(vale para todos)" : ""}</div>
        <Slider label="Tamanho" value={pet.scale} min={2} max={6} step={1} onChange={(v) => set({ scale: v })} format={(v) => ["", "", "Pequeno", "Normal", "Grande", "Bem grande", "Gigante"][v] ?? String(v)} />
        <Slider label="Energia" value={pet.energy} min={0.3} max={1.6} step={0.1} onChange={(v) => set({ energy: v })} format={(v) => (v < 0.6 ? "Preguiçoso" : v < 0.9 ? "Calmo" : v < 1.25 ? "Normal" : "Elétrico")} />
        <Switch label="Deixar subir e andar em cima dos widgets" checked={pet.widgets} onChange={(v) => set({ widgets: v })} />
        <Switch label="Continuar andando com o Widgy em segundo plano (mesmo jogando)" checked={pet.background !== false} onChange={(v) => set({ background: v })} />
        <div className="pt-1 text-xs text-fg-muted">De madrugada eles ficam com mais sono. Com um jogo aberto continuam andando, só que mais leves (30 quadros por segundo) para não pesar no jogo. Param só quando o Widgy está minimizado ou coberto por outras janelas.</div>
      </Card>
    </>
  )
}
