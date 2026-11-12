/**
 * Ajustes da transmissão de tela (sem dependências, testados em tests/rtc-tuning.test.mjs).
 *
 * Codificador: o padrão do WebRTC aqui é VP8, sempre por software (CPU). Colocar o H.264 primeiro na
 * oferta deixa o Chromium usar o codificador da placa de vídeo (NVENC, Quick Sync, AMF) quando existe;
 * sem ele, cai no H.264 por software. Quem recebe continua aceitando qualquer um dos dois.
 */
export type ShareCodec = "auto" | "vp8"

/** Reordena os codecs de vídeo da oferta/resposta SDP, pondo `codec` (ex.: "H264") primeiro. Sem o codec, devolve igual. */
export function preferVideoCodec(sdp: string, codec: string): string {
  const nl = sdp.includes("\r\n") ? "\r\n" : "\n"
  const lines = sdp.split(/\r?\n/)
  const m = lines.findIndex((l) => l.startsWith("m=video "))
  if (m < 0) return sdp
  let end = lines.findIndex((l, i) => i > m && l.startsWith("m="))
  if (end < 0) end = lines.length
  const head = lines[m].split(" ")
  const pts = head.slice(3)
  const wanted = new Set<string>()
  const rtxOf = new Map<string, string>()
  for (let i = m + 1; i < end; i++) {
    const map = /^a=rtpmap:(\d+) ([\w-]+)\//.exec(lines[i])
    if (map && map[2].toUpperCase() === codec.toUpperCase()) wanted.add(map[1])
    const apt = /^a=fmtp:(\d+) .*apt=(\d+)/.exec(lines[i])
    if (apt) rtxOf.set(apt[2], apt[1])
  }
  if (!wanted.size) return sdp
  const first: string[] = []
  for (const pt of pts) if (wanted.has(pt)) { first.push(pt); const rtx = rtxOf.get(pt); if (rtx && pts.includes(rtx)) first.push(rtx) }
  const taken = new Set(first)
  lines[m] = [...head.slice(0, 3), ...first, ...pts.filter((pt) => !taken.has(pt))].join(" ")
  return lines.join(nl)
}

export const QUALITIES = {
  "720p30": { w: 1280, h: 720, fps: 30, bitrate: 2_500_000, label: "720p · 30 fps" },
  "1080p30": { w: 1920, h: 1080, fps: 30, bitrate: 5_000_000, label: "1080p · 30 fps" },
  "1080p60": { w: 1920, h: 1080, fps: 60, bitrate: 8_000_000, label: "1080p · 60 fps" },
  "1440p60": { w: 2560, h: 1440, fps: 60, bitrate: 14_000_000, label: "1440p · 60 fps" },
} as const
export type ShareQuality = keyof typeof QUALITIES

export interface LinkStats {
  fps: number; width: number; height: number
  /** kbit/s enviados (ou recebidos) no último intervalo */
  kbps: number
  /** ida e volta até o outro PC, em ms (só quem transmite sabe) */
  rttMs?: number
  /** % de pacotes perdidos */
  lossPct?: number
  /** o que está limitando a qualidade: "none" | "cpu" | "bandwidth" | "other" */
  limit?: string
  /** nome do codificador/decodificador em uso e se é o da placa de vídeo */
  codec?: string; impl?: string; hardware?: boolean
  /** atraso do buffer de reprodução de quem assiste, em ms */
  bufferMs?: number
  /** quadros descartados e congelamentos de quem assiste */
  dropped?: number; freezes?: number
}

