import { useEffect, useState } from "react"
import { RefreshCw, Newspaper } from "lucide-react"
import { bridge, friendlyError } from "@/lib/bridge"
import { useStore } from "@/lib/store"
import type { Widget } from "@/lib/types"

export const FEEDS = [
  { label: "G1", url: "https://g1.globo.com/rss/g1/" },
  { label: "G1 Tecnologia", url: "https://g1.globo.com/rss/g1/tecnologia/" },
  { label: "BBC Brasil", url: "https://feeds.bbci.co.uk/portuguese/rss.xml" },
  { label: "Folha", url: "https://feeds.folha.uol.com.br/emcimadahora/rss091.xml" },
  { label: "TecMundo", url: "https://rss.tecmundo.com.br/feed" },
  { label: "Olhar Digital", url: "https://olhardigital.com.br/feed/" },
]

interface Item { title: string; link: string; date: Date | null; img: string | null; source: string }

async function loadFeed(url: string): Promise<Item[]> {
  const xml = await bridge.net.text(url)
  const doc = new DOMParser().parseFromString(xml, "text/xml")
  const source = doc.querySelector("channel > title")?.textContent ?? ""
  const nodes = Array.from(doc.querySelectorAll("item, entry"))
  return nodes.slice(0, 30).map((n) => {
    const get = (sel: string) => n.getElementsByTagName(sel)[0]
    const linkEl = get("link")
    const link = linkEl?.getAttribute("href") || linkEl?.textContent || ""
    const media = get("media:content") || get("media:thumbnail") || get("enclosure")
    let img = media?.getAttribute("url") ?? null
    if (!img) {
      const desc = get("description")?.textContent ?? ""
      img = desc.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null
    }
    const d = get("pubDate")?.textContent || get("updated")?.textContent || get("published")?.textContent
    return { title: (get("title")?.textContent ?? "").trim(), link: link.trim(), date: d ? new Date(d) : null, img, source }
  })
}

const ago = (d: Date | null) => {
  if (!d || isNaN(+d)) return ""
  const m = Math.round((Date.now() - +d) / 60000)
  if (m < 60) return `${m} min`
  if (m < 1440) return `${Math.round(m / 60)} h`
  return `${Math.round(m / 1440)} d`
}

export function NewsWidget({ w }: { w: Widget }) {
  const global = useStore((s) => s.settings.newsFeed)
  const url = w.config.feed || global
  const [items, setItems] = useState<Item[]>([])
  const [err, setErr] = useState("")
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const run = () => {
    setLoading(true)
    loadFeed(url)
      .then((it) => { setItems(it); setErr("") })
      .catch((e) => setErr(friendlyError(e)))
      .finally(() => { setLoading(false); setLoaded(true) })
  }
  useEffect(() => {
    run()
    const id = setInterval(run, 20 * 60000)
    return () => clearInterval(id)
  }, [url])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="font-display flex items-center gap-1.5 font-semibold"><Newspaper size={15} className="text-fg-muted" /> {FEEDS.find((f) => f.url === url)?.label ?? items[0]?.source ?? "Notícias"}</div>
        <button className="btn btn-ghost btn-icon" onClick={run} title="Atualizar"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></button>
      </div>
      <div className="flex-1 space-y-1 overflow-auto px-2 pb-2">
        {err && <div className="p-3 text-sm text-fg-muted">Não foi possível carregar: {err}</div>}
        {/* endereço respondeu, mas sem notícias (feed vazio ou que não é RSS): antes o widget ficava em branco */}
        {!err && loaded && !loading && !items.length && <div className="p-3 text-sm text-fg-muted">Nenhuma notícia neste endereço. Confira o endereço do feed nas opções do widget.</div>}
        {items.map((it, i) => (
          <button
            key={i}
            onClick={() => bridge.app.openExternal(it.link)}
            className="flex w-full gap-3 rounded-[calc(var(--r)*0.5)] p-2 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)]"
          >
            {it.img && w.w > 300 && <img src={it.img} className="h-14 w-20 shrink-0 rounded-md object-cover" loading="lazy" />}
            <div className="min-w-0">
              <div className="line-clamp-2 text-sm leading-snug">{it.title}</div>
              <div className="mt-0.5 text-xs text-fg-muted">{ago(it.date)}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
