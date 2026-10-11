// The sculptures the bubbles build, one per slide. Every bubble stands for a slice of the chat
// (bubble k ≈ message k·total/N), so it carries its sender's colour from sculpture to sculpture.
//
// Each shape returns, for N bubbles:
//   pos   where it sits (world units; the floor is y = 0, sculptures about 2.6 wide)
//   rot   its orientation (Euler x, y, z): 0,0,0 faces the camera; x = −π/2 lies flat
//   scl   its size (x, y, z); a bubble is 1 unit wide at scale 1, BUBBLE_DEPTH thick; 0 hides it
//   col   its colour (linear RGB)
//   spin  how fast it turns about the vertical axis through the middle (radians/s)

import { linear } from '../theme.js'
import { BUBBLE_DEPTH } from './bubble.js'

// the people's colours and the theme's light: set from the theme before a story is built
export const PALETTE = []
export const CREAM = [1, 1, 1]
export function usePalette(theme) {
  PALETTE.length = 0
  for (const hex of theme.people) {
    // a lit neon (that lime) burns white: cap how bright a colour can be
    const c = linear(hex)
    const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    const k = Math.min(1, 0.42 / lum)
    PALETTE.push(c.map((v) => v * k))
  }
  // duos have two colours; give everyone else in a group a colour too
  while (PALETTE.length < 8) PALETTE.push(PALETTE[PALETTE.length % 2])
  CREAM.splice(0, 3, ...linear(theme.ink))
}

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
const FLAT = -Math.PI / 2

function make(N) {
  return { N, pos: new Float32Array(N * 3), rot: new Float32Array(N * 3), scl: new Float32Array(N * 3), col: new Float32Array(N * 3), spin: new Float32Array(N) }
}
/** o: { rx, ry, rz, size, thick (scales the depth only), bright, spin } */
function put(s, k, x, y, z, c, o = {}) {
  const size = o.size ?? 0.1
  const b = o.bright ?? 1
  s.pos.set([x, y, z], k * 3)
  s.rot.set([o.rx ?? 0, o.ry ?? 0, o.rz ?? 0], k * 3)
  s.scl.set([size, size, size * (o.thick ?? 1)], k * 3)
  s.col.set([c[0] * b, c[1] * b, c[2] * b], k * 3)
  s.spin[k] = o.spin ?? 0
}
// sent and received: the second person's bubbles face the other way round (tail left)
const face = (a) => (a % 2 ? Math.PI : 0)

/** Who each bubble belongs to (index into people, capped to the palette). */
export function authors(S, N) {
  const a = new Uint8Array(N)
  const total = S.sequence.length
  for (let k = 0; k < N; k++) a[k] = Math.min(S.sequence[Math.floor((k / N) * total)], PALETTE.length - 1)
  return a
}

// bubbles a sculpture doesn't need lie scattered on the floor around it, fading into the dark
function scatter(s, k, r, A, { from = 2.2, to = 6 } = {}) {
  const a = r() * Math.PI * 2
  const d = from + Math.pow(r(), 0.7) * (to - from)
  // never right in front of the lens
  const z = Math.sin(a) * d - 1
  put(s, k, Math.cos(a) * d, 0.012, z > 1 ? 2 - z : z, PALETTE[A[k]], { rx: FLAT, rz: r() * Math.PI * 2, size: 0.12 + r() * 0.06, bright: 0.55 })
}

// — the opening: a cloud high above, which rains down into the first sculpture —
export function nebula(N, A, seed = 1) {
  const r = rng(seed)
  const s = make(N)
  for (let k = 0; k < N; k++) {
    const a = r() * Math.PI * 2
    const d = Math.sqrt(r()) * 4
    put(s, k, Math.cos(a) * d, 5 + r() * 6, Math.sin(a) * d - 1, PALETTE[A[k]], { rx: r() * 6, ry: r() * 6, size: 0.1, spin: 0.05 })
  }
  return s
}

