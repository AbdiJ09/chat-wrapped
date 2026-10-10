// A made-up year of chat between two people, for the "try an example" button and for tests.
// Deterministic (seeded), so the demo always tells the same story.

const NAMES = ['Raka', 'Nadia']

const LINES = {
  open: ['pagii', 'pagi sayang', 'udah bangun?', 'halo', 'eh', 'kamu lagi apa', 'sibuk ga', 'aku baru sampe kantor', 'met pagi'],
  chat: [
    'wkwkwk', 'wkwk iya', 'hahaha', 'iya sih', 'serius?', 'masa sih', 'aku juga', 'oke deh', 'nanti aku kabarin ya',
    'udah makan belum', 'belum nih', 'makan apa', 'mie ayam', 'kangen', 'aku kangen', 'sama', 'lucu banget', 'gemes',
    'capek banget hari ini', 'semangat yaa', 'nanti malem telpon?', 'boleh', 'jam berapa', 'abis isya ya',
    'eh liat deh', 'apaan', 'ini lho yang kemarin', 'oh iya inget', 'ngantuk', 'tidur gih', 'bentar lagi',
    'otw', 'udah sampe', 'hati hati', 'makasih ya', 'sama sama', 'love you', 'hehe', 'awokawok', 'anjir wkwk',
    'nonton yuk weekend', 'film apa', 'terserah kamu', 'yaudah aku pilihin', 'kopi dulu', 'mau dibeliin?',
    'macet parah', 'hujan di sini', 'di sini juga', 'bawa payung ga', 'lupa wkwk', 'dasar',
  ],
  close: ['good night', 'tidur dulu ya', 'night sayang', 'met bobo', 'see you besok', 'dadah'],
  long: [
    'jadi tadi tuh aku ketemu temen lama di stasiun, terus kita ngobrol lama banget sampe ketinggalan kereta wkwk\nakhirnya naik yang berikutnya',
    'aku mikir deh, kayaknya tahun depan kita harus liburan ke tempat yang belum pernah kita datengin. jepang? atau labuan bajo dulu yang deket',
  ],
  emoji: ['😂', '🥹', '❤️', '😭', '🙏', '✨', '😴', '🤣', '😍', '👀'],
}

function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** @returns {{ t: number, author: string, text: string, kind: 'text'|'media'|'deleted' }[]} */
export function demoMessages({ seed = 7, start = new Date(2025, 0, 1), days = 364 } = {}) {
  const r = rng(seed)
  const pick = (arr) => arr[Math.floor(r() * arr.length)]
  const out = []
  for (let day = 0; day < days; day++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + day)
    // a few quiet days; weekends and one unforgettable day are busier
    if (r() < 0.06) continue
    const weekend = date.getDay() === 0 || date.getDay() === 6
    const special = day === 136 // a long night of talking
    const sessions = special ? 4 : 1 + Math.floor(r() * (weekend ? 4 : 3))
    for (let s = 0; s < sessions; s++) {
      // mornings, lunch, and mostly late evenings
      const hour = special ? [9, 13, 20, 22][s] : pick([7, 8, 12, 13, 19, 21, 21, 22, 22, 23, 23, 0])
      let t = new Date(date.getFullYear(), date.getMonth(), date.getDate() + (hour === 0 ? 1 : 0), hour, Math.floor(r() * 60)).getTime()
      // Nadia starts most conversations
      let who = r() < 0.64 ? 1 : 0
      const n = special ? 40 + Math.floor(r() * 30) : 4 + Math.floor(r() * 22)
      for (let k = 0; k < n; k++) {
        let text = k === 0 ? pick(LINES.open) : k === n - 1 && hour >= 21 ? pick(LINES.close) : pick(LINES.chat)
        let kind = 'text'
        const roll = r()
        if (roll < 0.05) (kind = 'media'), (text = '')
        else if (roll < 0.058) (kind = 'deleted'), (text = '')
        else if (roll < 0.064) text = pick(LINES.long)
        else if (roll < 0.2) text += ' ' + pick(LINES.emoji)
        else if (roll < 0.24) text = pick(LINES.emoji)
        out.push({ t, author: NAMES[who], text, kind })
        // Raka replies fast; Nadia takes her time
        const replyMin = who === 0 ? 0.5 + r() * 6 : 0.2 + r() * 2
        t += (r() < 0.3 ? 0.2 : replyMin) * 60000
        if (r() < 0.7) who = 1 - who
      }
    }
  }
  out.sort((a, b) => a.t - b.t)
  return out
}

const pad = (n) => String(n).padStart(2, '0')
const MEDIA_TEXT = {
  'android-id': '<Media tidak disertakan>',
  'android-en': '<Media omitted>',
  'ios-id': '‎gambar tidak disertakan',
  'ios-en': '‎image omitted',
}
const DELETED_TEXT = {
  'android-id': 'Pesan ini telah dihapus',
  'android-en': 'This message was deleted',
  'ios-id': '‎Pesan ini dihapus.',
  'ios-en': '‎This message was deleted.',
}

/** Writes messages the way a phone exports them. */
export function formatExport(messages, style = 'android-id') {
  const [platform, lang] = style.split('-')
  const lines = []
  const first = messages[0] ? new Date(messages[0].t) : new Date()
  const stamp = (d) => {
    const yy = String(d.getFullYear()).slice(2)
    if (lang === 'en') {
      // US: month/day, 12-hour clock with a narrow no-break space before AM/PM
      const h = d.getHours() % 12 || 12
      const ap = d.getHours() < 12 ? 'AM' : 'PM'
      return platform === 'ios'
        ? `[${d.getMonth() + 1}/${d.getDate()}/${yy}, ${h}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${ap}]`
        : `${d.getMonth() + 1}/${d.getDate()}/${yy}, ${h}:${pad(d.getMinutes())} ${ap}`
    }
    return platform === 'ios'
      ? `[${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${yy} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}]`
      : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${yy} ${pad(d.getHours())}.${pad(d.getMinutes())}`
  }
  const sep = platform === 'ios' ? ' ' : ' - '
  const notice = lang === 'en'
    ? 'Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.'
    : 'Pesan dan panggilan terenkripsi secara end-to-end. Tidak seorang pun di luar chat ini, termasuk WhatsApp, yang dapat membaca atau mendengarkannya.'
  lines.push(platform === 'ios' ? `${stamp(first)} ${messages[0]?.author ?? 'Chat'}: ‎${notice}` : `${stamp(first)}${sep}${notice}`)
  for (const m of messages) {
    const body = m.kind === 'media' ? MEDIA_TEXT[style] : m.kind === 'deleted' ? DELETED_TEXT[style] : m.text
    lines.push(`${stamp(new Date(m.t))}${sep}${m.author}: ${body}`)
  }
  return lines.join(platform === 'ios' ? '\r\n' : '\n') + '\n'
}
