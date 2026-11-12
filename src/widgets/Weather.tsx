import { useEffect, useId, useState } from "react"
import { AlertTriangle, ChevronRight, Cloud, Droplets, MapPin, MoreHorizontal, Thermometer, Wind, X } from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge, friendlyError } from "@/lib/bridge"
import type { Widget } from "@/lib/types"
const getJSON = async (u: string) => JSON.parse(await bridge.net.text(u))

export interface Wx {
  city: string
  temp: number
  feels: number
  code: number
  isDay: boolean
  hum: number
  wind: number
  max: number
  min: number
  hours: { t: string; temp: number; code: number }[]
  days: { d: string; max: number; min: number; code: number }[]
}

export const LABEL = (c: number) =>
  c === 0 ? "Céu limpo" : c <= 2 ? "Parcialmente nublado" : c === 3 ? "Nublado" : c <= 48 ? "Neblina" : c <= 57 ? "Garoa" : c <= 67 ? "Chuva" : c <= 77 ? "Neve" : c <= 82 ? "Pancadas de chuva" : c <= 86 ? "Neve" : "Tempestade"


/** Filled weather art: closer to the Windows weather cards than thin Lucide outlines. */
export function WxIcon({ code, day = true, size = 20 }: { code: number; day?: boolean; size?: number }) {
  const uid = useId().replace(/:/g, "")
  const sky = "wx-sky-" + uid
  const cloud = "wx-cloud-" + uid
  const sun = "wx-sun-" + uid
  const clear = code === 0
  const overcast = code === 3 || (code >= 45 && code <= 48)
  const storm = code >= 95
  const rainy = storm || (code >= 51 && code <= 67) || (code >= 80 && code <= 82)
  const snow = (code >= 71 && code <= 77) || (code >= 85 && code <= 86)
  const showSky = clear || (!overcast && code <= 2) || (!day && !storm && !rainy && !snow)
  const showCloud = !clear
  return (
    <svg width={size} height={size} viewBox="0 0 112 112" fill="none" aria-hidden="true" className="shrink-0 overflow-visible drop-shadow-[0_7px_11px_rgba(0,0,0,0.12)]">
      <defs>
        <linearGradient id={sky} x1="24" y1="9" x2="78" y2="78" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFD86D" /><stop offset="1" stopColor="#F68A21" />
        </linearGradient>
        <linearGradient id={cloud} x1="26" y1="30" x2="77" y2="92" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" /><stop offset="0.49" stopColor="#EBF6FF" /><stop offset="1" stopColor="#98C4E8" />
        </linearGradient>
        <linearGradient id={sun} x1="30" y1="9" x2="63" y2="65" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFE7A0" /><stop offset="1" stopColor="#F69B2A" />
        </linearGradient>
      </defs>
      {showSky && (day
        ? <g>
            <g stroke="#F9B747" strokeWidth="6" strokeLinecap="round" opacity=".88">
              <path d="M49 5v10M49 68v10M12 41h10M76 41h10M23 15l7 7M69 60l7 7M23 67l7-7M69 22l7-7" />
            </g>
            <circle cx="49" cy="41" r="25" fill={"url(#" + sky + ")"} />
            <circle cx="43" cy="35" r="17" fill={"url(#" + sun + ")"} opacity=".56" />
          </g>
        : <g>
            <path d="M69 14c-15 9-22 30-14 46 7 16 24 24 41 19-8 13-22 22-39 22-26 0-47-21-47-47S31 7 57 7c4 0 8 1 12 2Z" fill="#DDEBFF" />
            <circle cx="85" cy="27" r="2.3" fill="#DDEBFF" /><circle cx="97" cy="45" r="1.8" fill="#B1D9FF" />
          </g>
      )}
      {showCloud && (
        <g>
          <path d="M26 85h55c14 0 24-10 24-23 0-12-10-21-22-22-4-16-17-27-33-27-17 0-31 13-34 29C7 45 2 53 2 63c0 13 11 22 24 22Z" fill={"url(#" + cloud + ")"} />
          <path d="M17 62c0-10 8-19 18-19 3-11 12-20 25-22" stroke="#FFFFFF" strokeWidth="4" opacity=".45" strokeLinecap="round" />
        </g>
      )}
      {(code >= 45 && code <= 48) && <g stroke="#DFEFFF" opacity=".75" strokeWidth="4" strokeLinecap="round"><path d="M14 91h74M25 101h60" /></g>}
      {rainy && !storm && <g stroke="#69C5FF" strokeWidth="5" strokeLinecap="round"><path d="M26 89l-7 12M49 89l-7 12M74 89l-7 12" /></g>}
      {snow && <g stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round"><path d="M26 88v14m-6-7h12M51 88v14m-6-7h12M76 88v14m-6-7h12" /></g>}
      {storm && <path d="M55 80 39 103h15l-6 9 30-31H61l8-13Z" fill="#FFD36E" stroke="#F39C35" strokeWidth="1.5" />}
    </svg>
  )
}

/** Atmospheric background follows actual day/night and WMO weather condition. */
function SkyBackdrop({ code, day }: { code: number; day: boolean }) {
  const storm = code >= 95
  const rainy = storm || (code >= 51 && code <= 67) || (code >= 80 && code <= 82)
  const cloudy = code >= 2
  const palette = !day
    ? "linear-gradient(135deg, #172F57 0%, #122E50 50%, #09182F 100%)"
    : storm
      ? "linear-gradient(125deg, #34557D 0%, #243B62 60%, #142740 100%)"
      : rainy
        ? "linear-gradient(135deg, #295780 0%, #244670 50%, #142E53 100%)"
        : "linear-gradient(125deg, #376AA8 0%, #234E86 56%, #18355E 100%)"
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" style={{ background: palette }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 87% -10%, rgba(187,220,255,.26), transparent 58%), radial-gradient(ellipse at 3% 90%, rgba(16,44,91,.3), transparent 55%)" }} />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 500 220" preserveAspectRatio="xMidYMid slice" fill="none">
        {!storm && !rainy && day && <circle cx="411" cy="34" r="55" fill="#C4DAF8" opacity=".075" />}
        {!day && <g fill="#D7E9FF"><circle cx="85" cy="36" r="1.5" opacity=".35" /><circle cx="335" cy="22" r="2" opacity=".3" /><circle cx="467" cy="115" r="1.3" opacity=".3" /></g>}
        <path d="M-65 198c55-44 111-48 167-29 33-61 119-55 152-4 58-29 113-1 141 35 57-23 105-13 145 20H-65Z" fill="#CDE4FF" opacity={cloudy ? ".09" : ".045"} />
        <path d="M-35 222c49-55 130-58 183-20 46-44 109-40 152 2 88-28 178-10 229 21H-35Z" fill="#96B8E9" opacity=".115" />
        {rainy && <g stroke="#A5C9ED" strokeLinecap="round" opacity=".13" strokeWidth="2"><path d="m370 52-12 24m35-33-12 24m43-14-12 24m18-5-12 24m-80-7-12 24" /></g>}
      </svg>
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(2,15,42,.03), transparent 42%, rgba(4,15,37,.29))" }} />
    </div>
  )
}