// fill a region with a lattice: cells(c) lists [x, y, z] for spacing c; find the c that gives
// about `want` cells
function lattice(cells, want, lo = 0.005, hi = 0.6) {
  let best = cells(hi)
  for (let i = 0; i < 22; i++) {
    const c = Math.sqrt(lo * hi)
    const got = cells(c)
    if (got.length > want) lo = c
    else {
      hi = c
      best = got
    }
  }
  return { list: best, c: hi }
}

// — the cover for a couple: a heart, split where the chat splits (left: the one who talks more) —
export function heart(N, A, seed = 12) {
  const r = rng(seed)
  const s = make(N)
  const inside = (x, y) => (x * x + y * y - 1) ** 3 - x * x * y ** 3 < 0
  const half = (x, y) => 0.5 * Math.sqrt(Math.max(0, 1 - (x * x + (y - 0.25) ** 2) / 1.9))
  const { list, c } = lattice((c) => {
    const out = []
    for (let y = -1.15; y < 1.3; y += c * 0.66) {
      for (let x = -1.25; x < 1.25; x += c) {
        if (!inside(x, y)) continue
        const d = half(x, y)
        // only the skin: inside bubbles would never be seen
        for (let z = -d; z <= d + 1e-6; z += c * 0.8) if (Math.abs(z) > d - c * 1.2 || !inside(x - c, y) || !inside(x + c, y) || !inside(x, y + c) || !inside(x, y - c)) out.push([x, y, z])
      }
    }
    return out
  }, N * 0.94)
  list.sort((a, b) => a[0] - b[0])
  // bubbles in order of author, so person 0 fills the left part, as much of it as they wrote
  const order = Array.from({ length: N }, (_, k) => k).sort((a, b) => A[a] - A[b] || a - b)
  const sc = 1.15
  order.forEach((k, i) => {
    if (i >= list.length) return scatter(s, k, r, A)
    const [x, y, z] = list[i]
    put(s, k, x * sc, 1.45 + y * sc, z * sc, PALETTE[A[k] ? 1 : 0], {
      ry: face(A[k]) + gauss(r) * 0.25, rx: gauss(r) * 0.25, rz: gauss(r) * 0.3, size: c * sc * 1.25, spin: 0.07,
    })
  })
  return s
}

// — the cover for everyone else: the chat's DNA, one strand per person, oldest at the bottom —
export function helix(N, A, people, seed = 2) {
  const r = rng(seed)
  const s = make(N)
  const strands = Math.min(people, 6)
  const turns = 2.6
  for (let k = 0; k < N; k++) {
    const u = k / N
    if (r() < 0.08 && strands >= 2) {
      // the rungs between the strands, lying flat
      const rung = Math.floor(u * turns * 8) / (turns * 8)
      const a0 = rung * turns * Math.PI * 2
      const a1 = a0 + (Math.PI * 2) / strands
      const t = r()
      const x = Math.cos(a0) * 0.7 + (Math.cos(a1) - Math.cos(a0)) * 0.7 * t
      const z = Math.sin(a0) * 0.7 + (Math.sin(a1) - Math.sin(a0)) * 0.7 * t
      put(s, k, x, 0.25 + 2.5 * rung, z, CREAM, { rx: FLAT, rz: -a0, size: 0.09, bright: 0.8, spin: 0.35 })
      continue
    }
    const a = u * turns * Math.PI * 2 + ((A[k] % strands) / strands) * Math.PI * 2
    const rad = 0.7 + gauss(r) * 0.07
    // facing outwards from the axis
    put(s, k, Math.cos(a) * rad, 0.25 + 2.5 * u + gauss(r) * 0.05, Math.sin(a) * rad, PALETTE[A[k]], {
      ry: Math.PI / 2 - a + face(A[k]), rx: gauss(r) * 0.3, size: 0.12, spin: 0.35,
    })
  }
  return s
}

