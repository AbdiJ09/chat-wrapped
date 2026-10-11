import { W, H } from './story/draw.js'

// Plays the story like an Instagram story: progress bars, tap right/left to skip, hold to pause.
// Each frame: the 3D engine draws the bubbles, then the slide's words go on top, all into one
// 1080 × 1920 canvas — the same canvas that gets saved as an image or recorded as video.
// With a song, the song is the clock: the film is wherever the music is (and the slides were cut
// to whole bars, so every change lands on the one); on the beat the bubbles give a little kick.

/** Where each slide starts in the film (seconds). */
export const starts = (slides) => slides.reduce((a, s, i) => (a.push(i ? a[i - 1] + slides[i - 1].duration : 0), a), [])

/** 0…1, a kick on every beat that dies away (stronger on the first of the bar). */
export function pulse(beat, T) {
  if (!beat || T < 0) return 0
  const n = Math.floor(T / beat.period + 1e-6)
  const since = T - n * beat.period
  return Math.exp(-since / 0.11) * (n % 4 === 0 ? 1 : 0.55)
}

export function compose(ctx, story, i, t) {
  const { engine, slides } = story
  engine.pulse = pulse(story.beat, story.starts[i] + t)
  engine.render(i, t)
  ctx.drawImage(engine.canvas, 0, 0, W, H)
  slides[i].words(ctx, t)
}

export class Player {
  constructor({ canvas, bars, story, music = null, onChange }) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    canvas.width = W
    canvas.height = H
    this.story = story
    this.slides = story.slides
    story.starts = starts(story.slides)
    // { track, start: where in the song the film begins }
    this.music = music
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
    // the song jumps with the film
    if (this.music?.track.on) this.music.track.play(this.music.start + this.story.starts[this.i])
    this.onChange?.(this.i)
  }

  get end() {
    return this.story.starts.at(-1) + this.slides.at(-1).duration
  }

  next() {
    if (this.i < this.slides.length - 1) this.goto(this.i + 1)
    else this.t = this.slide.duration // the last slide stays, finished
  }

  prev() {
    // like Instagram: a tap back restarts the slide unless you're right at its start
    if (this.t > 1 || this.i === 0) this.goto(this.i)
    else this.goto(this.i - 1)
  }

  frame(now) {
    if (!this.alive) return
    requestAnimationFrame(this.frame)
    const running = this.playing && !this.held && !this.paused
    const T = this.story.starts[this.i] + this.t
    const m = this.music
    // the song plays while the film does, until the film's done
    if (m) {
      if (running && T < this.end - 0.05 && m.start + T < m.track.buffer.duration - 0.1) !m.track.on && m.track.play(m.start + T)
      else if (m.track.on) m.track.stop(T >= this.end - 0.05 ? 1.2 : 0.08)
    }
    // while a video or an image is being made the engine is theirs: don't draw over it
    if (this.paused) return
    const dt = Math.min((now - this.last) / 1000, 0.1)
    this.last = now
    if (running && m?.track.on) {
      // the film is where the song is
      const at = Math.max(0, Math.min(this.end, m.track.time - m.start))
      let i = this.slides.length - 1
      while (i > 0 && this.story.starts[i] > at) i--
      if (i !== this.i) {
        this.i = i
        this.onChange?.(i)
      }
      this.t = at - this.story.starts[i]
    } else if (running) {
      this.t += dt
      // the last slide keeps turning slowly after its words are in
      if (this.t >= this.slide.duration && this.i < this.slides.length - 1) this.next()
    }
    compose(this.ctx, this.story, this.i, this.t)
    this.fills.forEach((f, k) => (f.style.transform = `scaleX(${k < this.i ? 1 : k > this.i ? 0 : Math.min(1, this.t / this.slide.duration)})`))
  }

  destroy() {
    this.alive = false
    this.music?.track.stop(0.3)
  }
}