const WEATHER_TTL = 10 * 60_000
const WEATHER_CACHE_LIMIT = 12
const cache = new Map<string, { at: number; data: Wx }>()
const inFlight = new Map<string, Promise<Wx>>()

/** Cache limitado e requisições compartilhadas entre widgets e painel Carbono. */
export function loadWeather(city: string): Promise<Wx> {
  const name = city.trim() || "São Paulo"
  const key = name.toLocaleLowerCase("pt-BR")
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < WEATHER_TTL) return Promise.resolve(cached.data)
  const pending = inFlight.get(key)
  if (pending) return pending

  const request = (async (): Promise<Wx> => {
    const g = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=pt`)
    const loc = g.results?.[0]
    if (!loc) throw new Error("Cidade não encontrada")
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,apparent_temperature,is_day,weather_code,relative_humidity_2m,wind_speed_10m&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5`
    const d = await getJSON(u)
    const nowIdx = Math.max(0, d.hourly.time.findIndex((t: string) => new Date(t) >= new Date(Date.now() - 3600000)))
    const data: Wx = {
      city: loc.name,
      temp: d.current.temperature_2m,
      feels: d.current.apparent_temperature,
      code: d.current.weather_code,
      isDay: !!d.current.is_day,
      hum: d.current.relative_humidity_2m,
      wind: d.current.wind_speed_10m,
      max: d.daily.temperature_2m_max[0],
      min: d.daily.temperature_2m_min[0],
      hours: d.hourly.time.slice(nowIdx, nowIdx + 8).map((t: string, i: number) => ({ t: t.slice(11, 13) + "h", temp: d.hourly.temperature_2m[nowIdx + i], code: d.hourly.weather_code[nowIdx + i] })),
      days: d.daily.time.map((t: string, i: number) => ({
        d: new Date(t + "T12:00").toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
        max: d.daily.temperature_2m_max[i],
        min: d.daily.temperature_2m_min[i],
        code: d.daily.weather_code[i],
      })),
    }
    cache.delete(key)
    cache.set(key, { at: Date.now(), data })
    while (cache.size > WEATHER_CACHE_LIMIT) cache.delete(cache.keys().next().value!)
    return data
  })()
  inFlight.set(key, request)
  void request.then(
    () => { if (inFlight.get(key) === request) inFlight.delete(key) },
    () => { if (inFlight.get(key) === request) inFlight.delete(key) },
  )
  return request
}


