import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { port: 5173, strictPort: true },
  // duas páginas: o app e a barra principal do Windows (janela separada)
  build: { rollupOptions: { input: { main: path.resolve(__dirname, "index.html"), taskbar: path.resolve(__dirname, "taskbar.html") } } },
})
