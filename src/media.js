// An export "with media": what each of you sent besides words. Only what's needed is read out of
// the zip: every sticker (small, to know which ones are the same — the same sticker is the same
// file), and of each voice note just its first and last bytes (how long it is). Photos and videos
// are only counted, never opened.

/** What a file is, from its name (iPhone: 00000028-STICKER-2026-…, Android: STK-2026…-WA0001). */
export function mediaType(name) {
  const n = name.split('/').pop().toUpperCase()
  if (/-STICKER-|^STK-/.test(n)) return 'sticker'
  if (/-PHOTO-|^IMG-/.test(n)) return 'photo'
  if (/-VIDEO-|-GIF-|^VID-/.test(n)) return 'video'
  if (/-AUDIO-|^PTT-|^AUD-/.test(n)) return 'audio'
  return 'other'
}

const base = (name) => name.split('/').pop()

// "OggS"
const isPage = (b, i) => b[i] === 0x4f && b[i + 1] === 0x67 && b[i + 2] === 0x67 && b[i + 3] === 0x53

/** How long an Ogg Opus file is: the last page's position (48 kHz samples) less the pre-skip. */
export function opusSeconds(head, tail) {
  let pre = 0
  for (let i = 0; i + 12 <= head.length; i++) {
    // "OpusHead": version, channels, then the pre-skip
    if (head[i] === 0x4f && head[i + 1] === 0x70 && head[i + 4] === 0x48 && head[i + 7] === 0x64) {
      pre = head[i + 10] | (head[i + 11] << 8)
      break
    }
  }
  const v = new DataView(tail.buffer, tail.byteOffset, tail.byteLength)
  for (let i = tail.length - 14; i >= 0; i--) {
    if (!isPage(tail, i)) continue
    const lo = v.getUint32(i + 6, true)
    const hi = v.getUint32(i + 10, true)
    if (hi === 0xffffffff && lo === 0xffffffff) continue // a page that ends no packet
    return Math.max(0, (hi * 2 ** 32 + lo - pre) / 48000)
  }
  return 0
}

async function hash(bytes) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-1', bytes))
  return Array.from(d.subarray(0, 10), (x) => x.toString(16).padStart(2, '0')).join('')
}

// a sticker as a square canvas, centred, with a little room round it (an animated one: its first frame)
async function picture(bytes) {
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }))
  const S = 400
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const k = (S * 0.92) / Math.max(bmp.width, bmp.height)
  const w = bmp.width * k
  const h = bmp.height * k
  cv.getContext('2d').drawImage(bmp, (S - w) / 2, (S - h) / 2, w, h)
  bmp.close?.()
  return cv
}

/**
 * zip: openZip(); messages: the parsed chat; names: everyone, in the stats' order (so nicknames
 * don't matter). null when nothing in the chat came with its file.
 * → { people: [{ sticker, photo, video, audio, voice (seconds), top: { n, img } | null }],
 *     total: { sticker, photo, video, audio, voice }, stickers: { unique, top: { n, img, by: [n per person] } | null },
 *     longest: { i, sec, t } | null }
 */
export async function readMedia(zip, messages, names, { decode = true, onProgress } = {}) {
  const files = new Map(zip.entries.map((e) => [base(e.name), e]))
  const index = new Map(names.map((n, i) => [n, i]))
  const people = names.map(() => ({ sticker: 0, photo: 0, video: 0, audio: 0, voice: 0, top: null }))
  const total = { sticker: 0, photo: 0, video: 0, audio: 0, voice: 0 }
  const kinds = new Map() // sticker hash → { n, by, entry }
  let longest = null
  let found = 0

  const todo = messages.filter((m) => m.media && index.has(m.author))
  for (let j = 0; j < todo.length; j++) {
    const m = todo[j]
    const i = index.get(m.author)
    const type = mediaType(m.media)
    if (type === 'other') continue
    people[i][type]++
    total[type]++
    const entry = files.get(base(m.media))
    if (!entry) continue
    found++
    if (type === 'sticker' && /\.webp$/i.test(entry.name)) {
      const key = await hash(await zip.read(entry))
      const k = kinds.get(key) ?? { n: 0, by: names.map(() => 0), entry }
      k.n++
      k.by[i]++
      kinds.set(key, k)
    } else if (type === 'audio' && /\.(opus|ogg)$/i.test(entry.name)) {
      const sec = opusSeconds(await zip.slice(entry, 0, 512), await zip.slice(entry, Math.max(0, entry.size - 65536), entry.size))
      people[i].voice += sec
      total.voice += sec
      if (!longest || sec > longest.sec) longest = { i, sec, t: m.t }
    }
    if (onProgress && j % 40 === 0) onProgress(j / todo.length)
  }
  if (!found) return null

  const ranked = [...kinds.values()].sort((a, b) => b.n - a.n)
  const img = new Map()
  const look = async (k) => {
    if (!decode) return null
    if (!img.has(k)) img.set(k, await picture(await zip.read(k.entry)).catch(() => null))
    return img.get(k)
  }
  let top = null
  if (ranked.length) top = { n: ranked[0].n, by: ranked[0].by, img: await look(ranked[0]) }
  for (let i = 0; i < people.length && i < 6; i++) {
    const mine = ranked.filter((k) => k.by[i]).sort((a, b) => b.by[i] - a.by[i])[0]
    if (mine) people[i].top = { n: mine.by[i], img: await look(mine) }
  }
  onProgress?.(1)
  return { people, total, stickers: { unique: kinds.size, top }, longest }
}
