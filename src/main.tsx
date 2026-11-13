import React, { lazy, Suspense } from "react"
import ReactDOM from "react-dom/client"
import { MotionConfig } from "framer-motion"
import "@/lib/fonts"
import "./index.css"
import App from "./App"
import { RootBoundary } from "@/components/RootBoundary"
import { useStore } from "@/lib/store"
import { bridge } from "@/lib/bridge"
import { useUiMode } from "@/lib/uimode"
import { initScreens } from "@/lib/screens"

// Ferramentas de inspeção só em desenvolvimento: não carregar stores extras
// nem expor controles globais do app na versão instalada.
if (import.meta.env.DEV) {
  ;(window as any).__agenda = useStore
  void import("@/lib/webapps").then((m) => { (window as any).__webapps = m.useWebApps })
}

const Onboarding = lazy(() => import("@/components/Onboarding"))
const AppShell = lazy(() => import("@/components/AppShell"))

function Root() {
  const mode = useUiMode((s) => s.mode)
  const animations = useStore((s) => s.settings.animations)
  const body = mode === "" ? <Suspense fallback={null}><Onboarding /></Suspense> : mode === "app" ? <Suspense fallback={null}><AppShell /></Suspense> : <App />
  // "Animações" desligado para também os movimentos do framer-motion (antes só os de CSS paravam).
  // Ligado, segue a preferência "reduzir movimento" do sistema: deslocamentos viram troca direta, o esmaecer continua.
  return <MotionConfig reducedMotion={animations ? "user" : "always"}>{body}</MotionConfig>
}

Promise.all([
  bridge.mode.get().catch(() => ({ mode: "screen" as const, monitors: 1 })),
  bridge.bar.get().catch(() => null),
]).then(([m, bar]) => {
  useUiMode.setState({ ...m, mainBar: !!bar?.on && m.mode === "desktop" })
  document.documentElement.dataset.mode = m.mode || "welcome"
  if (m.mode === "desktop") initScreens()
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <RootBoundary>
        <Root />
      </RootBoundary>
    </React.StrictMode>
  )
})
