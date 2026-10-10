// The forms the particles take, one per slide. Every particle stands for a slice of the chat
// (particle k ≈ message k·total/N), so it carries its sender's colour from shape to shape.
//
// Each shape returns { pos, col, spin } for N particles: target positions (world units, about
// ±1.5 wide and ±2.4 tall to fit a 9:16 frame), colours (linear RGB), and how fast each one turns
// around the vertical axis (radians/s) once it has arrived.

export const PALETTE = [
  [0.95, 0.68, 0.32], // gold
  [0.48, 0.64, 1.0], // cool blue
  [0.92, 0.5, 0.55],
  [0.45, 0.85, 0.66],
  [0.86, 0.8, 0.45],
  [0.7, 0.58, 0.95],
  [0.9, 0.6, 0.82],
  [0.5, 0.82, 0.9],
]
export const CREAM = [1.0, 0.93, 0.82]

export function rng(seed = 1) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const gauss = (r) => (r() + r() + r() + r() - 2) / 2

function make(N) {
  return { pos: new Float32Array(N * 3), col: new Float32Array(N * 3), spin: new Float32Array(N) }
}
function put(s, k, x, y, z, c, spin = 0, bright = 1) {
  s.pos[k * 3] = x
  s.pos[k * 3 + 1] = y
  s.pos[k * 3 + 2] = z
  s.col[k * 3] = c[0] * bright
  s.col[k * 3 + 1] = c[1] * bright
  s.col[k * 3 + 2] = c[2] * bright
  s.spin[k] = spin
}

/** Who each particle belongs to (index into people, capped to the palette). */
export function authors(S, N) {
  const a = new Uint8Array(N)
  const total = S.sequence.length
  for (let k = 0; k < N; k++) a[k] = Math.min(S.sequence[Math.floor((k / N) * total)], PALETTE.length - 1)
  return a
}

// — the opening: a loose nebula everything comes out of —
export function nebula(N, A, seed = 1) {
  const r = rng(seed)
  const s = make(N)
  for (let k = 0; k < N; k++) {
    const u = r() * Math.PI * 2
    const v = Math.acos(2 * r() - 1)
    const d = 2.5 + r() * 4
    put(s, k, Math.sin(v) * Math.cos(u) * d, Math.cos(v) * d * 1.3, Math.sin(v) * Math.sin(u) * d - 2, PALETTE[A[k]], 0.05, 0.4)
  }
  return s
}

// — 1. the chat's DNA: one strand per person, messages in order from bottom to top —
export function helix(N, A, people, seed = 2) {
  const r = rng(seed)
  const s = make(N)
  const strands = Math.min(people, 6)
  const turns = 3.2
  for (let k = 0; k < N; k++) {
    const u = k / N
    const y = -2.3 + 4.6 * u
    if (r() < 0.07 && strands >= 2) {
      // the rungs between the strands
      const rung = Math.floor(u * turns * 10) / (turns * 10)
      const a0 = rung * turns * Math.PI * 2
      const t = r()
      const x0 = Math.cos(a0) * 0.85
      const z0 = Math.sin(a0) * 0.85
      const a1 = a0 + (Math.PI * 2) / strands
      put(s, k, x0 + (Math.cos(a1) * 0.85 - x0) * t, -2.3 + 4.6 * rung, z0 + (Math.sin(a1) * 0.85 - z0) * t, CREAM, 0.35, 0.35)
      continue
    }
    const strand = A[k] % strands
    const a = u * turns * Math.PI * 2 + (strand / strands) * Math.PI * 2
    const rad = 0.85 + gauss(r) * 0.05
    put(s, k, Math.cos(a) * rad + gauss(r) * 0.03, y + gauss(r) * 0.03, Math.sin(a) * rad + gauss(r) * 0.03, PALETTE[A[k]], 0.35)
  }
  return s
}