type Rec = Record<string, any>
/** Resume um relatório getStats() (envio ou recepção de vídeo). `prev` = leitura anterior, para calcular taxas. */
export function summarize(reports: Rec[], prev: { bytes: number; at: number; jbDelay?: number; jbCount?: number } | null, now: number): { stats: LinkStats | null; mark: { bytes: number; at: number; jbDelay?: number; jbCount?: number } | null } {
  const out = reports.find((r) => r.type === "outbound-rtp" && r.kind === "video")
  const inb = reports.find((r) => r.type === "inbound-rtp" && r.kind === "video")
  const r = out ?? inb
  if (!r) return { stats: null, mark: null }
  const bytes = Number(out ? r.bytesSent : r.bytesReceived) || 0
  const dt = prev ? (now - prev.at) / 1000 : 0
  const kbps = prev && dt > 0 ? Math.max(0, Math.round(((bytes - prev.bytes) * 8) / dt / 1000)) : 0
  const codecRep = reports.find((c) => c.type === "codec" && c.id === r.codecId)
  const impl = String((out ? r.encoderImplementation : r.decoderImplementation) || "")
  const stats: LinkStats = {
    fps: Math.round(Number(r.framesPerSecond) || 0), width: Number(r.frameWidth) || 0, height: Number(r.frameHeight) || 0, kbps,
    codec: codecRep?.mimeType ? String(codecRep.mimeType).replace("video/", "") : undefined, impl: impl || undefined,
    // o Chromium informa quando o codificador é eficiente em energia (= o da placa de vídeo)
    hardware: r.powerEfficientEncoder === true || r.powerEfficientDecoder === true || /MediaFoundation|D3D11|VAAPI|VideoToolbox|Nv|Qsv|Amf/i.test(impl) || undefined,
  }
  const mark: { bytes: number; at: number; jbDelay?: number; jbCount?: number } = { bytes, at: now }
  if (out) {
    stats.limit = String(r.qualityLimitationReason || "none")
    const remote = reports.find((x) => x.type === "remote-inbound-rtp" && x.kind === "video")
    if (remote) {
      if (remote.roundTripTime != null) stats.rttMs = Math.round(Number(remote.roundTripTime) * 1000)
      if (remote.fractionLost != null) stats.lossPct = Math.round(Number(remote.fractionLost) * 1000) / 10
    }
  } else {
    stats.dropped = Number(r.framesDropped) || 0
    stats.freezes = Number(r.freezeCount) || 0
    const d = Number(r.jitterBufferDelay) || 0, c = Number(r.jitterBufferEmittedCount) || 0
    mark.jbDelay = d; mark.jbCount = c
    // média do intervalo (não desde o começo da chamada)
    if (prev?.jbCount != null && c > prev.jbCount) stats.bufferMs = Math.round(((d - (prev.jbDelay ?? 0)) / (c - prev.jbCount)) * 1000)
    else if (c > 0) stats.bufferMs = Math.round((d / c) * 1000)
  }
  return { stats, mark }
}

/**
 * Taxa inicial e mínima do vídeo (kbit/s), nos parâmetros dos codecs de vídeo do SDP.
 * Sem isso o WebRTC começa estimando ~300 kbit/s e leva vários segundos para subir: a tela chega
 * borrada/pequena no começo. Vai na resposta de quem RECEBE (é ela que o transmissor aplica).
 * Parâmetros "x-google-*": entendidos pelo Chromium (o Widgy dos dois lados); outros navegadores ignoram.
 */
export function withStartBitrate(sdp: string, startKbps: number, minKbps = 0): string {
  const nl = sdp.includes("\r\n") ? "\r\n" : "\n"
  const lines = sdp.split(/\r?\n/)
  const m = lines.findIndex((l) => l.startsWith("m=video "))
  if (m < 0 || !(startKbps > 0)) return sdp
  let end = lines.findIndex((l, i) => i > m && l.startsWith("m="))
  if (end < 0) end = lines.length
  const extra = `x-google-start-bitrate=${Math.round(startKbps)}` + (minKbps > 0 ? `;x-google-min-bitrate=${Math.round(minKbps)}` : "")
  const out = lines.slice(0, m + 1)
  const seenFmtp = new Set<string>()
  const body = lines.slice(m + 1, end)
  for (const l of body) { const f = /^a=fmtp:(\d+) /.exec(l); if (f) seenFmtp.add(f[1]) }
  for (const l of body) {
    const f = /^a=fmtp:(\d+) (.*)$/.exec(l)
    if (f && !/apt=/.test(f[2]) && !/x-google-start-bitrate/.test(f[2])) { out.push(`a=fmtp:${f[1]} ${f[2]};${extra}`); continue }
    out.push(l)
    // codecs sem linha fmtp (VP8): cria uma logo depois do rtpmap
    const map = /^a=rtpmap:(\d+) (VP8|VP9|H264|AV1)\//i.exec(l)
    if (map && !seenFmtp.has(map[1])) out.push(`a=fmtp:${map[1]} ${extra}`)
  }
  return [...out, ...lines.slice(end)].join(nl)
}
