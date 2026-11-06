import { useEffect, useState } from "react"
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Droplets, Moon, Sun, Wind } from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge, friendlyError } from "@/lib/bridge"

const getJSON = async (u: string) => JSON.parse(await bridge.net.text(u))
import type { Widget } from "@/lib/types"

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

export function WxIcon({ code, day = true, size = 20 }: { code: number; day?: boolean; size?: number }) {
  const p = { size, strokeWidth: 1.6 }
  if (code === 0) return day ? <Sun {...p} className="text-amber-300" /> : <Moon {...p} className="text-indigo-200" />
  if (code <= 2) return <CloudSun {...p} className="text-amber-200" />
  if (code === 3) return <Cloud {...p} />
  if (code <= 48) return <CloudFog {...p} />
  if (code <= 57) return <CloudDrizzle {...p} className="text-sky-300" />
  if (code <= 67 || (code >= 80 && code <= 82)) return <CloudRain {...p} className="text-sky-300" />
  if (code <= 86) return <CloudSnow {...p} />
  return <CloudLightning {...p} className="text-yellow-300" />
}

const cache = new Map<string, { at: number; data: Wx }>()

export async function loadWeather(city: string): Promise<Wx> {
  const c = cache.get(city)
  if (c && Date.now() - c.at < 10 * 60000) return c.data
  const g = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pt`)
  const loc = g.results?.[0]
  if (!loc) throw new Error("Cidade não encontrada")
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,apparent_temperature,is_day,weather_code,relative_humidity_2m,wind_speed_10m&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5`
  const d = await getJSON(u)
  const nowIdx = d.hourly.time.findIndex((t: string) => new Date(t) >= new Date(Date.now() - 3600000))
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
  cache.set(city, { at: Date.now(), data })
  return data
}

export function WeatherWidget({ w }: { w: Widget }) {
  const globalCity = useStore((s) => s.settings.weatherCity)
  const city = w.config.city || globalCity
  const [wx, setWx] = useState<Wx | null>(null)
  const [err, setErr] = useState("")
  useEffect(() => {
    let alive = true
    const run = () =>
      loadWeather(city)
        .then((d) => alive && (setWx(d), setErr("")))
        .catch((e) => alive && setErr(friendlyError(e)))
    run()
    const id = setInterval(run, 15 * 60000)
    return () => { alive = false; clearInterval(id) }
  }, [city])

  if (err) return <div className="flex h-full items-center justify-center p-4 text-center text-sm text-fg-muted"><Cloud size={20} className="mx-auto mb-1" />{err}<br />({city})</div>
  if (!wx) return <div className="flex h-full items-center justify-center text-sm text-fg-muted">Carregando clima…</div>
  const big = w.h > 260
  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-medium">{wx.city}</div>
          <div className="font-num text-5xl font-light leading-none">{Math.round(wx.temp)}°</div>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <WxIcon code={wx.code} day={wx.isDay} size={40} />
          <div className="text-sm">{LABEL(wx.code)}</div>
          <div className="font-num text-xs text-fg-muted">↑{Math.round(wx.max)}° ↓{Math.round(wx.min)}°</div>
        </div>
      </div>
      <div className="mt-2 flex gap-3 text-xs text-fg-muted">
        <span>Sensação {Math.round(wx.feels)}°</span>
        <span className="flex items-center gap-1"><Droplets size={12} />{wx.hum}%</span>
        <span className="flex items-center gap-1"><Wind size={12} />{Math.round(wx.wind)} km/h</span>
      </div>
      <div className="mt-auto flex justify-between pt-2">
        {(big ? wx.days : wx.hours.slice(0, Math.max(3, Math.floor(w.w / 55)))).map((h: any, i) => (
          <div key={i} className="flex flex-col items-center gap-1 text-xs">
            <span className="capitalize text-fg-muted">{h.t ?? h.d}</span>
            <WxIcon code={h.code} size={16} />
            <span className="font-num">{Math.round(h.temp ?? h.max)}°</span>
          </div>
        ))}
      </div>
    </div>
  )
}
