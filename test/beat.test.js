import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findBeat, snap, suggestStart } from '../src/music/beat.js'

// a made-up song: a kick on every beat, a hi-hat between, a little noise, quiet then loud
function song({ bpm, first, seconds = 60, sr = 22050, loudFrom = Infinity }) {
  const out = new Float32Array(seconds * sr)
  let seed = 1
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5)
  for (let i = 0; i < out.length; i++) out[i] = noise() * 0.02
  const period = 60 / bpm
  for (let t = first, k = 0; t < seconds; t += period / 2, k++) {
    const kick = k % 2 === 0
    const gain = t >= loudFrom ? 1 : 0.35
    const start = Math.round(t * sr)
    for (let j = 0; j < sr * 0.12 && start + j < out.length; j++) {
      const env = Math.exp(-j / (sr * (kick ? 0.04 : 0.01)))
      out[start + j] += gain * env * (kick ? Math.sin((2 * Math.PI * 60 * j) / sr) * 0.9 : noise() * 0.3)
    }
  }
  return { out, sr }
}

for (const bpm of [92, 120, 128, 145]) {
  test(`finds ${bpm} bpm and where the beats fall`, () => {
    const { out, sr } = song({ bpm, first: 0.37 })
    const b = findBeat(out, sr)
    assert.ok(Math.abs(b.bpm - bpm) < 0.3, `bpm ${b.bpm}`)
    // 60 s later the grid must still be on the kicks (within 30 ms)
    const period = 60 / bpm
    const t = 0.37 + Math.round((55 - 0.37) / period) * period
    assert.ok(Math.abs(snap(b, t) - t) < 0.03, `beat at ${t}: ${snap(b, t)}`)
  })
}

test('suggests where the song gets loud', () => {
  const bpm = 120
  const { out, sr } = song({ bpm, first: 0.25, seconds: 90, loudFrom: 30.25 })
  const b = findBeat(out, sr)
  const s = suggestStart(b, 40)
  assert.ok(Math.abs(s - 30.25) < 0.6, `start ${s}`)
})

