/**
 * Teste de conexão das Salas: transforma o resultado dos testes num veredito em português simples.
 * Sem dependências (roda também nos testes do Node).
 */
import type { NetProbe } from "./bridge"

export interface WsResult { ok: boolean; ms: number; error: string }
export interface IceResult {
  /** a rede deixa sair UDP e o STUN respondeu (conexão direta possível) */
  srflx: boolean
  /** a retransmissão pública do PeerJS respondeu */
  relay: boolean
  /** seu servidor de retransmissão (Salas › Conexão) respondeu; null: nenhum configurado */
  ownRelay: boolean | null
}
export interface DiagInput { probe: NetProbe | null; ws: WsResult; ice: IceResult | null }
export interface Verdict {
  level: "ok" | "warn" | "bad"
  /** o que aconteceu, numa frase */
  title: string
  /** o que fazer, na ordem em que vale a pena tentar */
  fixes: string[]
}

const CLOCK_LIMIT_MS = 10 * 60 * 1000
const HOST = "0.peerjs.com"

const fixClock = "Acerte o relógio: Configurações do Windows › Hora e idioma › Data e hora › ligue “Definir hora automaticamente” e clique em “Sincronizar agora”."
const fixAv = `No antivírus (Kaspersky, Avast, AVG, ESET, Norton, McAfee, Bitdefender…), adicione o Widgy às exceções ou libere o endereço ${HOST} na proteção web.`
const fixFirewall = "No Firewall do Windows (Segurança do Windows › Firewall e proteção de rede › Permitir um aplicativo pelo firewall), marque o Widgy em redes Privadas e Públicas."
const fixVpn = "Desligue VPN, proxy ou “DNS seguro/filtro” e teste de novo."
const fixOtherNet = "Para confirmar que é a rede: ligue o PC no roteador do celular (hotspot) e rode o teste de novo."
const fixDns = "Troque o DNS do PC para 1.1.1.1 ou 8.8.8.8 (Configurações › Rede e Internet › propriedades da conexão › Atribuição de servidor DNS) e rode “ipconfig /flushdns” no Prompt de Comando."

export function clockWrong(p: NetProbe | null): boolean {
  if (!p) return false
  if (p.signal.kind === "clock" || p.control.kind === "clock") return true
  return p.clockSkewMs != null && Math.abs(p.clockSkewMs) > CLOCK_LIMIT_MS
}