// — it all began with one message: one big bubble, everything else lying quiet on the floor —
export function spark(N, A, firstAuthor, seed = 3) {
  const r = rng(seed)
  const s = make(N)
  const who = Math.min(firstAuthor, PALETTE.length - 1)
  put(s, 0, 0, 1.55, 0, PALETTE[who], { ry: face(who), size: 1.25 })
  for (let k = 1; k < N; k++) scatter(s, k, r, A, { from: 1.1, to: 6.5 })
  return s
}

// the inked pixels of something drawn on a canvas, in a grid with cells `step` pixels apart
function inked(draw, w, h) {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d', { willReadFrequently: true })
  draw(g, w, h)
  const d = g.getImageData(0, 0, w, h).data
  let x0 = w
  let x1 = 0
  let y0 = h
  let y1 = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 140) {
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
        y0 = Math.min(y0, y)
        y1 = Math.max(y1, y)
      }
    }
  }
  const at = (x, y) => {
    const i = (Math.round(y) * w + Math.round(x)) * 4
    return d[i + 3] > 140 ? [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255] : null
  }
  return { at, x0, x1, y0, y1 }
}

/** Words made of bubbles, two deep, standing on the floor; the ink spans `width` units. */
export function words(N, A, str, { width = 2.6, seed = 4 } = {}) {
  const r = rng(seed)
  const s = make(N)
  const ink = inked((g, w, h) => {
    g.font = '800 220px "Bricolage Grotesque"'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = '#fff'
    const sc = Math.min(1, (w * 0.94) / g.measureText(str).width)
    g.translate(w / 2, h / 2)
    g.scale(sc, sc)
    g.fillText(str, 0, 0)
  }, 1600, 400)
  const scale = width / Math.max(1, ink.x1 - ink.x0)
  const LAYERS = 2
  const { list, c } = lattice((c) => {
    const out = []
    const step = c / scale
    for (let y = ink.y0; y <= ink.y1; y += step * 0.7) {
      for (let x = ink.x0; x <= ink.x1; x += step) if (ink.at(x, y)) for (let l = 0; l < LAYERS; l++) out.push([(x - (ink.x0 + ink.x1) / 2) * scale, (ink.y1 - y) * scale, -l * c * 0.9])
    }
    return out
  }, N * 0.9)
  for (let k = 0; k < N; k++) {
    if (k >= list.length) {
      scatter(s, k, r, A)
      continue
    }
    const [x, y, z] = list[k]
    put(s, k, x, 0.06 + y, z, PALETTE[A[k]], { ry: face(A[k]) + gauss(r) * 0.2, rx: gauss(r) * 0.2, rz: gauss(r) * 0.2, size: c * 1.35 })
  }
  // in message order the colours would come out in bands: shuffle who goes where
  shuffle(s, r, list.length)
  return s
}

// swap the first n bubbles' places at random (their colours stay with them)
function shuffle(s, r, n) {
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    for (const key of ['pos', 'rot', 'scl']) {
      const a = s[key]
      for (let q = 0; q < 3; q++) [a[i * 3 + q], a[j * 3 + q]] = [a[j * 3 + q], a[i * 3 + q]]
    }
  }
}

// a pile of flat bubbles: layers of `per` around a small circle, each layer turned a little
function pile(s, k, i, { x, z, per, size, thick, c, bright = 1, spin = 0, radius }) {
  const layer = Math.floor(i / per)
  const j = i % per
  const a = (j / per) * Math.PI * 2 + layer * 0.5
  const rad = radius ?? (per > 1 ? size * 0.42 : 0)
  put(s, k, x + Math.cos(a) * rad, BUBBLE_DEPTH * size * thick * (layer + 0.5), z + Math.sin(a) * rad, c, { rx: FLAT, rz: -a, size, thick, bright, spin })
}

