import * as shapes from '../three/shapes.js'

// premium: scenes you make yourself, from your own chat. You choose what it's about and which of
// our forms the bubbles build; the words' layout, the camera and the light stay ours, so it always
// looks like the rest of the film.
//
//   quote   a message you pick from the chat
//   count   a word or phrase: how often, who says it more, when it was first said
//   day     a date: how much you talked that day, and how it started
//
// A scene: { id, kind, object, title, …its numbers } (worked out when you make it, so the film
// doesn't need the chat itself).

export const MAX_SCENES = 3

export const OBJECTS = { bubble: 'Gelembung', heart: 'Hati', text: 'Tulisan 3D', towers: 'Menara', emoji: 'Emoji', galaxy: 'Galaksi' }

export const KINDS = {
  quote: { label: 'Kutipan', title: 'Pesan favorit', objects: ['bubble', 'heart', 'emoji', 'galaxy'] },
  count: { label: 'Hitung kata', title: 'Kata kita', objects: ['text', 'towers', 'heart', 'emoji'] },
  day: { label: 'Hari spesial', title: 'Hari spesial', objects: ['text', 'heart', 'bubble', 'galaxy'] },
}

// the camera that suits each form
export const CAMS = {
  bubble: { pos: [0, 2.0, 7.8], look: [0, 1.0, 0], orbit: 0.45, speed: 0.25 },
  heart: { pos: [0, 2.4, 12.6], look: [0, 1.15, 0], orbit: 0.35, speed: 0.25 },
  text: { pos: [0, 1.7, 8.6], look: [0, 0.25, 0], orbit: 0.3, speed: 0.3 },
  towers: { pos: [0, 2.1, 8.4], look: [0, 1.0, 0], orbit: 0.3, speed: 0.2 },
  emoji: { pos: [0, 1.9, 8], look: [0, 1.2, 0], orbit: 0.3, speed: 0.3 },
  galaxy: { pos: [0, 4.6, 9.4], look: [0, -0.1, 0], orbit: 0.6, speed: 0.15 },
}

const EMOJI = /\p{Extended_Pictographic}/u
const dmy = (t) => {
  const d = new Date(t)
  return `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)}`
}

/** The message a scene is about (its quote, the first time the word was said, the day's first). */
export const sceneMessage = (sc) => (sc.kind === 'quote' ? sc.m : sc.first)

/** What the "Tulisan 3D" form spells (none for a quote: too long). */
export function sceneWord(sc) {
  if (sc.kind === 'count') return sc.phrase.length <= 14 ? sc.phrase : null
  if (sc.kind === 'day') return dmy(sc.t)
  return null
}

/** The forms this scene can take (a long phrase can't be spelt out). */
export const objectsFor = (sc) => KINDS[sc.kind].objects.filter((o) => o !== 'text' || sceneWord(sc))

/** The bubbles' sculpture for a scene. */
export function sceneShape(sc, S, N, A) {
  const P = S.people
  const m = sceneMessage(sc)
  const who = Math.max(0, P.findIndex((p) => p.name === m?.author))
  switch (sc.object) {
    case 'heart': return shapes.heart(N, A)
    case 'galaxy': return shapes.galaxy(N, A)
    case 'bubble': return shapes.spark(N, A, who)
    case 'towers': return shapes.towers(N, A, P.slice(0, S.group ? 6 : 2).map((p) => sc.by?.[p.name] ?? 0))
    case 'emoji': {
      const fav = P.flatMap((p) => p.topEmoji).sort((a, b) => b[1] - a[1])[0]?.[0]
      return shapes.emoji(N, A, m?.text.match(EMOJI)?.[0] ?? fav ?? '💬')
    }
    default: return shapes.words(N, A, sceneWord(sc) ?? '♥', { width: 2.1 })
  }
}

// — making one, from the chat —

const short = (m) => m && { t: m.t, author: m.author, text: m.text }

/** Messages that contain q (oldest first, at most `limit`). */
export function searchMessages(messages, q, limit = 30) {
  const s = q.trim().toLowerCase()
  if (s.length < 2) return []
  const out = []
  for (const m of messages) {
    if (m.kind === 'text' && m.text.toLowerCase().includes(s)) {
      out.push(m)
      if (out.length >= limit) break
    }
  }
  return out
}

export const quoteScene = (m) => ({ kind: 'quote', m: short(m) })

/** How often a word or phrase was said, by whom, and the first time (null if never). */
export function countScene(messages, phrase) {
  const p = phrase.trim().replace(/\s+/g, ' ')
  if (p.length < 2) return null
  const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // whole words only ("aku" isn't in "akun")
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'giu')
  let total = 0
  const by = {}
  let first = null
  for (const m of messages) {
    if (m.kind !== 'text') continue
    const n = m.text.match(re)?.length
    if (!n) continue
    total += n
    by[m.author] = (by[m.author] ?? 0) + n
    first ??= m
  }
  return total ? { kind: 'count', phrase: p, total, by, first: short(first) } : null
}

/** A day ('YYYY-MM-DD'): how many messages, by whom, and the first of them (null if none). */
export function dayScene(messages, value) {
  const [y, mo, d] = value.split('-').map(Number)
  if (!y) return null
  const from = new Date(y, mo - 1, d).getTime()
  const to = new Date(y, mo - 1, d + 1).getTime()
  let n = 0
  const by = {}
  let first = null
  for (const m of messages) {
    if (m.t < from || m.t >= to) continue
    n++
    by[m.author] = (by[m.author] ?? 0) + 1
    if (!first && m.kind === 'text') first = m
  }
  return n ? { kind: 'day', t: from, n, by, first: short(first) } : null
}
