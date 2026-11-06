import React from "react"
import ReactDOM from "react-dom/client"
import "@/lib/fonts"
import "./index.css"
import App from "./App"
import { useStore } from "@/lib/store"

;(window as any).__agenda = useStore
import("@/lib/webapps").then((m) => { (window as any).__webapps = m.useWebApps })

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
