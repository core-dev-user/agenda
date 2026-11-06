import type { GameMatch } from "@/lib/bridge"
import { cn } from "@/lib/utils"

/** nomes amigáveis do CS2 */
export const csMap = (m?: string) => (m ? m.replace(/^(de|cs|ar|dz)_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "")
export const csMode = (m?: string) => ({ competitive: "Competitivo", premier: "Premier", casual: "Casual", deathmatch: "Mata-mata", scrimcomp2v2: "Duplas", wingman: "Duplas", gungameprogressive: "Corrida armamentista", custom: "Personalizado", survival: "Zona de perigo" } as Record<string, string>)[m ?? ""] ?? m ?? ""
const CT = "#5d9cec", T = "#e0a64b"
export const RESULT = { win: { t: "Vitória", c: "#5ee3a1" }, loss: { t: "Derrota", c: "#ff6b8b" }, draw: { t: "Empate", c: "#ffd36e" } } as Record<string, { t: string; c: string }>

function Stat({ label, value, big }: { label: string; value: React.ReactNode; big?: boolean }) {
  return (
    <div className="flex-1 rounded-lg px-2 py-1 text-center" style={{ background: "color-mix(in srgb, var(--fg) 7%, transparent)" }}>
      <div className={cn("font-num font-semibold", big ? "text-xl" : "text-sm")}>{value}</div>
      <div className="text-[9px] tracking-wide text-fg-muted uppercase">{label}</div>
    </div>
  )
}

export function CS2Live({ d }: { d: any }) {
  if (!d || (!d.connected && !d.needsRestart)) return <Hint>Conectando ao CS2… (abra uma partida)</Hint>
  if (d.needsRestart) return <Hint>Feche e abra o CS2 <b>uma vez</b> para o Agenda ler o placar e o KDA (o jogo só carrega a integração ao abrir).</Hint>
  if (d.menu) return <Hint>No menu. O placar e o KDA aparecem quando a partida começar.</Hint>
  const mineC = d.team === "CT" ? CT : T, theirC = d.team === "CT" ? T : CT
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{csMap(d.map)}</div>
          <div className="truncate text-[11px] text-fg-muted">{csMode(d.mode)} · round {(d.round ?? 0) + (d.phase === "gameover" ? 0 : 1)}{d.phase === "warmup" ? " · aquecimento" : ""}</div>
        </div>
        {d.mine != null ? (
          <div className="font-num text-2xl font-bold"><span style={{ color: mineC }}>{d.mine}</span><span className="mx-1 text-fg-muted">:</span><span style={{ color: theirC }}>{d.theirs}</span></div>
        ) : <div className="font-num text-2xl font-bold"><span style={{ color: CT }}>{d.ct}</span><span className="mx-1 text-fg-muted">:</span><span style={{ color: T }}>{d.t}</span></div>}
      </div>
      <div className="flex gap-1.5">
        <Stat big label="Kills" value={d.k} /><Stat big label="Mortes" value={d.d} /><Stat big label="Assist." value={d.a} />
        <Stat big label="MVP" value={d.mvps} />
      </div>
      {d.spectating ? <div className="text-[11px] text-fg-muted">Você morreu · observando</div> : d.hp != null && (
        <div className="flex items-center gap-3 text-xs">
          <span>❤️ <b className="font-num">{d.hp}</b></span><span>🛡️ <b className="font-num">{d.armor}</b></span><span>💲<b className="font-num">{d.money}</b></span>
          {d.weapon && <span className="min-w-0 flex-1 truncate text-right text-fg-muted uppercase">{d.weapon}</span>}
        </div>
      )}
    </div>
  )
}