// — 2. it all began with one message: everything collapses to a single point of light —
export function spark(N, A, firstAuthor, seed = 3) {
  const r = rng(seed)
  const s = make(N)
  const c = PALETTE[Math.min(firstAuthor, PALETTE.length - 1)]
  for (let k = 0; k < N; k++) {
    const q = r()
    if (q < 0.55) {
      const d = Math.abs(gauss(r)) * 0.12
      const u = r() * Math.PI * 2
      const v = Math.acos(2 * r() - 1)
      put(s, k, Math.sin(v) * Math.cos(u) * d, Math.cos(v) * d, Math.sin(v) * Math.sin(u) * d, q < 0.3 ? CREAM : c, 0, 0.9)
    } else if (q < 0.9) {
      // a thin ring around it, tilted
      const a = r() * Math.PI * 2
      const rad = 1.15 + gauss(r) * 0.03
      const x = Math.cos(a) * rad
      const z = Math.sin(a) * rad
      put(s, k, x, z * 0.28 + gauss(r) * 0.01, z, PALETTE[A[k]], 0.5, 0.6)
    } else {
      // dust far around
      const a = r() * Math.PI * 2
      const d = 1.6 + r() * 2.5
      put(s, k, Math.cos(a) * d, gauss(r) * 2, Math.sin(a) * d - 1, PALETTE[A[k]], 0.08, 0.25)
    }
  }
  return s
}

// sample filled pixels of something drawn on a canvas
function sample(draw, w, h, step = 2) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })
  draw(g, w, h)
  const d = g.getImageData(0, 0, w, h).data
  const pts = []
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4
      if (d[i + 3] > 140) pts.push(x, y, d[i] / 255, d[i + 1] / 255, d[i + 2] / 255)
    }
  }
  return pts
}

/** Text made of particles, scaled so the ink spans `width` world units. */
export function words(N, A, str, { width = 2.9, font = '300 220px Fraunces', seed = 4, spin = 0, colors = null } = {}) {
  const r = rng(seed)
  const s = make(N)
  const W = 1600
  const H = 400
  const pts = sample((g) => {
    g.font = font
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = '#fff'
    const m = g.measureText(str).width
    const sc = Math.min(1, (W * 0.94) / m)
    g.translate(W / 2, H / 2)
    g.scale(sc, sc)
    g.fillText(str, 0, 0)
  }, W, H, 1)
  const n = pts.length / 5
  // the ink's own extent, so short words and long numbers both fill the frame
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (let i = 0; i < pts.length; i += 5) {
    x0 = Math.min(x0, pts[i])
    x1 = Math.max(x1, pts[i])
    y0 = Math.min(y0, pts[i + 1])
    y1 = Math.max(y1, pts[i + 1])
  }
  const scale = width / Math.max(1, x1 - x0)
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  // many particles on few pixels would burn white: fainter the more they crowd
  const bright = Math.min(1, (2.5 * n) / N)
  for (let k = 0; k < N; k++) {
    if (!n) {
      put(s, k, 0, 0, 0, CREAM, 0, 0)
      continue
    }
    const i = Math.floor(r() * n) * 5
    const x = (pts[i] - cx + r() - 0.5) * scale
    const y = -(pts[i + 1] - cy + r() - 0.5) * scale
    put(s, k, x, y, gauss(r) * 0.06, colors ? colors[A[k]] : PALETTE[A[k]], spin, bright)
  }
  return s
}

