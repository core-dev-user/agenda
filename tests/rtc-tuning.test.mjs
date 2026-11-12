import { test } from "node:test"
import assert from "node:assert/strict"
import { preferVideoCodec, summarize } from "../src/lib/rtcTuning.ts"

const SDP = ["v=0", "m=audio 9 UDP/TLS/RTP/SAVPF 111", "a=rtpmap:111 opus/48000/2",
  "m=video 9 UDP/TLS/RTP/SAVPF 96 97 98 99 102 103 35",
  "a=rtpmap:96 VP8/90000", "a=rtpmap:97 rtx/90000", "a=fmtp:97 apt=96",
  "a=rtpmap:98 VP9/90000", "a=rtpmap:99 rtx/90000", "a=fmtp:99 apt=98",
  "a=rtpmap:102 H264/90000", "a=fmtp:102 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f",
  "a=rtpmap:103 rtx/90000", "a=fmtp:103 apt=102", "a=rtpmap:35 AV1/90000", ""].join("\r\n")

test("H264 moves to the front together with its retransmission payload", () => {
  const out = preferVideoCodec(SDP, "H264")
  assert.match(out, /m=video 9 UDP\/TLS\/RTP\/SAVPF 102 103 96 97 98 99 35\r\n/)
  assert.match(out, /m=audio 9 UDP\/TLS\/RTP\/SAVPF 111\r\n/) // audio untouched
  assert.equal(out.split("\r\n").length, SDP.split("\r\n").length)
})
test("an offer without the codec, or without video, is returned unchanged", () => {
  assert.equal(preferVideoCodec(SDP, "HEVC"), SDP)
  assert.equal(preferVideoCodec("v=0\r\nm=audio 9 X 111\r\n", "H264"), "v=0\r\nm=audio 9 X 111\r\n")
})
test("sender stats: bitrate from byte deltas, limitation, round trip and hardware flag", () => {
  const reports = [
    { type: "outbound-rtp", kind: "video", bytesSent: 2_000_000, framesPerSecond: 59.6, frameWidth: 1920, frameHeight: 1080, qualityLimitationReason: "cpu", encoderImplementation: "MediaFoundationVideoEncodeAccelerator", codecId: "c1" },
    { type: "codec", id: "c1", mimeType: "video/H264" },
    { type: "remote-inbound-rtp", kind: "video", roundTripTime: 0.042, fractionLost: 0.015 },
  ]
  const { stats } = summarize(reports, { bytes: 1_000_000, at: 0 }, 1000)
  assert.deepEqual({ ...stats }, { fps: 60, width: 1920, height: 1080, kbps: 8000, codec: "H264", impl: "MediaFoundationVideoEncodeAccelerator", hardware: true, limit: "cpu", rttMs: 42, lossPct: 1.5 })
})
test("viewer stats: buffer delay is the average of the last interval", () => {
  const prev = { bytes: 0, at: 0, jbDelay: 10, jbCount: 100 }
  const { stats, mark } = summarize([{ type: "inbound-rtp", kind: "video", bytesReceived: 500_000, framesPerSecond: 30, frameWidth: 1280, frameHeight: 720, jitterBufferDelay: 13, jitterBufferEmittedCount: 160, framesDropped: 3, freezeCount: 1, decoderImplementation: "libvpx" }], prev, 2000)
  assert.equal(stats.bufferMs, 50)
  assert.equal(stats.kbps, 2000)
  assert.equal(stats.dropped, 3)
  assert.equal(stats.hardware, undefined)
  assert.deepEqual(mark, { bytes: 500_000, at: 2000, jbDelay: 13, jbCount: 160 })
})
test("no video report yields no stats", () => {
  assert.deepEqual(summarize([{ type: "transport" }], null, 0), { stats: null, mark: null })
})