/** Towers of bubbles, one per person (shares), heights by how much they wrote. */
export function orbs(N, A, shares, seed = 5) {
  const r = rng(seed)
  const s = make(N)
  const n = shares.length
  const counts = new Array(n).fill(0)
  for (let k = 0; k < N; k++) if (A[k] < n) counts[A[k]]++
  const max = Math.max(...counts, 1)
  const size = n > 2 ? 0.2 : 0.26
  const per = n > 2 ? 5 : 11
  // the tallest tower is 2 high
  const thick = Math.min(1.4, 2 / ((max / per) * BUBBLE_DEPTH * size))
  const gap = n > 2 ? 0.5 : 1.1
  const seen = new Array(n).fill(0)
  for (let k = 0; k < N; k++) {
    const i = A[k]
    if (i >= n) {
      scatter(s, k, r, A)
      continue
    }
    pile(s, k, seen[i]++, { x: (i - (n - 1) / 2) * gap, z: 0, per, size, thick, c: PALETTE[i], spin: 0.12, radius: size * (per > 6 ? 0.75 : 0.5) })
  }
  return s
}

// — who says hello first: the two towers, and a stream of the starter's bubbles arching over —
export function bridge(N, A, shares, starter, seed = 6) {
  const r = rng(seed)
  const s = orbs(N, A, shares, seed)
  const tops = [0, 1].map((i) => {
    let top = 0
    for (let k = 0; k < N; k++) if (A[k] === i) top = Math.max(top, s.pos[k * 3 + 1])
    return top
  })
  const fromX = starter === 0 ? -0.55 : 0.55
  const c = PALETTE[Math.min(starter, PALETTE.length - 1)]
  const peak = Math.max(...tops) + 0.55
  for (let k = 0; k < N; k++) {
    if (A[k] > 1 || r() > 0.22) continue
    const t = r()
    const x = fromX + (-2 * fromX) * t
    const base = tops[starter] + (tops[1 - starter] - tops[starter]) * t
    const y = base + (peak - base) * Math.sin(Math.PI * t) + gauss(r) * 0.06
    const slope = Math.atan2(Math.cos(Math.PI * t) * (peak - base) * Math.PI, -2 * fromX)
    put(s, k, x, y, gauss(r) * 0.08, c, { rz: slope + gauss(r) * 0.2, ry: face(starter) + gauss(r) * 0.3, size: 0.13, spin: 0.12 })
  }
  return s
}

// — reply speed: one ring per person around a pole, turning as fast as they reply —
export function rings(N, A, speeds, seed = 7) {
  const r = rng(seed)
  const s = make(N)
  const n = Math.min(speeds.length, 4)
  for (let k = 0; k < N; k++) {
    const i = A[k]
    if (i >= n) {
      scatter(s, k, r, A)
      continue
    }
    const a = r() * Math.PI * 2
    const rad = 0.55 + i * 0.32 + gauss(r) * 0.05
    put(s, k, Math.cos(a) * rad, 0.5 + i * 0.5 + gauss(r) * 0.05, Math.sin(a) * rad, PALETTE[i], {
      ry: Math.PI / 2 - a + face(i), rx: gauss(r) * 0.2, size: 0.11, spin: speeds[i] * 0.9,
    })
  }
  return s
}

/** Split N bubbles among buckets in proportion to counts; returns, per bubble, its bucket or −1. */
function share(N, counts) {
  const total = counts.reduce((a, b) => a + b, 0) || 1
  const quota = counts.map((c) => Math.floor((c / total) * N))
  const out = new Int16Array(N).fill(-1)
  let k = 0
  quota.forEach((q, b) => {
    for (let i = 0; i < q; i++) out[k++] = b
  })
  return { of: out, quota }
}

