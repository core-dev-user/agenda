/**
 * Tudo que roda em segundo plano enquanto o Agenda está aberto (mesmo minimizado na bandeja):
 * avisos de tarefas, WhatsApp, iFood, jogos dos favoritos, orçamento, serviços e agenda do Google;
 * atualização das agendas; modo foco; hibernação dos apps parados.
 */
import { useEffect, useRef } from "react"
import { useStore } from "./store"
import { bridge, type SportMatch } from "./bridge"
import { notify, focusActive, focusPrefs, notifyPrefs } from "./notify"
import { eventsFrom, feedUrl } from "./ical"
import { useFinance } from "./financeStore"
import { summary, ym } from "./finance"
import { todayISO } from "./utils"
import type { CalEvent } from "./types"
import { startListening } from "./listening"
import { startGaming } from "./gaming"

const once = (key: string) => {
  try {
    if (localStorage.getItem("seen:" + key)) return false
    localStorage.setItem("seen:" + key, "1")
  } catch {}
  return true
}

export function useBackground() {
  /* ---------- histórico de escuta do YouTube Music ---------- */
  useEffect(() => { startListening(); startGaming() }, [])

  /* ---------- tarefas com horário ---------- */
  useEffect(() => {
    const check = () => {
      const now = new Date()
      const today = todayISO(now)
      const hm = now.toTimeString().slice(0, 5)
      const due = useStore.getState().tasks.filter((t) => !t.done && !t.notified && t.time && t.date === today && t.time <= hm)
      if (!due.length) return
      for (const t of due) notify({ source: "tasks", title: "Tarefa", body: `${t.time} — ${t.title}`, icon: "✅" })
      const ids = new Set(due.map((t) => t.id))
      useStore.getState().set("tasks", (ts) => ts.map((t) => (ids.has(t.id) ? { ...t, notified: true } : t)))
    }
    check()
    const id = setInterval(check, 20000)
    return () => clearInterval(id)
  }, [])

  /* ---------- WhatsApp: mensagens novas (só se o WhatsApp já estiver aberto/logado no Agenda) ---------- */
  const wa = useRef<Map<string, number> | null>(null)
  useEffect(() => {
    const tick = async () => {
      if (!notifyPrefs().on.whatsapp) return
      const st = await bridge.webapp.status().catch(() => null)
      if (!st?.whatsapp?.alive) return
      const r = await bridge.webapp.whatsapp().catch(() => null)
      if (!r?.loggedIn) return
      const prev = wa.current
      const next = new Map(r.chats.map((c) => [c.name, c.unread]))
      if (prev) for (const c of r.chats) if (c.unread > (prev.get(c.name) ?? 0)) notify({ source: "whatsapp", title: c.name, body: c.last, open: "whatsapp", icon: "💬" })
      wa.current = next
    }
    const id = setInterval(tick, 30000)
    setTimeout(tick, 8000)
    return () => clearInterval(id)
  }, [])

  /* ---------- iFood: mudança de status do pedido ---------- */
  const ifood = useRef<string | null>(null)
  useEffect(() => {
    const tick = async () => {
      if (!notifyPrefs().on.ifood) return
      const st = await bridge.webapp.status().catch(() => null)
      if (!st?.ifood?.alive) return
      const r = await bridge.webapp.ifoodOrders().catch(() => null)
      const a = r?.orders?.find((o) => !/entregue|conclu|cancelad/i.test(o.status))
      const key = a ? `${a.name}|${a.status}` : ""
      if (ifood.current != null && key && key !== ifood.current) notify({ source: "ifood", title: `iFood · ${a!.name}`, body: a!.status.replace(/^./, (c) => c.toUpperCase()), open: "ifood", icon: "🍔" })
      else if (ifood.current && !key) {
        const name = ifood.current.split("|")[0]
        if (r?.orders?.some((o) => o.name === name && /entregue|conclu/i.test(o.status))) notify({ source: "ifood", title: `iFood · ${name}`, body: "Pedido entregue. Bom apetite! 😋", icon: "🍔" })
      }
      // só "esquece" o pedido quando a página de pedidos confirma que não há nenhum em andamento
      if (r && !r.loading && (key || r.onOrders || ifood.current == null)) ifood.current = key
    }
    const id = setInterval(tick, 45000)
    return () => clearInterval(id)
  }, [])

  /* ---------- jogos dos times favoritos ---------- */
  const games = useRef<Map<string, SportMatch> | null>(null)
  useEffect(() => {
    const tick = async () => {
      const s = useStore.getState()
      const favs = (s.settings.favTeams ?? []).map((f) => f.trim().toLowerCase()).filter(Boolean)
      if (!favs.length || !notifyPrefs().on.sports) return
      const leagues = new Set<string>(["bra.1", "conmebol.libertadores", "uefa.champions", "uefa.europa", "eng.1", "esp.1", "eng.3", "bra.copa_do_brazil"])
      for (const w of s.widgets) if (w.type === "football") for (const l of w.config.leagues ?? []) leagues.add(l)
      const lists = await Promise.all([
        bridge.sports.get("football", { leagues: [...leagues] }).catch(() => []),
        bridge.sports.get("cs2").catch(() => []),
        bridge.sports.get("valorant").catch(() => []),
      ])
      const fav = (m: SportMatch) => favs.some((f) => [m.a.name, m.a.short, m.b.name, m.b.short].some((n) => (n || "").toLowerCase().includes(f)))
      const now = new Map<string, SportMatch>()
      for (const m of lists.flat()) if (fav(m)) now.set(m.id, m)
      const prev = games.current
      if (prev) {
        for (const [id, m] of now) {
          const p = prev.get(id)
          const vs = `${m.a.short || m.a.name} ${m.a.score ?? ""} x ${m.b.score ?? ""} ${m.b.short || m.b.name}`.replace(/\s+/g, " ")
          if (m.state === "live" && p?.state !== "live") notify({ source: "sports", title: "Começou!", body: `${m.a.name} x ${m.b.name} · ${m.event}`, icon: "🔴" })
          else if (m.state === "live" && p && (p.a.score !== m.a.score || p.b.score !== m.b.score)) notify({ source: "sports", title: "Placar mudou", body: vs, icon: "⚽" })
          else if (m.state === "done" && p && p.state === "live") notify({ source: "sports", title: "Fim de jogo", body: vs, icon: "🏁" })
        }
      }
      games.current = now
    }
    const id = setInterval(tick, 90000)
    setTimeout(tick, 15000)
    return () => clearInterval(id)
  }, [])

  /* ---------- orçamento (quando a aba Finanças estiver desbloqueada) ---------- */
  useEffect(() => {
    return useFinance.subscribe((st, prev) => {
      if (st.status !== "open" || st.data === prev.data) return
      const m = ym(new Date())
      const sum = summary(st.data, m)
      for (const c of st.data.categories) {
        if (!c.budget) continue
        const spent = sum.byCat.get(c.id) ?? 0
        const p = spent / c.budget
        if (p >= 1 && once(`budget|${m}|${c.id}|100`)) notify({ source: "budgets", title: `${c.emoji} ${c.name}: passou do orçamento`, body: `Gastou ${Math.round(p * 100)}% do limite deste mês.`, open: "finance", icon: "💸" })
        else if (p >= 0.8 && p < 1 && once(`budget|${m}|${c.id}|80`)) notify({ source: "budgets", title: `${c.emoji} ${c.name}: perto do limite`, body: `Já foram ${Math.round(p * 100)}% do orçamento do mês.`, open: "finance", icon: "💸" })
      }
    })
  }, [])

  /* ---------- serviços a receber (uma vez por dia) ---------- */
  useEffect(() => {
    const check = () => {
      const today = todayISO()
      const open = useStore.getState().services.filter((s) => s.dueDate && s.dueDate <= today && s.paid < s.value)
      if (!open.length || !once(`services|${today}`)) return
      const late = open.filter((s) => s.dueDate < today).length
      notify({ source: "services", title: "Serviços a receber", body: `${open.length} pagamento${open.length > 1 ? "s" : ""} para hoje${late ? ` (${late} atrasado${late > 1 ? "s" : ""})` : ""}.`, open: "services", icon: "💼" })
    }
    const t = setTimeout(check, 20000)
    const id = setInterval(check, 30 * 60000)
    return () => { clearTimeout(t); clearInterval(id) }
  }, [])

  /* ---------- agendas do Google: baixa a cada 15 min, avisa 10 min antes ---------- */
  const feeds = useStore((s) => s.settings.calendars)
  useEffect(() => {
    let alive = true
    const load = async () => {
      const list = (useStore.getState().settings.calendars ?? []).filter((f) => f.on && f.url)
      const from = Date.now() - 40 * 86400000, to = Date.now() + 120 * 86400000
      const all: CalEvent[] = []
      for (const f of list) {
        try { all.push(...eventsFrom(await bridge.net.text(feedUrl(f.url)), f, from, to)) } catch {}
      }
      if (alive) useStore.setState({ calEvents: all.sort((a, b) => a.start - b.start) })
    }
    load()
    const id = setInterval(load, 15 * 60000)
    return () => { alive = false; clearInterval(id) }
  }, [JSON.stringify(feeds ?? [])])
  useEffect(() => {
    const check = () => {
      const now = Date.now()
      for (const e of useStore.getState().calEvents) {
        if (e.allDay || e.start < now || e.start - now > 10 * 60000) continue
        if (once(`cal|${e.id}`)) notify({ source: "calendar", title: e.title, body: `Às ${new Date(e.start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}${e.location ? ` · ${e.location}` : ""}`, open: "today", icon: "🗓️" })
      }
    }
    const id = setInterval(check, 30000)
    return () => clearInterval(id)
  }, [])

  /* ---------- hibernação dos apps ---------- */
  const hib = useStore((s) => s.settings.hibernateMin)
  useEffect(() => { bridge.webapp.hibernate(hib ?? 15) }, [hib])

  /* ---------- modo foco ---------- */
  const running = useStore((s) => !!s.studyTimer?.startedAt)
  const manual = useStore((s) => s.focusManual)
  const auto = useStore((s) => s.settings.focus?.auto ?? true)
  const active = manual || (auto && running)
  const was = useRef(false)
  useEffect(() => {
    if (active === was.current) return
    was.current = active
    const p = focusPrefs()
    if (p.muteApps) { bridge.webapp.mute("whatsapp", active); bridge.webapp.mute("discord", active) }
    if (active) {
      if (p.playlist.trim()) { bridge.music.open(); setTimeout(() => bridge.music.cmd("url", p.playlist.trim()), 1500) }
      notify({ source: "focus", title: "Modo foco ligado", body: p.silence ? "Avisos silenciados até você terminar." : undefined, icon: "🎯" })
    } else notify({ source: "focus", title: "Modo foco desligado", icon: "🎯" })
  }, [active])
}

export { focusActive }
