import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export const brl = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

export const todayISO = (d = new Date()) => {
  const z = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}

export const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"]
export const WEEKDAYS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]
