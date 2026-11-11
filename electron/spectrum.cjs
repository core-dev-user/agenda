// Espectro do som do PC para visualizadores (sem dependências).
// Recebe PCM 16 bits estéreo intercalado (o que o sysaudio.cjs captura) e devolve N faixas de 0 a 1,
// em escala logarítmica de frequência (graves à esquerda), já normalizadas para desenhar.

/** FFT radix-2 no lugar (re/im com tamanho potência de 2). */
function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr
        re[b] = re[a] - xr; im[b] = im[a] - xi
        re[a] += xr; im[a] += xi
        const nr = cr * wr - ci * wi
        ci = cr * wi + ci * wr; cr = nr
      }
    }
  }
}

/**
 * Analisador com janela deslizante. `push` recebe pedaços de PCM; `bands` calcula as faixas atuais.
 * size: amostras da FFT (1024 a 48 kHz ≈ 21 ms). Faixas de 40 Hz a 16 kHz.
 */
function createAnalyzer({ size = 1024, rate = 48000, count = 48, min = 40, max = 16000 } = {}) {
  const ring = new Float32Array(size)
  let w = 0
  let carry = null
  const hann = new Float32Array(size)
  for (let i = 0; i < size; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1))
  const re = new Float64Array(size), im = new Float64Array(size)
  // limites de cada faixa em índices da FFT (log), pelo menos 1 posição cada
  const edges = []
  for (let b = 0; b <= count; b++) edges.push(Math.min(size / 2 - 1, Math.max(1, Math.round((min * Math.pow(max / min, b / count)) / (rate / size)))))
  let peak = 0.02

  function push(buf) {
    let bytes = buf
    if (carry) { bytes = Buffer.concat([carry, buf]); carry = null }
    const usable = bytes.length - (bytes.length % 4)
    if (usable < bytes.length) carry = Buffer.from(bytes.subarray(usable))
    for (let o = 0; o < usable; o += 4) {
      ring[w] = (bytes.readInt16LE(o) + bytes.readInt16LE(o + 2)) / 65536
      w = (w + 1) % size
    }
  }

  function bands() {
    for (let i = 0; i < size; i++) { re[i] = ring[(w + i) % size] * hann[i]; im[i] = 0 }
    fft(re, im)
    const out = new Array(count)
    let loud = 0
    for (let b = 0; b < count; b++) {
      let lo = edges[b], hi = Math.max(lo + 1, edges[b + 1])
      let m = 0
      for (let k = lo; k < hi; k++) m = Math.max(m, Math.hypot(re[k], im[k]))
      // agudos têm menos energia: compensa um pouco para a barra não ficar morta à direita
      const v = m * (1 + (b / count) * 2.2)
      out[b] = v
      if (v > loud) loud = v
    }
    // ganho automático: acompanha o volume da música (sobe rápido, desce devagar)
    peak = Math.max(loud, peak * 0.995, 0.02)
    for (let b = 0; b < count; b++) out[b] = Math.round(Math.min(1, Math.pow(out[b] / peak, 0.75)) * 1000) / 1000
    return { bands: out, level: Math.min(1, loud / peak) }
  }

  return { push, bands }
}

module.exports = { createAnalyzer, fft }
