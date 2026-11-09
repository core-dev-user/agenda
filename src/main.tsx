import React, { lazy, Suspense, useEffect } from "react"
import ReactDOM from "react-dom/client"
import "@/lib/fonts"
import "./index.css"
import App, { useAutosave } from "./App"
import { useStore } from "@/lib/store"
import { bridge, type BarConfig } from "@/lib/bridge"
import { useUiMode } from "@/lib/uimode"

;(window as any).__agenda = useStore
import("@/lib/webapps").then((m) => { (window as any).__webapps = m.useWebApps })

const Onboarding = lazy(() => import("@/components/Onboarding"))
const AppShell = lazy(() => import("@/components/AppShell"))

function Root() {
  useAutosave()
  useEffect(() => {
    let alive = true
    const update = (bar: BarConfig) => { if (alive) useUiMode.setState({ mainBar: bar.active, barError: bar.error || "" }) }
    const off = bridge.bar.onStatus(update)
    bridge.bar.get().then(update).catch(() => {})
    return () => { alive = false; off() }
  }, [])
  const mode = useUiMode((s) => s.mode)
  if (mode === "") return <Suspense fallback={null}><Onboarding /></Suspense>
  if (mode === "app") return <Suspense fallback={null}><AppShell /></Suspense>
  return <App />
}

Promise.all([
  bridge.mode.get().catch(() => ({ mode: "screen" as const, monitors: 1 })),
  bridge.bar.get().catch(() => null),
]).then(([m, bar]) => {
  useUiMode.setState({ ...m, mainBar: !!bar?.active && m.mode === "desktop", barError: bar?.error || "" })
  document.documentElement.dataset.mode = m.mode || "welcome"
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>
  )
})
