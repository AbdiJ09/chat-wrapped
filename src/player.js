import { W, H } from './story/draw.js'

// Plays the story like an Instagram story: progress bars, tap right/left to skip, hold to pause.
// Each frame: the 3D engine draws the bubbles, then the slide's words go on top, all into one
// 1080 × 1920 canvas — the same canvas that gets saved as an image or recorded as video.
// With a song (to hear how it'll go on Instagram), the song is the clock: the film is wherever the
// music is.

/** Where each slide starts in the film (seconds). */
export const starts = (slides) => slides.reduce((a, s, i) => (a.push(i ? a[i - 1] + slides[i - 1].duration : 0), a), [])

export function compose(ctx, story, i, t) {
  const { engine, slides } = story
  engine.render(i, t)
  if (engine.canvas.width) ctx.drawImage(engine.canvas, 0, 0, W, H)
  slides[i].words(ctx, t)
}

export class Player {
  constructor({ canvas, bars, story, music = null, film = false, onChange }) {
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
    // a film has one line for the whole of it (and the time), not a bar per slide
    this.film = film
    bars.classList.toggle('is-film', film)
    if (film) {
      bars.innerHTML = '<span><i></i></span><time></time>'
      this.line = bars.querySelector('i')
      this.clock = bars.querySelector('time')
    }
    this.fills = (film ? [] : this.slides).map(() => {
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
    if (this.film) {
      const at = Math.min(this.end, this.story.starts[this.i] + this.t)
      this.line.style.transform = `scaleX(${at / this.end})`
      const mmss = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`
      this.clock.textContent = `${mmss(at)} / ${mmss(this.end)}`
    }
  }

  destroy() {
    this.alive = false
    this.music?.track.stop(0.3)
  }
}