// — the hours: 24 pillars in a curve facing you, midnight on the left, the busiest one lit —
export function pillars(N, A, hours, peak, seed = 8) {
  const r = rng(seed)
  const s = make(N)
  const { of, quota } = share(N, hours)
  const size = 0.1
  const thick = Math.min(3, 1.9 / (Math.max(...quota, 1) * BUBBLE_DEPTH * size))
  const seen = new Array(24).fill(0)
  const spot = (h) => {
    const a = (h / 23 - 0.5) * 1.7
    return { x: Math.sin(a) * 1.4, z: -Math.cos(a) * 1.4 + 0.9 }
  }
  let marker = 0
  for (let k = 0; k < N; k++) {
    const h = of[k]
    if (h < 0) {
      // a mark on the floor for every hour, even the quiet ones
      if (marker < 24) {
        const { x, z } = spot(marker)
        put(s, k, x, 0.01, z + 0.16, CREAM, { rx: FLAT, size: 0.07, bright: marker++ === peak ? 1 : 0.35 })
      } else scatter(s, k, r, A, { from: 2.6 })
      continue
    }
    pile(s, k, seen[h]++, { ...spot(h), per: 1, size, thick, c: PALETTE[A[k]], bright: h === peak ? 1.3 : 0.7, spin: 0 })
  }
  return s
}

// — every day: a city, one block per day of the last year, as tall as the day was busy —
export function terrain(N, A, calendar, busiest, seed = 9) {
  const r = rng(seed)
  const s = make(N)
  const days = calendar.slice(-53 * 7)
  const { of, quota } = share(N, days.map((d) => d.n))
  const cell = 0.085
  const size = cell * 0.95
  const thick = Math.min(2.5, 0.85 / (Math.max(...quota, 1) * BUBBLE_DEPTH * size))
  const first = days[0]?.date.getDay() ?? 0
  const weeks = Math.ceil((days.length + first) / 7)
  const seen = new Int32Array(days.length)
  for (let k = 0; k < N; k++) {
    const d = of[k]
    if (d < 0) {
      scatter(s, k, r, A, { from: 2.8 })
      continue
    }
    const slot = d + first
    const peak = days[d] === busiest
    pile(s, k, seen[d]++, { x: (Math.floor(slot / 7) - weeks / 2) * cell, z: ((slot % 7) - 3) * cell, per: 1, size, thick, c: PALETTE[A[k]], bright: peak ? 1.5 : 0.8 })
  }
  return s
}

