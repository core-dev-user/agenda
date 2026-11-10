import React from "react"
import ReactDOM from "react-dom/client"
import "@/lib/fonts"
import "../index.css"
import "./bar.css"
import { SystemBar } from "./SystemBar"
import { BarMenuView } from "./BarMenu"
import { Desk } from "./Desk"
import { Preview } from "./Preview"
import type { BarMenu } from "@/lib/bridge"

// mesma página para a barra e para os menus que abrem em cima dela
const q = new URLSearchParams(location.search)
const view = q.get("view") || "bar"
const isMenu = view === "menu"
document.documentElement.dataset.bar = isMenu || view === "preview" ? "menu" : view === "desk" ? "desk" : "bar"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isMenu ? <BarMenuView kind={(q.get("kind") || "start") as BarMenu} /> : view === "desk" ? <Desk /> : view === "preview" ? <Preview /> : <SystemBar />}
  </React.StrictMode>
)
