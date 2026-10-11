// Finding a song's beat, in the browser (the song isn't sent anywhere either): so the film's part
// of it can start where the song kicks in, and on a beat wherever you slide it.
//
// The song is boiled down to how much it "hits" every 10 ms (the jump in loudness, mostly from the
// low end where the kick drum is). The tempo is the spacing at which those hits line up best with
// themselves; it's then fine-tuned against the whole song — a comb laid over every beat, so that
// even a tiny error (which would drift a second off by the end of the film) shows. Where the comb
// fits best is where the beats fall.

const HOP = 0.01 // seconds per step of the envelope (about: it's a whole number of samples)

/** How hard the music hits at each step (0…). */
function onsets(samples, sr) {
  const hop = Math.round(sr * HOP)
  const n = Math.floor(samples.length / hop)
  const low = new Float32Array(n)
  const all = new Float32Array(n)
  // a gentle low-pass (≈150 Hz) for the kick and bass, beside the full signal
  const a = 1 - Math.exp((-2 * Math.PI * 150) / sr)
  let lp = 0
  for (let i = 0; i < n; i++) {
    let el = 0
    let ea = 0
    for (let k = i * hop, end = k + hop; k < end; k++) {
      const x = samples[k]
      lp += a * (x - lp)
      el += lp * lp
      ea += x * x
    }
    low[i] = Math.log1p(1000 * Math.sqrt(el / hop))
    all[i] = Math.log1p(1000 * Math.sqrt(ea / hop))
  }
  const flux = new Float32Array(n)
  for (let i = 1; i < n; i++) flux[i] = Math.max(0, low[i] - low[i - 1]) * 1.5 + Math.max(0, all[i] - all[i - 1])
  // only what stands out from its surroundings (half a second either side)
  const out = new Float32Array(n)
  const w = 25
  let sum = 0
  for (let i = 0; i < Math.min(n, w); i++) sum += flux[i]
  for (let i = 0; i < n; i++) {
    if (i + w < n) sum += flux[i + w]
    if (i - w - 1 >= 0) sum -= flux[i - w - 1]
    const span = Math.min(n - 1, i + w) - Math.max(0, i - w) + 1
    out[i] = Math.max(0, flux[i] - sum / span)
  }
  // softened a little (±30 ms): a comb a hair off still feels the hit, so the fit has a slope to climb
  const soft = new Float32Array(n)
  const kernel = [0.06, 0.13, 0.2, 0.22, 0.2, 0.13, 0.06]
  for (let i = 3; i < n - 3; i++) for (let k = 0; k < 7; k++) soft[i] += out[i + k - 3] * kernel[k]
  return { env: soft, loud: all, step: hop / sr }
}

// the envelope at a fractional step, linearly
const sample = (env, x) => {
  const i = Math.floor(x)
  const f = x - i
  return i + 1 < env.length ? env[i] * (1 - f) + env[i + 1] * f : 0
}

/** The best phase for beats every `period` steps, and how well they fit. */
function comb(env, period) {
  let best = { score: -1, phase: 0 }
  for (let phase = 0; phase < period; phase += 0.25) {
    let score = 0
    let count = 0
    for (let x = phase; x < env.length; x += period) {
      score += sample(env, x)
      count++
    }
    score /= count || 1
    if (score > best.score) best = { score, phase }
  }
  return best
}

/**
 * samples: one channel; sr: its sample rate.
 * → { bpm, period (s between beats), phase (s, the first beat), duration (s), peaks (for drawing),
 *     energy (per step, for finding the loud parts) }
 */
export function findBeat(samples, sr) {
  const { env, loud, step } = onsets(samples, sr)
  // the tempo: the lag at which the hits repeat best, leaning towards 90–150 bpm (a song that's
  // really at 70 also hits at 140, and 140 is the one that feels right for cutting to)
  const minLag = Math.floor(60 / 185 / HOP)
  const maxLag = Math.ceil(60 / 65 / HOP)
  let lag = 0
  let top = -1
  for (let L = minLag; L <= maxLag; L++) {
    let s = 0
    for (let i = 0; i + L < env.length; i++) s += env[i] * env[i + L]
    const bpm = 60 / (L * HOP)
    s *= Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.6) ** 2)
    if (s > top) {
      top = s
      lag = L
    }
  }
  // fine-tune over the whole song
  let best = { score: -1, phase: 0, period: lag }
  for (let p = lag - 1; p <= lag + 1; p += 0.02) {
    const c = comb(env, p)
    if (c.score > best.score) best = { ...c, period: p }
  }
  for (let p = best.period - 0.02; p <= best.period + 0.02; p += 0.002) {
    const c = comb(env, p)
    if (c.score > best.score) best = { ...c, period: p }
  }
  const period = best.period * step
  // a waveform to draw (the loudest moment of each slice)
  const peaks = new Float32Array(240)
  const per = samples.length / peaks.length
  for (let i = 0; i < peaks.length; i++) {
    let m = 0
    for (let k = Math.floor(i * per), end = Math.floor((i + 1) * per); k < end; k += 16) m = Math.max(m, Math.abs(samples[k]))
    peaks[i] = m
  }
  const top1 = Math.max(...peaks) || 1
  for (let i = 0; i < peaks.length; i++) peaks[i] /= top1
  return { bpm: 60 / period, period, phase: best.phase * step, step, duration: samples.length / sr, peaks, energy: loud }
}

/** The beat nearest to t (seconds into the song). */
export function snap(beat, t) {
  const k = Math.max(0, Math.round((t - beat.phase) / beat.period))
  return beat.phase + k * beat.period
}

/**
 * Where the film might start: where the song kicks in — a beat after which it gets loud (the
 * chorus, the drop), with enough song left for the film if it can.
 */
export function suggestStart(beat, length) {
  const { energy, period, duration } = beat
  const mean = (a, b) => {
    const i = Math.max(0, Math.floor(a / beat.step))
    const j = Math.min(energy.length, Math.floor(b / beat.step))
    let s = 0
    for (let k = i; k < j; k++) s += energy[k]
    return j > i ? s / (j - i) : 0
  }
  const latest = Math.max(0, Math.min(duration - length, duration * 0.6))
  // a real rise only (louder by a sixth or so), or from the top
  let best = snap(beat, 0)
  let top = 0.15
  for (let t = snap(beat, 8 * period); t <= latest; t += period) {
    const score = mean(t, t + 16 * period) - mean(t - 8 * period, t)
    if (score > top) {
      top = score
      best = t
    }
  }
  return best
}

/** A song file → its decoded audio and its beat. */
export async function readSong(file, ctx) {
  const buffer = await ctx.decodeAudioData(await file.arrayBuffer())
  // one channel is enough to hear the beat
  const mono = new Float32Array(buffer.length)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c)
    for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / buffer.numberOfChannels
  }
  return { buffer, beat: findBeat(mono, buffer.sampleRate) }
}