/** Windows-style weather card, with an actual forecast instead of a dead action. */
export function WeatherWidget({ w }: { w: Widget }) {
  const globalCity = useStore((s) => s.settings.weatherCity)
  const city = w.config.city || globalCity
  const [wx, setWx] = useState<Wx | null>(null)
  const [err, setErr] = useState("")
  const [details, setDetails] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let alive = true
    setWx(null)
    setErr("")
    const run = () => {
      loadWeather(city)
        .then((data) => { if (alive) { setWx(data); setErr("") } })
        .catch((e) => { if (alive) setErr(friendlyError(e)) })
    }
    run()
    const id = setInterval(run, 15 * 60000)
    return () => { alive = false; clearInterval(id) }
  }, [city, retry])

  const tight = w.h < 160 || w.w < 265
  const expanded = w.h >= 265
  const storm = wx ? wx.code >= 95 : false
  const gust = wx ? wx.wind >= 45 : false
  const warn = storm || gust
  const reason = storm ? "Condições de tempestade" : gust ? "Ventos fortes" : wx ? LABEL(wx.code) : ""
  const iconSize = tight ? 48 : Math.max(52, Math.min(76, Math.round(w.w * .21)))

  return (
    <div className="relative isolate flex h-full w-full flex-col overflow-hidden text-white" style={{ borderRadius: "inherit", textShadow: "0 1px 5px rgba(2,18,43,.14)" }}>
      <SkyBackdrop code={wx?.code ?? 2} day={wx?.isDay ?? true} />
      <div className="relative z-[1] flex h-full min-h-0 flex-col" style={{ padding: tight ? "10px 12px" : "14px 17px" }}>
        <div className="flex shrink-0 items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <MapPin size={tight ? 13 : 15} className="shrink-0 text-white/85" strokeWidth={2.5} />
            <span className="truncate text-[13px] font-semibold tracking-[-.02em] text-white/95" style={{ fontSize: tight ? 12 : Math.min(16, Math.max(12, w.w / 24)) }} title={city}>{wx?.city ?? city}</span>
          </div>
          <button data-nodrag type="button" className="-mt-1 -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/65 transition hover:bg-white/15 hover:text-white" title="Abrir detalhes do clima" onClick={() => setDetails((v) => !v)} aria-label="Detalhes do clima">
            <MoreHorizontal size={21} />
          </button>
        </div>

        {err ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <Cloud size={24} className="text-white/75" />
            <span className="text-xs text-white/85">{err}</span>
            <button data-nodrag type="button" className="rounded-full border border-white/20 px-3 py-1 text-[11px] hover:bg-white/15" onClick={() => setRetry((n) => n + 1)}>Tentar novamente</button>
          </div>
        ) : !wx ? (
          <div className="flex flex-1 items-center justify-center gap-3 text-xs text-white/70">
            <Cloud size={23} className="animate-pulse" /> Atualizando previsão…
          </div>
        ) : (
          <>
            <div className="flex min-h-0 flex-1 items-center justify-between gap-1 pt-1">
              <div className="flex min-w-0 shrink-0 items-center gap-1">
                <WxIcon code={wx.code} day={wx.isDay} size={iconSize} />
                <div className="font-num shrink-0 font-light leading-none tracking-[-.09em] text-white" style={{ fontSize: tight ? 43 : Math.max(48, Math.min(73, Math.floor(w.w * .19))) }}>
                  {Math.round(wx.temp)}<span className="relative ml-0.5 inline-block align-top text-[.37em] font-medium tracking-normal" style={{ top: ".16em" }}>°C</span>
                </div>
              </div>
              <div className="flex min-w-0 max-w-[45%] flex-col items-end gap-1 text-right">
                <div className="flex items-center justify-end gap-1 text-[11px] font-semibold leading-snug text-white/90" style={{ fontSize: tight ? 10 : 12 }}>
                  {warn && <AlertTriangle size={15} className="shrink-0 text-[#FFC565]" />}
                  <span>{reason}</span>
                </div>
                {!tight && <div className="font-num text-[11px] text-[#D2E6FC]">↑ {Math.round(wx.max)}° &nbsp; ↓ {Math.round(wx.min)}°</div>}
              </div>
            </div>
            {!tight && (
              <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 pb-1 text-[10px] font-medium text-white/75">
                <span className="flex items-center gap-1"><Thermometer size={12} /> Sensação {Math.round(wx.feels)}°</span>
                <span className="flex items-center gap-1"><Droplets size={12} /> {wx.hum}%</span>
                {w.w >= 320 && <span className="flex items-center gap-1"><Wind size={12} /> {Math.round(wx.wind)} km/h</span>}
              </div>
            )}
            {expanded && (
              <div className="mb-1 flex shrink-0 justify-between gap-2 overflow-hidden border-t border-white/15 pt-2">
                {wx.hours.slice(0, Math.min(5, Math.max(3, Math.floor(w.w / 82)))).map((hour, i) => (
                  <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1 text-[10px] text-white/85">
                    <span>{hour.t}</span>
                    <WxIcon code={hour.code} size={23} />
                    <span className="font-num font-semibold">{Math.round(hour.temp)}°</span>
                  </div>
                ))}
              </div>
            )}
            <button data-nodrag type="button" onClick={() => setDetails(true)} className="mt-auto flex shrink-0 items-center justify-center gap-1 border-t border-white/10 pt-2 text-center text-[12px] font-semibold text-white/90 transition-colors hover:text-white" title="Ver os próximos horários e cinco dias">
              Ver a previsão completa <ChevronRight size={14} />
            </button>
          </>
        )}
      </div>

      {details && (
        <div data-nodrag role="dialog" aria-label="Previsão completa" className="absolute inset-0 z-10 flex flex-col overflow-hidden bg-[#142d50]/98 p-3 text-white" style={{ borderRadius: "inherit", background: "linear-gradient(150deg, #234872, #102a4d)" }}>
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold">{wx?.city ?? city}</div>
              <div className="text-[10px] text-white/65">Próximas horas e dias</div>
            </div>
            <button data-nodrag type="button" onClick={() => setDetails(false)} title="Fechar previsão" aria-label="Fechar previsão" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"><X size={15} /></button>
          </div>
          {wx && <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {wx.hours.map((hour, i) => (
                <div key={i} className="flex min-w-[54px] flex-col items-center gap-1 rounded-xl bg-white/10 p-2 text-[10px]">
                  <span>{hour.t}</span><WxIcon code={hour.code} size={27} /><span className="font-num font-semibold">{Math.round(hour.temp)}°</span>
                </div>
              ))}
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Próximos dias</div>
            {wx.days.map((day, i) => (
              <div key={i} className="flex items-center justify-between gap-2 border-b border-white/10 pb-1.5 text-[12px]">
                <span className="w-10 inline-block cap-first text-white/85">{day.d}</span>
                <WxIcon code={day.code} size={25} />
                <span className="font-num">{Math.round(day.min)}° <span className="text-white/55">—</span> {Math.round(day.max)}°</span>
              </div>
            ))}
            <div className="flex justify-between gap-2 text-[10px] text-white/60"><span>Umidade {wx.hum}%</span><span>Vento {Math.round(wx.wind)} km/h</span></div>
            <div className="text-[9px] text-white/50">Dados: Open-Meteo. Condições de risco não substituem alertas oficiais.</div>
          </div>}
        </div>
      )}
    </div>
  )
}
