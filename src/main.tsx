import React from "react"
import ReactDOM from "react-dom/client"
import "@/lib/fonts"
import "./index.css"
import App from "./App"
import { useStore } from "@/lib/store"

;(window as any).__agenda = useStore

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