export function verdict(d: DiagInput): Verdict {
  const p = d.probe
  if (clockWrong(p)) {
    const h = p?.clockSkewMs != null ? Math.round(Math.abs(p.clockSkewMs) / 60000) : 0
    return {
      level: "bad",
      title: h ? `O relógio do PC está ${h >= 120 ? Math.round(h / 60) + " horas" : h + " minutos"} ${p!.clockSkewMs! > 0 ? "adiantado" : "atrasado"}: as conexões seguras falham por isso.` : "O relógio do PC está errado: as conexões seguras falham por isso.",
      fixes: [fixClock],
    }
  }
  if (p && !p.control.ok && !p.signal.ok) {
    const k = p.control.kind
    if (k === "offline" || (k === "dns" && p.signal.kind === "dns")) return { level: "bad", title: "Este PC está sem internet (ou sem DNS) agora.", fixes: ["Confira o cabo/Wi-Fi e se o navegador abre sites.", fixDns] }
    if (k === "proxy") return { level: "bad", title: "Um proxy configurado no Windows está bloqueando o Widgy.", fixes: ["Configurações › Rede e Internet › Proxy: desligue o proxy (a não ser que a rede exija).", fixVpn] }
    if (k === "portal") return { level: "bad", title: "A rede pede login (Wi-Fi de hotel, escola ou empresa).", fixes: ["Abra o navegador, faça o login da rede e teste de novo."] }
    if (k === "cert") return { level: "bad", title: "Algo está interceptando as conexões seguras do Widgy (antivírus com verificação de HTTPS ou proxy de empresa).", fixes: [fixAv, fixClock] }
    return { level: "bad", title: "O Widgy não consegue acessar a internet, embora o PC possa estar online: algum programa está bloqueando o Widgy.", fixes: [fixFirewall, fixAv, fixVpn] }
  }
  if (p && (p.dns.sinkhole || !p.signal.ok) || !d.ws.ok) {
    if (p?.dns.sinkhole) return { level: "bad", title: `Um filtro de DNS está bloqueando ${HOST} (o servidor que faz os amigos se encontrarem).`, fixes: [`Libere ${HOST} no filtro (AdGuard, Pi-hole, NextDNS, controle dos pais do roteador ou do antivírus).`, fixDns] }
    if (p && !p.signal.ok) {
      const k = p.signal.kind
      if (k === "dns") return { level: "bad", title: `O DNS deste PC não encontra ${HOST}.`, fixes: [fixDns, fixVpn] }
      if (k === "cert") return { level: "bad", title: `Algo está interceptando a conexão segura com ${HOST} (antivírus com verificação de HTTPS/SSL ou proxy de empresa).`, fixes: [`Desligue a “verificação de conexões seguras/HTTPS” do antivírus ou adicione ${HOST} às exceções.`, fixAv] }
      if (k === "server") return { level: "warn", title: "O servidor de encontro está com problema agora. Não é a sua rede.", fixes: ["Tente de novo em alguns minutos."] }
      return { level: "bad", title: `A internet funciona, mas algo bloqueia ${HOST} (o servidor que faz os amigos se encontrarem).`, fixes: [fixAv, fixFirewall, fixVpn, "Rede de escola, empresa ou com controle dos pais no roteador também bloqueia: peça para liberarem " + HOST + ".", fixOtherNet] }
    }
    // só dá para dizer que o HTTPS passa quando o processo principal testou
    if (!p) return { level: "bad", title: `Não deu para conectar ao servidor de encontro (${HOST}): algo na rede ou no PC está bloqueando.`, fixes: [fixAv, fixFirewall, fixVpn, fixOtherNet] }
    return { level: "bad", title: `O servidor de encontro responde, mas a conexão em tempo real (WebSocket) com ${HOST} é bloqueada.`, fixes: [fixAv, fixVpn, fixFirewall, fixOtherNet] }
  }
  // o encontro funciona; agora, se a tela e a voz conseguem passar
  const ice = d.ice
  if (!ice) return { level: "ok", title: "O servidor de encontro funciona neste PC.", fixes: ["Se ainda falhar, rode o teste no PC de quem criou a sala."] }
  if (ice.ownRelay === false) return { level: "warn", title: "Seu servidor de retransmissão (Salas › Conexão) não respondeu: confira o endereço, o usuário e a senha.", fixes: ["Cole de novo os dados que o serviço de TURN mostra, ou apague o campo para usar só a conexão normal."] }
  if (!ice.srflx && !ice.relay && !ice.ownRelay) return { level: "warn", title: "Entra na sala, mas a rede bloqueia o tráfego de tela e voz (UDP): a tela pode ficar preta.", fixes: [fixFirewall, "Configure um servidor de retransmissão em Salas › Conexão (de preferência um endereço “turns:…:443”, que passa por quase qualquer rede).", fixVpn] }
  if (!ice.srflx) return { level: "warn", title: "Entra na sala; a conexão direta é bloqueada, então a tela vai pela retransmissão (pode ter mais atraso).", fixes: [fixFirewall] }
  return { level: "ok", title: "Tudo certo neste PC: o encontro e a conexão direta funcionam.", fixes: ["Se ainda falhar, rode o teste no PC de quem criou a sala e compare."] }
}

const yes = (b: boolean | null | undefined) => (b == null ? "—" : b ? "ok" : "falhou")
const hit = (h: { ok: boolean; ms: number; kind: string; error: string }) => (h.ok ? `ok (${h.ms} ms)` : `falhou: ${h.kind || "?"} ${h.error}`.trim())

/** texto para o amigo copiar e mandar (sem dados pessoais: só os resultados dos testes) */
export function report(d: DiagInput, v: Verdict, version = ""): string {
  const p = d.probe
  const lines = [`Teste de conexão do Widgy${version ? " " + version : ""}`, `Resultado: ${v.title}`]
  if (p) {
    lines.push(`Internet (controle): ${hit(p.control)}`)
    lines.push(`DNS ${HOST}: ${p.dns.ok ? (p.dns.sinkhole ? "bloqueado (" + p.dns.addresses.join(", ") + ")" : "ok") : "falhou " + p.dns.error}`)
    lines.push(`Servidor de encontro (HTTPS): ${hit(p.signal)}`)
    lines.push(`Relógio: ${p.clockSkewMs == null ? "não deu para conferir" : Math.round(p.clockSkewMs / 1000) + " s de diferença"}`)
  }
  lines.push(`Servidor de encontro (tempo real): ${d.ws.ok ? `ok (${d.ws.ms} ms)` : "falhou " + d.ws.error}`)
  if (d.ice) lines.push(`Conexão direta (UDP/STUN): ${yes(d.ice.srflx)} · retransmissão pública: ${yes(d.ice.relay)} · sua retransmissão: ${yes(d.ice.ownRelay)}`)
  return lines.join("\n")
}