// — 3. two planets, sized by how much each one says, circling each other —
export function orbs(N, A, shares, seed = 5) {
  const r = rng(seed)
  const s = make(N)
  const n = shares.length
  const centres = shares.map((_, i) => {
    if (n === 2) return i === 0 ? [-0.5, 0.62, 0] : [0.5, -0.62, 0]
    const a = (i / n) * Math.PI * 2
    return [Math.cos(a) * 1.0, Math.sin(a) * 1.0, 0]
  })
  for (let k = 0; k < N; k++) {
    const i = Math.min(A[k], n - 1)
    const R = 0.15 + 0.6 * Math.cbrt(shares[i]) * (n > 2 ? 0.7 : 1)
    const u = r() * Math.PI * 2
    const v = Math.acos(2 * r() - 1)
    // mostly on the surface, some inside: a glowing shell
    const d = R * (r() < 0.7 ? 1 + gauss(r) * 0.02 : Math.cbrt(r()))
    const [cx, cy, cz] = centres[i]
    put(s, k, cx + Math.sin(v) * Math.cos(u) * d, cy + Math.cos(v) * d, cz + Math.sin(v) * Math.sin(u) * d, PALETTE[A[k]], 0.45)
  }
  return s
}

// — 4. who reaches out: a stream of light flows from the one who opens most conversations —
export function bridge(N, A, shares, starter, seed = 6) {
  const r = rng(seed)
  const s = orbs(N, A, shares.map((x) => x * 0.55), seed)
  const from = starter === 0 ? [-0.5, 0.62, 0] : [0.5, -0.62, 0]
  const to = starter === 0 ? [0.5, -0.62, 0] : [-0.5, 0.62, 0]
  const c = PALETTE[Math.min(starter, PALETTE.length - 1)]
  for (let k = 0; k < N; k++) {
    if (r() > 0.42) continue
    const t = r()
    // an arc that bows out towards the viewer
    const x = from[0] + (to[0] - from[0]) * t
    const y = from[1] + (to[1] - from[1]) * t + Math.sin(Math.PI * t) * 0.9
    const z = Math.sin(Math.PI * t) * 0.8
    const w = 0.04 + 0.05 * Math.sin(Math.PI * t)
    put(s, k, x + gauss(r) * w, y + gauss(r) * w, z + gauss(r) * w, c, 0.18, 0.9)
  }
  return s
}

// — 5. reply speed: one ring each; the quicker one spins faster —
export function rings(N, A, speeds, seed = 7) {
  const r = rng(seed)
  const s = make(N)
  const n = speeds.length
  for (let k = 0; k < N; k++) {
    const i = Math.min(A[k], n - 1)
    const R = 0.75 + i * 0.5
    const a = r() * Math.PI * 2
    const tube = 0.06
    const x = Math.cos(a) * (R + gauss(r) * tube)
    const z = Math.sin(a) * (R + gauss(r) * tube)
    // tilted, so you see them as ellipses
    const tilt = 0.32 + i * 0.12
    put(s, k, x, z * Math.sin(tilt) + gauss(r) * tube * 0.6 + (i - (n - 1) / 2) * 0.35, z * Math.cos(tilt), PALETTE[A[k]], speeds[i])
  }
  return s
}

// — 6. the hours: twenty-four pillars of light in a circle —
export function pillars(N, A, hours, peak, seed = 8) {
  const r = rng(seed)
  const s = make(N)
  const max = Math.max(...hours, 1)
  const weights = hours.map((h) => 0.04 + h / max)
  const sum = weights.reduce((a, b) => a + b, 0)
  for (let k = 0; k < N; k++) {
    // pick an hour in proportion to its height, so tall pillars are as dense as short ones
    let pick = r() * sum
    let h = 0
    while (h < 23 && pick > weights[h]) pick -= weights[h++]
    const height = 0.04 + 1.5 * (hours[h] / max)
    const a = (h / 24) * Math.PI * 2 - Math.PI / 2
    const x = Math.cos(a) * 0.82 + gauss(r) * 0.035
    const z = Math.sin(a) * 0.82 + gauss(r) * 0.035
    const c = h === peak ? PALETTE[0] : r() < 0.5 ? CREAM : PALETTE[A[k]]
    put(s, k, x, -0.75 + r() * height, z, c, 0.22, h === peak ? 1.2 : 0.6)
  }
  return s
}