export function ValorantLive({ d }: { d: any }) {
  if (!d?.connected) return <Hint>Conectando ao Valorant…</Hint>
  const a = d.agent
  const stateTxt = d.state === "PREGAME" ? "Seleção de agentes" : d.state === "INGAME" ? d.mode || "Em partida" : "No menu"
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5">
        {a?.icon ? <img src={a.icon} className="h-12 w-12 rounded-xl object-cover" style={{ background: a.color ? `${a.color}55` : undefined }} draggable={false} /> : <div className="flex h-12 w-12 items-center justify-center rounded-xl text-lg" style={{ background: "color-mix(in srgb, var(--fg) 8%, transparent)" }}>🎯</div>}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{a?.name ? `${a.name}${a.locked === false ? " (escolhendo…)" : ""}` : d.state === "PREGAME" ? "Escolhendo agente…" : stateTxt}</div>
          <div className="truncate text-[11px] text-fg-muted">{[d.state === "INGAME" || d.state === "PREGAME" ? stateTxt : "", d.map].filter(Boolean).join(" · ") || "Valorant"}</div>
        </div>
        {d.state === "INGAME" && d.ally != null && <div className="font-num text-2xl font-bold"><span style={{ color: "#5ee3a1" }}>{d.ally}</span><span className="mx-1 text-fg-muted">:</span><span style={{ color: "#ff6b8b" }}>{d.enemy}</span></div>}
      </div>
      {d.rank?.name && (
        <div className="flex items-center gap-2 text-xs">
          {d.rank.icon && <img src={d.rank.icon} className="h-6 w-6" draggable={false} />}
          <span className="font-semibold capitalize">{String(d.rank.name).toLowerCase()}</span>
          {d.rank.rr != null && <span className="font-num text-fg-muted">{d.rank.rr} RR</span>}
        </div>
      )}
      {d.state === "INGAME" && <div className="text-[10px] text-fg-muted">O Valorant não informa o KDA durante a partida: ele aparece aqui quando ela acabar.</div>}
      {d.last && <LastMatch m={d.last} />}
    </div>
  )
}

export function LolLive({ d }: { d: any }) {
  if (!d?.connected) return <Hint>Os dados aparecem quando a partida começar.</Hint>
  const mm = Math.floor((d.time ?? 0) / 60), ss = String((d.time ?? 0) % 60).padStart(2, "0")
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5">
        {d.icon && <img src={d.icon} className="h-12 w-12 rounded-xl" draggable={false} />}
        <div className="min-w-0 flex-1"><div className="truncate font-semibold">{d.champion}</div><div className="text-[11px] text-fg-muted">nível {d.level} · {mm}:{ss}</div></div>
      </div>
      <div className="flex gap-1.5"><Stat big label="Kills" value={d.k} /><Stat big label="Mortes" value={d.d} /><Stat big label="Assist." value={d.a} /><Stat big label="CS" value={d.cs} /></div>
      <div className="text-xs text-fg-muted">💰 <b className="font-num text-fg">{d.gold}</b> de ouro · visão {Math.round(d.ward ?? 0)}</div>
    </div>
  )
}

export function LastMatch({ m, compact }: { m: GameMatch; compact?: boolean }) {
  const r = RESULT[m.result ?? ""]
  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs" style={{ background: "color-mix(in srgb, var(--fg) 6%, transparent)" }}>
      {m.agentIcon && <img src={m.agentIcon} className="h-6 w-6 rounded-md" draggable={false} />}
      {!compact && <span className="text-[10px] font-semibold tracking-wide text-fg-muted uppercase">Última</span>}
      {r && <span className="font-semibold" style={{ color: r.c }}>{r.t}</span>}
      {m.rounds && <span className="font-num">{m.rounds}</span>}
      <span className="min-w-0 flex-1 truncate text-fg-muted">{[m.map, m.agent].filter(Boolean).join(" · ")}</span>
      {m.k != null && <span className="font-num font-semibold">{m.k}/{m.d}/{m.a}</span>}
      {m.rr != null && <span className="font-num" style={{ color: m.rr >= 0 ? "#5ee3a1" : "#ff6b8b" }}>{m.rr > 0 ? "+" : ""}{m.rr}</span>}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg px-2.5 py-2 text-xs text-fg-muted" style={{ background: "color-mix(in srgb, var(--fg) 6%, transparent)" }}>{children}</div>
}
