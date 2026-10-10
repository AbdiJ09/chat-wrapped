// Small drawing kit for the story canvas (always 1080 × 1920, scaled by CSS).

export const W = 1080
export const H = 1920
export const M = 96 // side margin

export const DISPLAY = '"Bricolage Grotesque", system-ui, sans-serif'
export const SANS = '"Geist", system-ui, sans-serif'
export const MONO = '"Geist Mono", ui-monospace, monospace'

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const easeOut = (t) => 1 - (1 - t) ** 3
export const easeInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
/** 0 → 1 between delay and delay + dur (seconds), eased */
export const at = (t, delay, dur = 0.9) => easeOut(clamp((t - delay) / dur))

const nf = new Intl.NumberFormat('id-ID')
export const num = (n) => nf.format(Math.round(n))
export const date = (d, opts = { day: 'numeric', month: 'long', year: 'numeric' }) => new Intl.DateTimeFormat('id-ID', opts).format(d)

export function duration(ms) {
  if (ms == null) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} detik`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} menit`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} jam ${m % 60} menit` : `${h} jam`
}

export function font(ctx, { size = 40, weight = 400, family = SANS, italic = false, spacing = 0 }) {
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`
}

/**
 * Text that rises into place as it appears.
 * o: { size, weight, family, italic, color, align, alpha, spacing, rise }
 */
export function text(ctx, str, x, y, o = {}) {
  const a = o.alpha ?? 1
  if (a <= 0.001) return
  font(ctx, o)
  ctx.save()
  ctx.globalAlpha *= a
  ctx.fillStyle = o.color ?? '#fff'
  ctx.textAlign = o.align ?? 'left'
  ctx.textBaseline = o.baseline ?? 'alphabetic'
  ctx.fillText(str, x, y + (1 - a) * (o.rise ?? 24))
  ctx.restore()
}

export function wrap(ctx, str, maxWidth, o) {
  font(ctx, o)
  const out = []
  for (const para of String(str).split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (ctx.measureText(next).width > maxWidth && line) {
        out.push(line)
        line = word
      } else line = next
    }
    out.push(line)
  }
  return out
}

/** An all-caps little label above a slide's headline. */
export function eyebrow(ctx, str, y, color, alpha) {
  text(ctx, str.toUpperCase(), M, y, { size: 28, weight: 500, family: MONO, spacing: 3, color, alpha, rise: 12 })
}

export function measure(ctx, str, o) {
  font(ctx, o)
  return ctx.measureText(str).width
}

// film grain, made once: gives flat colour a printed, tactile feel
let grain = null
export function drawGrain(ctx, alpha = 0.06) {
  if (!grain) {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')
    const img = g.createImageData(256, 256)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    g.putImageData(img, 0, 0)
    grain = ctx.createPattern(c, 'repeat')
  }
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.globalCompositeOperation = 'overlay'
  ctx.fillStyle = grain
  ctx.fillRect(0, 0, W, H)
  ctx.restore()
}
