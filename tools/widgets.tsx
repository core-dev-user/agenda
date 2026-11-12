import ReactDOM from "react-dom/client"
import "../src/lib/fonts"
import "../src/index.css"
import { bridge } from "../src/lib/bridge"
import { useStore, WIDGET_SIZES } from "../src/lib/store"
import App from "../src/App"
const q = new URLSearchParams(location.search)
const b = bridge as any
b.sysmon = { ...b.sysmon, sub: async () => true, unsub: async () => true, onData: (f: any) => { const t = setInterval(() => f({ at: Date.now(), cpu: { usage: 20 + Math.random() * 10, cores: [10, 20, 30, 40], speed: 4000, name: "CPU" }, mem: { total: 16e9, used: 7e9 }, gpu: null, net: { rx: 1e5, tx: 1e4 }, disk: { busy: 3, read: 0, write: 0 }, drives: [{ id: "C:", size: 5e11, free: 2e11 }], top: [{ name: "x", mem: 1e9 }], uptime: 999 }), 2000); return () => clearInterval(t) } }
// rede: por padrão responde vazio (como sem internet); ?net=fail simula erro em todas as buscas
b.net = { text: async () => { if (q.get("net") === "fail") throw new Error("sem rede"); return "{}" } }
const only = q.get("only")
const types = (Object.keys(WIDGET_SIZES) as string[]).filter((t) => !only || only.split(",").includes(t))
let x = 20, y = 20, rowH = 0
const widgets = types.map((type, i) => { const [w0, h0] = (WIDGET_SIZES as any)[type]; const w = Math.min(w0, 300), h = Math.min(h0, 220)
  if (x + w > 1900) { x = 20; y += rowH + 16; rowH = 0 }
  const o = { id: "w" + i, type, x, y, w, h, config: {} }; x += w + 16; rowH = Math.max(rowH, h); return o })
useStore.setState((s: any) => ({ splashDone: true, widgets, settings: { ...s.settings, sakura: { ...s.settings.sakura, splash: false, ambient: false }, cursorEffect: "none", pet: { ...(s.settings.pet ?? {}), on: false } } }))
ReactDOM.createRoot(document.getElementById("root")!).render(<App />)
;(window as any).__store = useStore