// — 7. a year as a landscape: one ridge per month, rising with each day's messages —
export function terrain(N, A, calendar, busiest, seed = 9) {
  const r = rng(seed)
  const s = make(N)
  const months = []
  for (const d of calendar) {
    const key = d.date.getFullYear() * 12 + d.date.getMonth()
    let m = months[months.length - 1]
    if (!m || m.key !== key) months.push((m = { key, days: new Array(31).fill(0) }))
    m.days[d.date.getDate() - 1] = d.n
  }
  const rows = months.slice(-12)
  const max = Math.max(...calendar.map((d) => d.n), 1)
  const bKey = busiest.date.getFullYear() * 12 + busiest.date.getMonth()
  const bDay = busiest.date.getDate() - 1
  const height = (row, x) => {
    // smooth between days so the ridges flow
    const i = Math.floor(x)
    const f = x - i
    const a = rows[row].days[Math.min(30, i)]
    const b = rows[row].days[Math.min(30, i + 1)]
    const sm = f * f * (3 - 2 * f)
    return Math.sqrt((a + (b - a) * sm) / max)
  }
  for (let k = 0; k < N; k++) {
    const row = Math.floor(r() * rows.length)
    const x = r() * 30
    const h = height(row, x)
    const px = (x / 30 - 0.5) * 2.0
    const pz = (row / Math.max(1, rows.length - 1) - 0.5) * 2.0
    const peak = rows[row].key === bKey && Math.abs(x - bDay) < 0.6
    put(s, k, px, -0.5 + h * 0.75 + gauss(r) * 0.008, pz, peak ? PALETTE[0] : PALETTE[A[k]], 0.06, peak ? 1.6 : 0.35 + 0.65 * h)
  }
  return s
}

// — 8. the favourite emoji, redrawn in particles with its own colours —
export function emoji(N, A, char, seed = 10) {
  const r = rng(seed)
  const s = make(N)
  const SIZE = 420
  const pts = sample((g) => {
    g.font = `${SIZE * 0.82}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(char, SIZE / 2, SIZE / 2 + SIZE * 0.04)
  }, SIZE, SIZE, 2)
  const n = pts.length / 5
  const scale = 2.4 / SIZE
  for (let k = 0; k < N; k++) {
    if (!n) {
      put(s, k, 0, 0, 0, CREAM, 0, 0)
      continue
    }
    const i = Math.floor(r() * n) * 5
    const lin = (v) => Math.pow(v, 2.2) // the canvas gives sRGB; the particles add up in linear light
    const x = (pts[i] - SIZE / 2 + r() * 2) * scale
    const y = -(pts[i + 1] - SIZE / 2 + r() * 2) * scale
    // a thin slab with a little bulge: the camera's sway shows its depth (turning it would
    // separate front from back and double the picture)
    const z = Math.sqrt(Math.max(0, 1 - (x * x + y * y) / 1.5)) * 0.12 + gauss(r) * 0.02
    put(s, k, x, y, z, [lin(pts[i + 2]) * 1.2, lin(pts[i + 3]) * 1.2, lin(pts[i + 4]) * 1.2], 0, 0.8)
  }
  return s
}

// — 9. the end: a galaxy of everything —
export function galaxy(N, A, seed = 11) {
  const r = rng(seed)
  const s = make(N)
  for (let k = 0; k < N; k++) {
    const q = Math.pow(r(), 0.8)
    const arm = Math.floor(r() * 2) * Math.PI
    const rad = 0.06 + q * 1.15
    const a = arm + Math.log(0.06 + q) * 2.1 + gauss(r) * (0.25 + q * 0.4)
    const core = r() < 0.18
    const x = core ? gauss(r) * 0.22 : Math.cos(a) * rad
    const z = core ? gauss(r) * 0.22 : Math.sin(a) * rad
    put(s, k, x, gauss(r) * (core ? 0.12 : 0.04), z, core ? CREAM : PALETTE[A[k]], 0.2, core ? 0.9 : 0.75)
  }
  return s
}
