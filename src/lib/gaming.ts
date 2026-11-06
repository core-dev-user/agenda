/** Jogo aberto agora (o processo principal detecta) e o agente do Valorant em uso. */
import { useStore } from "./store"
import { bridge, type GamesState } from "./bridge"

let started = false

/** na primeira vez que um jogo é reconhecido, coloca o widget "Jogando agora" na área de trabalho */
function autoWidget(st: GamesState) {
  if (!st.playing.length) return
  try { if (localStorage.getItem("gaming-widget-auto")) return; localStorage.setItem("gaming-widget-auto", "1") } catch { return }
  const s = useStore.getState()
  if (s.widgets.some((w) => w.type === "gaming")) return
  s.addWidget("gaming")
  const w = useStore.getState().widgets.at(-1)!
  s.setWidgetGeo(w.id, { x: innerWidth - 380, y: 60, w: 340, h: 200 })
}

export function startGaming() {
  if (started) return
  started = true
  const apply = (st: GamesState) => { useStore.setState({ gamesRunning: st.playing }); autoWidget(st) }
  bridge.games.onState(apply)
  bridge.games.get().then(apply).catch(() => {})
  bridge.games.onValorantAgent((a) => useStore.setState({ valAgentNow: a }))
  bridge.games.valorantAgent().then((a) => useStore.setState({ valAgentNow: a })).catch(() => {})
  // limpa o histórico antigo de jogos (KDA/sessões), que não é mais usado
  if ((useStore.getState() as any).gaming) useStore.setState({ gaming: undefined } as any)
}
