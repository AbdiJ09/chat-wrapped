import { W, H } from './story/draw.js'

// Plays the story like an Instagram story: progress bars, tap right/left to skip, hold to pause.
// Each frame: the 3D engine draws the particles, then the slide's words go on top, all into one
// 1080 × 1920 canvas — the same canvas that gets saved as an image or recorded as video.

export function compose(ctx, story, i, t) {
  const { engine, slides } = story
  let time = t
  for (let k = 0; k < i; k++) time += slides[k].duration
  engine.render(i, t, time)
  ctx.drawImage(engine.canvas, 0, 0, W, H)
  slides[i].words(ctx, t)
}

export class Player {
  constructor({ canvas, bars, story, onChange }) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    canvas.width = W
    canvas.height = H
    this.story = story
    this.slides = story.slides
    this.onChange = onChange
    this.i = 0
    this.t = 0
    this.playing = true
    this.held = false
    this.alive = true
    bars.innerHTML = ''
    this.fills = this.slides.map(() => {
      const seg = document.createElement('span')
      const fill = document.createElement('i')
      seg.append(fill)
      bars.append(seg)
      return fill
    })
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
    if (this.playing && !this.held && !this.paused) {
      this.t += dt
      // the last slide keeps turning slowly after its words are in
      if (this.t >= this.slide.duration && this.i < this.slides.length - 1) this.next()
    }
    compose(this.ctx, this.story, this.i, this.t)
    this.fills.forEach((f, k) => (f.style.transform = `scaleX(${k < this.i ? 1 : k > this.i ? 0 : Math.min(1, this.t / this.slide.duration)})`))
  }

  destroy() {
    this.alive = false
  }
}
