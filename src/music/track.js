// Playing the song: from any point, and telling the time by the sound card's own clock (so the
// film follows what you hear, not the other way round).

export class Track {
  constructor(ctx, buffer) {
    this.ctx = ctx
    this.buffer = buffer
    this.gain = ctx.createGain()
    this.gain.connect(ctx.destination)
    this.src = null
  }

  get on() {
    return !!this.src
  }

  /** Play from `at` seconds into the song (fading in over `fade` s). */
  play(at, fade = 0.04) {
    this.stop(0)
    const { ctx } = this
    ctx.resume()
    const src = (this.src = ctx.createBufferSource())
    src.buffer = this.buffer
    src.connect(this.gain)
    const now = ctx.currentTime
    this.gain.gain.cancelScheduledValues(now)
    this.gain.gain.setValueAtTime(0, now)
    this.gain.gain.linearRampToValueAtTime(1, now + fade)
    src.start(now, Math.max(0, at))
    src.onended = () => this.src === src && (this.src = null)
    this.t0 = now - at
  }

  /** Stop (fading out over `fade` s). */
  stop(fade = 0.08) {
    const src = this.src
    if (!src) return
    this.src = null
    const now = this.ctx.currentTime
    const g = this.gain.gain
    g.cancelScheduledValues(now)
    g.setValueAtTime(g.value, now)
    g.linearRampToValueAtTime(0, now + fade)
    src.stop(now + fade + 0.02)
  }

  /** Where in the song we are, as heard (the speakers lag the clock a little). */
  get time() {
    const { ctx } = this
    return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0) - this.t0
  }
}
