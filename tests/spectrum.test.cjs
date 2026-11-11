const { test } = require("node:test")
const assert = require("node:assert/strict")
const { createAnalyzer } = require("../electron/spectrum.cjs")

const tone = (freq, samples, rate = 48000, amp = 0.5) => {
  const buf = Buffer.alloc(samples * 4)
  for (let i = 0; i < samples; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * amp * 32767)
    buf.writeInt16LE(v, i * 4); buf.writeInt16LE(v, i * 4 + 2)
  }
  return buf
}
const loudest = (bands) => bands.indexOf(Math.max(...bands))

test("a bass tone lights the left bands and a treble tone the right ones", () => {
  const a = createAnalyzer()
  a.push(tone(80, 2048))
  const low = loudest(a.bands().bands)
  const b = createAnalyzer()
  b.push(tone(6000, 2048))
  const high = loudest(b.bands().bands)
  assert.ok(low < 12, "80 Hz should be in the first quarter, got band " + low)
  assert.ok(high > 32, "6 kHz should be in the last third, got band " + high)
})
test("silence produces flat, near-zero bands", () => {
  const a = createAnalyzer()
  a.push(Buffer.alloc(4096))
  const { bands, level } = a.bands()
  assert.equal(bands.length, 48)
  assert.ok(Math.max(...bands) <= 0.05 && level <= 0.05)
})
test("chunks split in the middle of a sample are joined, not misread", () => {
  const whole = tone(440, 1024)
  const a = createAnalyzer(), b = createAnalyzer()
  a.push(whole)
  b.push(whole.subarray(0, 1001)); b.push(whole.subarray(1001))
  assert.deepEqual(a.bands().bands, b.bands().bands)
})
