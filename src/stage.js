import { Engine, MORPH } from './three/engine.js'
import * as shapes from './three/shapes.js'

// The landing's 3D: the same studio and bubbles as the film, playing a chat (the demo, or yours
// once you've picked it). Each scene of the page has a sculpture, and on the landing the scroll
// drives everything: between two scenes the bubbles are exactly as far through their flight from
// one sculpture to the next as you are through the scroll, the camera swooping round with them;
// scroll back and they fly back. Elsewhere (reading your chat, the picker, the lift-off into the
// film) flights are timed. Changing the vibe recolours with a stadium wave of spinning bubbles
// (unless the sculpture changes too — a couple gets a heart).

const SCENES = {
  badge: { cam: { pos: [-3.4, 2.4, 8.8], look: [0, 1.5, 0], orbit: 0.22, speed: 0.15 } },
  orbs: { cam: { pos: [0, 2.2, 8.8], look: [0, 1.0, 0], orbit: 0.35, speed: 0.15 } },
  pillars: { cam: { pos: [0, 2.6, 8.6], look: [0, 0.8, -0.4], orbit: 0.25, speed: 0.15 } },
  terrain: { cam: { pos: [3.4, 1.7, 4.6], look: [-0.3, 0.25, 0], orbit: 0.2, speed: 0.15 } },
  emoji: { cam: { pos: [0, 2, 9.6], look: [0, 1.4, 0], orbit: 0.25, speed: 0.15 } },
  galaxy: { cam: { pos: [0, 4.4, 8.4], look: [0, 0.7, 0], orbit: 0.5, speed: 0.12 } },
  cover: { cam: { pos: [0, 2.4, 11.4], look: [0, 1.35, 0], orbit: 0.3, speed: 0.15 } },
  spark: { cam: { pos: [0, 2.1, 8.2], look: [0, 1.1, 0], orbit: 0.35, speed: 0.15 } },
  vortex: { cam: { pos: [0, 2.2, 10.5], look: [0, 1.75, 0], orbit: 0, speed: 0 } },
  // reading your chat: close up on one bright ball
  core: { cam: { pos: [0, 1.75, 6.4], look: [0, 1.5, 0], orbit: 0.4, speed: 0.6 } },
  // the way out: everything flies up into the sky
  nebula: { cam: { pos: [0, 3.5, 10], look: [0, 4.5, 0], orbit: 0, speed: 0 } },
}

// which sculpture a scene is in a theme (a couple's cover is a heart, everyone else's a helix)
const form = (name, theme) => (name === 'cover' ? (theme.id === 'couple' ? 'heart' : 'helix') : name)

function build(name, S, N, theme) {
  shapes.usePalette(theme)
  const A = shapes.authors(S, N)
  const P = S.people
  switch (name) {
    case 'badge': return shapes.badge(N, A)
    case 'orbs': return shapes.orbs(N, A, S.group ? P.slice(0, 6).map((p) => p.share) : [P[0].share, P[1].share])
    case 'pillars': return shapes.pillars(N, A, S.hours, S.peakHour)
    case 'terrain': return shapes.terrain(N, A, S.calendar, S.busiest)
    case 'emoji': {
      const fav = P.flatMap((p) => p.topEmoji).sort((a, b) => b[1] - a[1])[0]
      return shapes.emoji(N, A, fav?.[0] ?? '💬')
    }
    case 'galaxy': return shapes.galaxy(N, A)
    case 'cover': return theme.id === 'couple' ? shapes.heart(N, A) : shapes.helix(N, A, Math.min(P.length, 6))
    case 'spark': return shapes.spark(N, A, 0)
    case 'vortex': return shapes.vortex(N, A)
    case 'core': return shapes.core(N, A)
    default: return shapes.nebula(N, A)
  }
}

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const SWAY = 7 // seconds
// ways of flying from one sculpture to the next
const STYLES = {
  fly: { burst: 2.2, pull: 0.35, swing: 0.75, stagger: 0.6, curve: 'inout', radial: 0 },
  gather: { burst: 0.6, pull: 0.1, swing: 0.3, stagger: 0.9, curve: 'inout', radial: 0 },
  bang: { burst: 1.2, pull: 0.7, swing: 0.5, stagger: 0.06, curve: 'out', radial: 3.2 },
}

export class Stage {
  /** scenes: the landing's sculptures in page order */
  constructor(canvas, { count, quality, stats, theme, scenes }) {
    const e = (this.engine = new Engine({ count, quality, canvas }))
    e.burst = 2.2
    e.pull = 0.35
    this.N = count
    this.mouse = { x: 0, y: 0, tx: 0, ty: 0 }
    this.onMove = (ev) => {
      this.mouse.tx = (ev.clientX / innerWidth) * 2 - 1
      this.mouse.ty = -((ev.clientY / innerHeight) * 2 - 1)
    }
    addEventListener('pointermove', this.onMove)
    this.cache = new Map()
    this.stats = stats
    this.theme = theme
    this.scenes = scenes
    this.focus = 'side' // 'side': next to the words; 'centre': in the middle of the screen
    this.shift = [0.2, 0]
    this.side = 1
    // the scroll, in scenes (0 = the first scene filling the screen): where it is, and where the
    // eased value the 3D follows has got to
    this.target = 0
    this.pos = 0
    this.last = performance.now()
    // the first sculpture rains down out of the sky, then the scroll takes over
    this.#timed(scenes[0], this.#slide('nebula'), true)
  }

