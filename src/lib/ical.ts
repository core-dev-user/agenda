/**
 * Agenda do Google (ou Outlook/Apple) pelo "endereço secreto no formato iCal".
 * Só leitura, sem login: o Agenda baixa o arquivo .ics e mostra os eventos.
 */
import type { CalEvent, CalendarFeed } from "./types"

const unfold = (t: string) => t.replace(/\r?\n[ \t]/g, "")
const unescape = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\")

/** "20261105T143000Z" / "20261105T143000" (hora local) / "20261105" (dia inteiro) */
function parseDate(v: string, params: string): { t: number; allDay: boolean } | null {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/)
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  if (!h || /VALUE=DATE(?!-)/i.test(params)) return { t: new Date(+y, +mo - 1, +d).getTime(), allDay: true }
  if (z) return { t: Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0)), allDay: false }
  // com fuso (TZID): trata como horário local — vale para quem está no mesmo fuso da agenda (o caso comum)
  return { t: new Date(+y, +mo - 1, +d, +h, +mi, +(s || 0)).getTime(), allDay: false }
}

interface Raw { uid: string; title: string; start: number; end: number; allDay: boolean; location?: string; rrule?: string; exdates: number[]; recurrenceId?: number }

export function parseICS(text: string): Raw[] {
  const out: Raw[] = []
  const lines = unfold(text).split(/\r?\n/)
  let cur: Partial<Raw> & { exdates: number[] } | null = null
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = { exdates: [] }; continue }
    if (line === "END:VEVENT") {
      if (cur && cur.start != null) {
        const end = cur.end ?? cur.start + (cur.allDay ? 86400000 : 3600000)
        out.push({ uid: cur.uid ?? String(cur.start), title: cur.title ?? "(sem título)", start: cur.start, end, allDay: !!cur.allDay, location: cur.location, rrule: cur.rrule, exdates: cur.exdates, recurrenceId: cur.recurrenceId })
      }
      cur = null
      continue
    }
    if (!cur) continue
    const i = line.indexOf(":")
    if (i < 0) continue
    const left = line.slice(0, i)
    const val = line.slice(i + 1)
    const [name, ...ps] = left.split(";")
    const params = ps.join(";")
    switch (name.toUpperCase()) {
      case "UID": cur.uid = val; break
      case "SUMMARY": cur.title = unescape(val); break
      case "LOCATION": cur.location = unescape(val); break
      case "DTSTART": { const d = parseDate(val, params); if (d) { cur.start = d.t; cur.allDay = d.allDay } break }
      case "DTEND": { const d = parseDate(val, params); if (d) cur.end = d.t; break }
      case "RRULE": cur.rrule = val; break
      case "EXDATE": for (const v of val.split(",")) { const d = parseDate(v, params); if (d) cur.exdates.push(d.t) } break
      case "RECURRENCE-ID": { const d = parseDate(val, params); if (d) cur.recurrenceId = d.t; break }
    }
  }
  return out
}

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]

/** repete os eventos recorrentes dentro da janela [from, to] (diário, semanal, mensal e anual — os casos comuns) */
function expand(e: Raw, from: number, to: number): number[] {
  if (!e.rrule) return e.start <= to && e.end >= from ? [e.start] : []
  const r = Object.fromEntries(e.rrule.split(";").map((p) => p.split("="))) as Record<string, string>
  const freq = r.FREQ
  const interval = Math.max(1, +(r.INTERVAL || 1))
  const until = r.UNTIL ? parseDate(r.UNTIL, "")?.t ?? Infinity : Infinity
  const count = r.COUNT ? +r.COUNT : Infinity
  const byday = r.BYDAY ? r.BYDAY.split(",").map((d) => DAYS.indexOf(d.slice(-2))).filter((d) => d >= 0) : null
  const dur = e.end - e.start
  const s = new Date(e.start)
  const out: number[] = []
  let n = 0
  const push = (t: number) => {
    if (t < e.start) return true
    if (t > until || n >= count) return false
    n++
    if (t + dur >= from && t <= to && !e.exdates.includes(t)) out.push(t)
    return t <= to
  }
  if (freq === "DAILY") {
    for (let k = 0; k < 3000; k++) { const d = new Date(s); d.setDate(s.getDate() + k * interval); if (!push(d.getTime())) break }
  } else if (freq === "WEEKLY") {
    const days = byday && byday.length ? byday : [s.getDay()]
    const weekStart = new Date(s); weekStart.setDate(s.getDate() - s.getDay())
    for (let w = 0; w < 1000; w++) {
      let go = true
      for (const wd of [...days].sort()) {
        const d = new Date(weekStart); d.setDate(weekStart.getDate() + w * 7 * interval + wd)
        d.setHours(s.getHours(), s.getMinutes(), s.getSeconds(), 0)
        if (!push(d.getTime())) { go = false; break }
      }
      if (!go) break
    }
  } else if (freq === "MONTHLY") {
    for (let k = 0; k < 600; k++) { const d = new Date(s); d.setMonth(s.getMonth() + k * interval); if (d.getDate() !== s.getDate()) continue; if (!push(d.getTime())) break }
  } else if (freq === "YEARLY") {
    for (let k = 0; k < 100; k++) { const d = new Date(s); d.setFullYear(s.getFullYear() + k * interval); if (!push(d.getTime())) break }
  } else if (e.start <= to && e.end >= from) out.push(e.start)
  return out
}

export function eventsFrom(text: string, feed: CalendarFeed, from: number, to: number): CalEvent[] {
  const raws = parseICS(text)
  // ocorrências editadas (RECURRENCE-ID) substituem a original
  const moved = new Set(raws.filter((r) => r.recurrenceId).map((r) => `${r.uid}|${r.recurrenceId}`))
  const out: CalEvent[] = []
  for (const r of raws) {
    if (r.recurrenceId) {
      if (r.start + (r.end - r.start) >= from && r.start <= to) out.push({ id: `${feed.id}|${r.uid}|${r.start}`, feedId: feed.id, title: r.title, start: r.start, end: r.end, allDay: r.allDay, location: r.location, color: feed.color })
      continue
    }
    for (const t of expand(r, from, to)) {
      if (moved.has(`${r.uid}|${t}`)) continue
      out.push({ id: `${feed.id}|${r.uid}|${t}`, feedId: feed.id, title: r.title, start: t, end: t + (r.end - r.start), allDay: r.allDay, location: r.location, color: feed.color })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

export const feedUrl = (u: string) => u.trim().replace(/^webcal:\/\//i, "https://")