// — the favourite emoji, as a mosaic of bubbles —
export function emoji(N, A, char, seed = 10) {
  const SIZE = 400
  return mosaic(N, A, inked((g) => {
    g.font = `${SIZE * 0.82}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(char, SIZE / 2, SIZE / 2 + SIZE * 0.04)
  }, SIZE, SIZE), seed)
}

// — the favourite sticker, the same way (img: a square canvas, see media.js) —
// (a little smaller than the emoji, and its whites kept from glowing: stickers are mostly white)
export function sticker(N, A, img, seed = 20) {
  return mosaic(N, A, inked((g, w, h) => g.drawImage(img, 0, 0, w, h), 400, 400), seed, { width: 2.0, height: 2.0, light: 0.42 })
}

// a picture's inked pixels as a domed wall of bubbles standing on the floor
// (width, unless that makes a tall picture taller than height; light: the most a colour may shine)
function mosaic(N, A, ink, seed, { width = 2.3, height = 2.5, light = Infinity } = {}) {
  const r = rng(seed)
  const s = make(N)
  const scale = Math.min(width / Math.max(1, ink.x1 - ink.x0), height / Math.max(1, ink.y1 - ink.y0))
  const lin = (v) => Math.pow(v, 2.2)
  const { list, c } = lattice((c) => {
    const out = []
    const step = c / scale
    for (let y = ink.y0; y <= ink.y1; y += step * 0.68) {
      for (let x = ink.x0; x <= ink.x1; x += step) {
        const px = ink.at(x, y)
        if (px) out.push([(x - (ink.x0 + ink.x1) / 2) * scale, (ink.y1 - y) * scale, px])
      }
    }
    return out
  }, N * 0.95)
  for (let k = 0; k < N; k++) {
    if (k >= list.length) {
      scatter(s, k, r, A)
      continue
    }
    const [x, y, px] = list[k]
    // a dome, so it has a body
    const dome = Math.sqrt(Math.max(0, 1 - (x * x + (y - 1.15) ** 2) / 1.4)) * 0.35
    let col = [lin(px[0]), lin(px[1]), lin(px[2])]
    const lum = 0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2]
    if (lum > light) col = col.map((v) => (v * light) / lum)
    put(s, k, x, 0.45 + y, dome + gauss(r) * 0.02, col, { ry: gauss(r) * 0.15, rx: gauss(r) * 0.15, size: c * 1.3, bright: 1.1 })
  }
  return s
}

// — everything at once: a slow whirlpool of every message, floating over the floor —
export function galaxy(N, A, seed = 11) {
  const r = rng(seed)
  const s = make(N)
  for (let k = 0; k < N; k++) {
    const q = Math.pow(r(), 0.8)
    const arm = Math.floor(r() * 2) * Math.PI
    const rad = 0.1 + q * 1.55
    const a = arm + Math.log(0.08 + q) * 2.1 + gauss(r) * (0.2 + q * 0.35)
    const core = r() < 0.12
    const x = core ? gauss(r) * 0.3 : Math.cos(a) * rad
    const z = core ? gauss(r) * 0.3 : Math.sin(a) * rad
    put(s, k, x, 1.1 + gauss(r) * (core ? 0.18 : 0.06), z, core ? CREAM : PALETTE[A[k]], {
      rx: FLAT + gauss(r) * 0.5, rz: -a, size: core ? 0.1 : 0.08 + r() * 0.05, spin: 0.22,
    })
  }
  return s
}

// — the group's podium, built of the three winners' bubbles, with a crown over the first —
export function podium(N, A, top, seed = 13) {
  const r = rng(seed)
  const s = make(N)
  const steps = [
    { x: 0, h: 1.05 },
    { x: -0.82, h: 0.75 },
    { x: 0.82, h: 0.5 },
  ]
  const size = 0.17
  const cols = 4
  const rows = 3
  const per = cols * rows
  const layerH = BUBBLE_DEPTH * size * 1.4
  const caps = steps.map((st) => Math.floor(st.h / layerH) * per)
  const crown = Math.min(140, Math.floor(N * 0.05))
  let block = 0
  let used = 0
  for (let k = 0; k < N; k++) {
    if (k < crown) {
      const a = (k / crown) * Math.PI * 2
      put(s, k, Math.cos(a) * 0.28, steps[0].h + 0.3 + Math.abs(Math.sin(a * 2.5)) * 0.16, Math.sin(a) * 0.28, CREAM, { ry: Math.PI / 2 - a, size: 0.08, bright: 0.7, spin: 0.7 })
      continue
    }
    while (block < 3 && used >= caps[block]) {
      block++
      used = 0
    }
    if (block >= 3) {
      scatter(s, k, r, A, { from: 2 })
      continue
    }
    const st = steps[block]
    const layer = Math.floor(used / per)
    const j = used % per
    used++
    const x = st.x + ((j % cols) - (cols - 1) / 2) * 0.17
    const z = (Math.floor(j / cols) - (rows - 1) / 2) * 0.17
    put(s, k, x, layerH * (layer + 0.5), z, PALETTE[top[block] ?? block], { rx: FLAT, rz: (layer % 2) * Math.PI, size, thick: 1.4, spin: 0.15 })
  }
  return s
}

// — the landing's emblem: one big chat bubble built of small ones, split by who wrote more —
export function badge(N, A, seed = 14) {
  const r = rng(seed)
  const s = make(N)
  const ink = inked((g, w, h) => {
    const x0 = w * 0.08
    const y0 = h * 0.12
    const bw = w * 0.84
    const bh = h * 0.62
    g.fillStyle = '#fff'
    g.beginPath()
    g.roundRect(x0, y0, bw, bh, bh * 0.36)
    g.fill()
    // the tail, bottom right
    g.beginPath()
    g.moveTo(x0 + bw * 0.74, y0 + bh * 0.8)
    g.quadraticCurveTo(x0 + bw * 0.9, y0 + bh * 1.02, x0 + bw * 1.03, y0 + bh * 1.2)
    g.quadraticCurveTo(x0 + bw * 0.84, y0 + bh * 1.1, x0 + bw * 0.6, y0 + bh * 0.96)
    g.fill()
  }, 600, 420)
  const width = 2.7
  const scale = width / Math.max(1, ink.x1 - ink.x0)
  const cx = (ink.x0 + ink.x1) / 2
  const cy = (ink.y0 + ink.y1) / 2
  const hw = (ink.x1 - ink.x0) / 2
  const hh = (ink.y1 - ink.y0) / 2
  const { list, c } = lattice((c) => {
    const out = []
    const step = c / scale
    for (let y = ink.y0; y <= ink.y1; y += step * 0.66) {
      for (let x = ink.x0; x <= ink.x1; x += step) {
        if (!ink.at(x, y)) continue
        // a soft pillow: thickest in the middle
        const d = 0.34 * Math.sqrt(Math.max(0.05, 1 - ((x - cx) / hw) ** 2 - ((y - cy) / hh) ** 2 * 0.6))
        const px = (x - cx) * scale
        const py = (cy - y) * scale
        out.push([px, py, d], [px, py, -d])
        // fill the rim so it reads as one solid when it turns
        if (!ink.at(x - step, y) || !ink.at(x + step, y) || !ink.at(x, y - step) || !ink.at(x, y + step)) out.push([px, py, 0])
      }
    }
    return out
  }, N * 0.95)
  list.sort((a, b) => a[0] - b[0])
  const order = Array.from({ length: N }, (_, k) => k).sort((a, b) => A[a] - A[b] || a - b)
  order.forEach((k, i) => {
    if (i >= list.length) return scatter(s, k, r, A)
    const [x, y, z] = list[i]
    put(s, k, x, 1.75 + y, z, PALETTE[Math.min(A[k], 1)], {
      ry: face(A[k]) + gauss(r) * 0.2, rx: gauss(r) * 0.2, rz: gauss(r) * 0.25, size: c * 1.3, spin: 0,
    })
  })
  return s
}

// — reading your chat: everything sucked up into a spinning funnel —
export function vortex(N, A, seed = 15) {
  const r = rng(seed)
  const s = make(N)
  for (let k = 0; k < N; k++) {
    const h = Math.pow(r(), 0.8) * 3.4
    const rad = 0.12 + h * 0.42 + gauss(r) * 0.06
    const a = r() * Math.PI * 2
    // faster at the bottom, like a real twister
    put(s, k, Math.cos(a) * rad, 0.15 + h, Math.sin(a) * rad, PALETTE[A[k]], {
      ry: Math.PI / 2 - a, rx: gauss(r) * 0.4, rz: gauss(r) * 0.6, size: 0.1, spin: 3.2 - h * 0.6,
    })
  }
  return s
}

// — reading your chat: everything pressed into one bright ball in the middle —
export function core(N, A, seed = 16) {
  const r = rng(seed)
  const s = make(N)
  for (let k = 0; k < N; k++) {
    const u = r() * Math.PI * 2
    const v = Math.acos(2 * r() - 1)
    const d = 0.46 * Math.cbrt(r())
    put(s, k, Math.sin(v) * Math.cos(u) * d, 1.5 + Math.cos(v) * d, Math.sin(v) * Math.sin(u) * d, PALETTE[A[k]], {
      rx: r() * 6, ry: r() * 6, rz: r() * 6, size: 0.075, spin: 1.1, bright: 1.15,
    })
  }
  return s
}

// — premium: your photo, made of your messages. A wall of bubbles standing on the floor, each one
// a pixel of it; the light parts stand a little forward, so it has a relief —
// photo: a canvas (any size, already cropped to 4:5)
export function portrait(N, A, photo, seed = 17) {
  const r = rng(seed)
  const s = make(N)
  const width = 2.2
  const height = width * 1.25
  // bubbles are wider than tall: rows closer than columns
  const want = Math.floor(N * 0.97)
  const c = Math.sqrt((width * height) / (0.66 * want))
  const cols = Math.floor(width / c)
  const rows = Math.min(Math.floor(want / cols), Math.floor(height / (0.66 * c)))
  // the photo at one pixel per bubble (stepping down in halves, so it's averaged, not aliased)
  let src = photo
  while (src.width / 2 > cols * 2) {
    const half = document.createElement('canvas')
    half.width = Math.round(src.width / 2)
    half.height = Math.round(src.height / 2)
    half.getContext('2d').drawImage(src, 0, 0, half.width, half.height)
    src = half
  }
  const small = document.createElement('canvas')
  small.width = cols
  small.height = rows
  const g = small.getContext('2d', { willReadFrequently: true })
  g.imageSmoothingQuality = 'high'
  g.drawImage(src, 0, 0, cols, rows)
  const px = g.getImageData(0, 0, cols, rows).data
  const lin = (v) => Math.pow(v / 255, 2.2)
  let k = 0
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++, k++) {
      const i = ((rows - 1 - y) * cols + x) * 4
      const col = [lin(px[i]), lin(px[i + 1]), lin(px[i + 2])]
      const lum = 0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2]
      const X = (x - (cols - 1) / 2) * c
      const Y = 0.32 + y * c * 0.66
      put(s, k, X, Y, Math.sqrt(lum) * 0.16 + gauss(r) * 0.012, col, { rx: gauss(r) * 0.06, ry: gauss(r) * 0.08, size: c * 1.12, bright: 1.25 })
    }
  }
  for (; k < N; k++) scatter(s, k, r, A, { from: 2.4 })
  return s
}

// — premium: who says it more: a tower per person, as tall as how often they said it —
export function towers(N, A, values, seed = 18) {
  const r = rng(seed)
  const s = make(N)
  const n = values.length
  const total = values.reduce((a, b) => a + b, 0) || 1
  const max = Math.max(...values, 1)
  // the tallest tower gets about half the bubbles; the others in proportion
  const budget = Math.floor(N * 0.5)
  const quota = values.map((v) => Math.max(v ? 6 : 0, Math.round((v / max) * budget * Math.min(1, (max * n) / total + 0.2))))
  const size = n > 2 ? 0.22 : 0.3
  const per = n > 2 ? 5 : 9
  const thick = Math.min(1.6, 1.5 / ((Math.max(...quota, 1) / per) * BUBBLE_DEPTH * size))
  const gap = n > 2 ? 0.55 : 1.15
  let k = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < quota[i] && k < N; j++, k++) pile(s, k, j, { x: (i - (n - 1) / 2) * gap, z: 0, per, size, thick, c: PALETTE[i], spin: 0.1, radius: size * 0.6 })
  }
  for (; k < N; k++) scatter(s, k, r, A)
  return s
}

// — premium: the longest silence: the two of you far apart, and only a trail of a few bubbles
// across the empty floor between —
export function apart(N, A, seed = 19) {
  const r = rng(seed)
  const s = make(N)
  const trail = 7
  for (let k = 0; k < N; k++) {
    const side = A[k] % 2
    const cx = side ? 0.85 : -0.85
    if (k < trail) {
      const x = -0.55 + ((k + 0.5) / trail) * 1.1
      put(s, k, x, 0.012, 0.3 + Math.sin(k * 1.7) * 0.05, CREAM, { rx: FLAT, rz: r() * 6, size: 0.06, bright: 0.5 })
      continue
    }
    // a loose ball each, slowly turning; the rest of the floor stays empty (the others shrink
    // away into the balls)
    const u = r() * 2 - 1
    const a = r() * Math.PI * 2
    const rad = 0.42 * Math.cbrt(r())
    const q = Math.sqrt(1 - u * u)
    put(s, k, cx + Math.cos(a) * q * rad, 0.95 + u * rad, Math.sin(a) * q * rad, PALETTE[side], { rx: r() * 6, ry: r() * 6, size: k % 3 === 0 ? 0.1 : 0 })
  }
  return s
}