  #slide(name) {
    const key = `${name}:${this.theme.id}`
    if (!this.cache.has(key)) {
      const { theme } = this
      this.cache.set(key, { shape: build(name, this.stats, this.N, theme), cam: { dolly: 0, ...SCENES[name].cam }, bg: theme.bg, glow: theme.glow, rim: theme.people[1], duration: 0 })
    }
    return this.cache.get(key)
  }

  #reel() {
    return this.scenes.map((n) => this.#slide(n))
  }

  // a timed flight into a sculpture (from what's showing, or from `from`); then: hand back to the
  // scroll. style: how it flies (see STYLES)
  #timed(name, from = null, then = false, style = 'fly') {
    this.side = -this.side
    const e = this.engine
    Object.assign(e, STYLES[style])
    e.swing = STYLES[style].swing * this.side
    e.setStory([this.#slide(name)], from ?? e.snapshot())
    this.name = name
    this.mode = 'timed'
    this.then = then
    this.start = performance.now()
  }

  /**
   * Fly into a sculpture now (in another theme too, if given; force: even if it's showing).
   * style: 'fly' (the usual), 'gather' (drawn in, calmly), 'bang' (all at once, blasted outwards)
   */
  show(name, { theme, force = false, style = 'fly' } = {}) {
    if (this.mode === 'timed' && name === this.name && !force && (!theme || theme === this.theme)) return
    if (theme) this.theme = theme
    this.#timed(name, null, false, style)
  }

  /** Back to the landing: fly into the scene the page is at, then follow the scroll again. */
  follow() {
    this.pos = this.target
    this.#timed(this.scenes[Math.round(this.pos)], null, true)
  }

  setTheme(theme) {
    if (theme === this.theme) return
    const was = this.theme
    this.theme = theme
    const settled = this.mode === 'scroll' || performance.now() - this.start > (MORPH + 0.7) * 1000
    // the same sculpture, only the colours change: a wave; otherwise a flight
    if (settled && form(this.name, was) === form(this.name, theme)) this.engine.flipTo(this.mode === 'scroll' ? this.#reel() : this.#slide(this.name))
    else this.#timed(this.name, null, this.mode === 'scroll' || this.then)
  }

  /** Play another chat (the one you picked), or the demo again (takes effect at the next flight). */
  setStats(stats) {
    this.stats = stats
    this.cache.clear()
  }

  frame(now, w, h, pr) {
    const dt = Math.min((now - this.last) / 1000, 0.1)
    this.last = now
    const e = this.engine
    e.resize(w, h, pr)
    const m = this.mouse
    const k = 1 - Math.exp(-dt * 2.5)
    m.x += (m.tx - m.x) * k
    m.y += (m.ty - m.y) * k
    e.lean = m
    // wide screens: the words on the left, the sculpture on the right; tall ones: it sits up top.
    // Centred, it glides to the middle.
    const wide = w / h > 1.1
    const target = this.focus === 'centre' ? [0, wide ? 0 : 0.06] : wide ? [0.2, 0] : [0, 0.2]
    const g = 1 - Math.exp(-dt * 3)
    this.shift = this.shift.map((v, i) => v + (target[i] - v) * g)
    e.offset = this.shift
    e.zoom = wide ? 1 : 1.25
    e.camera.fov = wide ? 30 : 42
    e.camera.updateProjectionMatrix()
    // the scroll glides rather than steps with the wheel, and keeps going a moment after you stop
    this.pos += (this.target - this.pos) * (1 - Math.exp(-dt * 5))
    const clock = (now - this.start) / 1000
    // the landing can stay open for minutes: sculptures sway back and forth instead of turning on
    // and on (a heart would end up edge-on). Close to the start it's the same as the clock.
    const t = SWAY * Math.sin(clock / SWAY)
    if (this.mode === 'timed') {
      // the flight has landed: from now on (same clock, so nothing jumps) the scroll drives
      if (this.then && clock > MORPH + 0.7) {
        Object.assign(e, STYLES.fly)
        this.mode = 'scroll'
        this.pos = this.target
        e.setStory(this.#reel(), this.#slide('nebula'))
      } else {
        e.shock = true
        e.render(0, t, clock, clock)
        return
      }
    }
    // between scenes a and a + 1, f of the way: the bubbles hold their sculpture near either end
    const n = this.scenes.length
    let a = Math.floor(this.pos)
    let f = this.pos - a
    if (a >= n - 1) [a, f] = [n - 2, 1]
    if (a < 0) [a, f] = [0, 0]
    e.shock = false
    e.swing = 0.75 * (a % 2 ? -1 : 1)
    this.name = this.scenes[Math.round(a + f)]
    e.render(a + 1, t, clamp01((f - 0.1) / 0.8) * (MORPH + 0.6), clock)
  }

  dispose() {
    removeEventListener('pointermove', this.onMove)
    this.engine.dispose()
  }
}
