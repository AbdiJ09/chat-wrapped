import { W, H } from './story/draw.js'

// Plays the story like an Instagram story: progress bars, tap right/left to skip, hold to pause.

export class Player {
  constructor({ canvas, bars, slides, loop = false, onChange }) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    canvas.width = W
    canvas.height = H
    this.bars = bars
    this.slides = slides
    this.loop = loop
    this.onChange = onChange
    this.i = 0
    this.t = 0
    this.playing = true
    this.held = false
    this.alive = true
    if (bars) {
      bars.innerHTML = ''
      this.fills = slides.map(() => {
        const seg = document.createElement('span')
        const fill = document.createElement('i')
        seg.append(fill)
        bars.append(seg)
        return fill
      })
    }
    this.last = performance.now()
    this.frame = this.frame.bind(this)
    requestAnimationFrame(this.frame)
  }

  get slide() {
    return this.slides[this.i]
  }

  goto(i) {
    this.i = Math.max(0, Math.min(this.slides.length - 1, i))
    this.t = 0
    this.onChange?.(this.i)
  }

  next() {
    if (this.i < this.slides.length - 1) this.goto(this.i + 1)
    else if (this.loop) this.goto(0)
    else this.t = this.slide.duration // the last slide stays, finished
  }

  prev() {
    // like Instagram: a tap back restarts the slide unless you're right at its start
    if (this.t > 1 || this.i === 0) this.t = 0
    else this.goto(this.i - 1)
  }

  frame(now) {
    if (!this.alive) return
    requestAnimationFrame(this.frame)
    const dt = Math.min((now - this.last) / 1000, 0.1)
    this.last = now
    if (this.playing && !this.held) {
      this.t += dt
      if (this.t >= this.slide.duration && (this.i < this.slides.length - 1 || this.loop)) this.next()
    }
    const t = Math.min(this.t, this.slide.duration)
    this.slide.draw(this.ctx, t)
    if (this.fills) this.fills.forEach((f, k) => (f.style.transform = `scaleX(${k < this.i ? 1 : k > this.i ? 0 : t / this.slide.duration})`))
  }

  destroy() {
    this.alive = false
  }
}

/** The finished frame of a slide, as a PNG blob (1080 × 1920). */
export function slideImage(slide) {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  slide.draw(c.getContext('2d'), slide.duration)
  return new Promise((resolve) => c.toBlob(resolve, 'image/png'))
}
