import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import { W, H } from './story/draw.js'
import { compose } from './player.js'

// Saving: a slide as a PNG, or the whole story as an MP4. The video is rendered frame by frame
// (WebCodecs H.264), not screen-recorded, so it's perfectly smooth on any device — a slow phone
// just takes longer to make it.

function stage(story) {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const prev = { ...story.engine.size }
  story.engine.resize(W, H, 1) // full resolution while saving
  return { c, ctx: c.getContext('2d'), restore: () => prev.w && story.engine.resize(prev.w, prev.h, prev.pr) }
}

/** The finished frame of slide i, as a PNG blob (1080 × 1920). */
export async function slideImage(story, i) {
  const { c, ctx, restore } = stage(story)
  compose(ctx, story, i, story.slides[i].duration)
  restore()
  return new Promise((resolve) => c.toBlob(resolve, 'image/png'))
}

async function pickCodec(fps) {
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42003e']) {
    const config = { codec, width: W, height: H, bitrate: 7_000_000, framerate: fps }
    try {
      if ((await VideoEncoder.isConfigSupported(config)).supported) return config
    } catch {}
  }
  return null
}

export const canMakeVideo = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'

/**
 * The whole story as an MP4 (1080 × 1920, 30 fps).
 * onProgress(0..1); signal: { cancelled } to stop early.
 */
export async function storyVideo(story, { fps = 30, onProgress, signal = {} } = {}) {
  const config = await pickCodec(fps)
  if (!config) throw new Error('Browser ini belum bisa bikin video. Coba Chrome terbaru, atau simpan gambarnya saja.')
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: fps }, fastStart: 'in-memory' })
  let failure = null
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failure = e) })
  encoder.configure(config)

  const { c, ctx, restore } = stage(story)
  const total = story.slides.reduce((a, s) => a + Math.round(s.duration * fps), 0)
  let f = 0
  try {
    for (let i = 0; i < story.slides.length; i++) {
      const frames = Math.round(story.slides[i].duration * fps)
      for (let k = 0; k < frames; k++) {
        if (signal.cancelled) return null
        if (failure) throw failure
        compose(ctx, story, i, k / fps)
        const frame = new VideoFrame(c, { timestamp: Math.round((f * 1e6) / fps), duration: Math.round(1e6 / fps) })
        encoder.encode(frame, { keyFrame: f % (fps * 2) === 0 })
        frame.close()
        f++
        // don't race ahead of the encoder; let the page breathe now and then
        while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4))
        if (f % 6 === 0) {
          onProgress?.(f / total)
          await new Promise((r) => setTimeout(r, 0))
        }
      }
    }
    await encoder.flush()
    if (failure) throw failure
    muxer.finalize()
    onProgress?.(1)
    return new Blob([muxer.target.buffer], { type: 'video/mp4' })
  } finally {
    restore()
    if (encoder.state !== 'closed') encoder.close()
  }
}
