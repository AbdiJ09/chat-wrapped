import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zipSync, strToU8 } from 'fflate'
import { openZip } from '../src/parse/zip.js'
import { parseWhatsApp } from '../src/parse/whatsapp.js'
import { mediaType, opusSeconds, readMedia } from '../src/media.js'

// a minimal Ogg Opus file: an OpusHead page (pre-skip 312) and a last page at `samples`
function ogg(samples) {
  const page = (granule, body) => {
    const b = new Uint8Array(27 + 1 + body.length)
    const v = new DataView(b.buffer)
    b.set(strToU8('OggS'))
    v.setBigInt64(6, BigInt(granule), true)
    b[26] = 1
    b[27] = body.length
    b.set(body, 28)
    return b
  }
  const head = strToU8('OpusHead\x01\x01\x38\x01')
  const a = page(0, head)
  const z = page(samples, new Uint8Array(20))
  const out = new Uint8Array(a.length + z.length)
  out.set(a)
  out.set(z, a.length)
  return out
}

test('what a file is, from its name', () => {
  assert.equal(mediaType('00000028-STICKER-2026-09-15-00-51-23.webp'), 'sticker')
  assert.equal(mediaType('STK-20260915-WA0003.webp'), 'sticker')
  assert.equal(mediaType('00000047-PHOTO-2026-09-15-09-06-00.jpg'), 'photo')
  assert.equal(mediaType('PTT-20260915-WA0001.opus'), 'audio')
  assert.equal(mediaType('VID-20260915-WA0001.mp4'), 'video')
  assert.equal(mediaType('notes.pdf'), 'other')
})

test('how long a voice note is', () => {
  const f = ogg(48000 * 10 + 312)
  assert.equal(opusSeconds(f.subarray(0, 512), f), 10)
})

test('stickers counted by what they are, voice notes by how long', async () => {
  const s1 = new Uint8Array([1, 1, 1])
  const s2 = new Uint8Array([2, 2, 2])
  const files = {
    '00000001-STICKER-2026-09-15-10-00-00.webp': [s1, { level: 0 }],
    '00000002-STICKER-2026-09-15-10-01-00.webp': [s1, { level: 0 }],
    '00000003-STICKER-2026-09-15-10-02-00.webp': [s2, { level: 0 }],
    '00000004-AUDIO-2026-09-15-10-03-00.opus': [ogg(48000 * 30 + 312), { level: 0 }],
    '00000005-AUDIO-2026-09-15-10-04-00.opus': [ogg(48000 * 90 + 312), { level: 0 }],
  }
  const line = (n, who, name) => `[9/15/26, 10:0${n}:00 AM] ${who}: ‎<attached: ${name}>`
  const names = Object.keys(files)
  const chat = [
    line(0, 'A', names[0]), line(1, 'B', names[1]), line(2, 'A', names[2]), line(3, 'A', names[3]), line(4, 'B', names[4]),
    '[9/15/26, 10:05:00 AM] A: ‎<attached: 00000006-PHOTO-2026-09-15-10-05-00.jpg>',
  ].join('\n')
  const zip = await openZip(new Blob([zipSync({ '_chat.txt': strToU8(chat), ...files })]))
  const { messages } = parseWhatsApp(chat)
  const m = await readMedia(zip, messages, ['A', 'B'], { decode: false })
  assert.equal(m.total.sticker, 3)
  assert.equal(m.total.photo, 1, 'counted, even without its file')
  assert.equal(m.stickers.unique, 2)
  assert.equal(m.stickers.top.n, 2)
  assert.deepEqual(m.stickers.top.by, [1, 1])
  assert.equal(m.people[0].voice, 30)
  assert.equal(m.people[1].voice, 90)
  assert.equal(m.longest.i, 1)
})

test('nothing attached: no media', async () => {
  const chat = '[9/15/26, 10:00:00 AM] A: halo\n[9/15/26, 10:01:00 AM] B: hai'
  const zip = await openZip(new Blob([zipSync({ '_chat.txt': strToU8(chat) })]))
  assert.equal(await readMedia(zip, parseWhatsApp(chat).messages, ['A', 'B'], { decode: false }), null)
})
