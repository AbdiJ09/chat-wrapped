// Parses a WhatsApp chat export (the _chat.txt / "WhatsApp Chat with X.txt" file) into messages.
//
// Every phone writes it a little differently:
//   Android, Indonesian   12/10/24 21.30 - Nadia: halo
//   Android, English (US) 10/12/24, 9:30 PM - Nadia: hi
//   iPhone, Indonesian    [12/10/24 21.30.15] Nadia: halo
//   iPhone, English       [10/12/24, 9:30:15 PM] Nadia: hi
// …plus 4-digit years, dashes or dots in dates, invisible direction marks (U+200E/U+200F) and
// narrow no-break spaces before AM/PM. A message can run over many lines; only its first line
// has a timestamp. Lines without "Name: " are system notices (encryption, group changes).

// iPhone: "[date time] rest"; Android: "date time - rest" (strict, so a message that merely starts
// with a date doesn't get mistaken for a new one)
const HEAD = /^[\u200e\u200f\u202a-\u202e\ufeff]*(\[)?(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4}),?\s+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?(?:[\s\u202f\u00a0]*([AaPp])\.?\s?[Mm]\.?)?(\]\s*|\s+-\s+)(.*)$/

// what the exported text says in place of things it didn't include
const MEDIA = [
  /^<?(media omitted|media tidak disertakan|media tidak dilampirkan)>?$/i,
  /^(image|video|audio|sticker|gif|document|contact card|gambar|foto|stiker|dokumen|kartu kontak)\s+(omitted|tidak disertakan|dihilangkan)$/i,
  /^<(attached|lampiran|terlampir):\s*.+>$/i,
  /^\S+\.(jpe?g|png|webp|gif|mp4|mov|opus|ogg|m4a|mp3|pdf|vcf|webm)\s*\((file attached|file terlampir)\)$/i,
]
const DELETED = /^(this message was deleted|you deleted this message|pesan ini (telah )?dihapus|anda menghapus pesan ini|kamu menghapus pesan ini)\.?$/i
const EDITED = /\s*<(this message was edited|pesan ini (telah )?diedit)>\s*$/i
const SYSTEM_HINTS = /end-to-end|terenkripsi|enkripsi end|security code|kode keamanan|created group|membuat grup|added|menambahkan|left$|keluar$|changed the subject|mengubah subjek|changed this group|mengubah ikon|joined using|bergabung menggunakan|missed (voice|video) call|panggilan (suara|video) tak terjawab|disappearing messages|pesan sementara|is a contact|adalah kontak/i

const clean = (s) => s.replace(/[\u200e\u200f\u202a-\u202e\ufeff]/g, '')

/**
 * @param {string} text the whole export
 * @returns {{ messages: Message[], people: string[], format: object }}
 * Message: { t: ms since epoch (local time), author, text, kind: 'text'|'media'|'deleted', edited }
 */
export function parseWhatsApp(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')

  // pass 1: find the timestamped lines and decide day/month order from the numbers themselves
  const heads = []
  let firstMax = 0
  let secondMax = 0
  let ampm = false
  for (let i = 0; i < lines.length; i++) {
    const m = HEAD.exec(lines[i])
    if (!m || !m[1] !== !m[9].startsWith(']')) continue
    const a = +m[2]
    const b = +m[3]
    if (m[2].length < 4) {
      firstMax = Math.max(firstMax, a)
      secondMax = Math.max(secondMax, b)
    }
    if (m[8]) ampm = true
    heads.push({ i, m })
  }
  if (!heads.length) throw new ChatFormatError()

  // dd/mm unless the numbers prove otherwise; US-style AM/PM exports lean mm/dd
  let order = 'dmy'
  if (heads[0].m[2].length === 4) order = 'ymd'
  else if (firstMax > 12) order = 'dmy'
  else if (secondMax > 12) order = 'mdy'
  else if (ampm) order = 'mdy'

  const messages = []
  const people = new Map()
  let last = null
  let cursor = 0
  for (const { i, m } of heads) {
    // lines between the previous header and this one belong to the previous message
    if (last && i > cursor + 1) last.text += '\n' + lines.slice(cursor + 1, i).join('\n')
    cursor = i

    let [y, mo, d] = order === 'ymd' ? [+m[2], +m[3], +m[4]] : order === 'dmy' ? [+m[4], +m[3], +m[2]] : [+m[4], +m[2], +m[3]]
    if (y < 100) y += 2000
    let h = +m[5]
    if (m[8]) {
      const pm = m[8].toLowerCase() === 'p'
      if (h === 12) h = pm ? 12 : 0
      else if (pm) h += 12
    }
    const t = new Date(y, mo - 1, d, h, +m[6], +(m[7] ?? 0)).getTime()
    const rest = m[10]
    const colon = rest.indexOf(': ')
    if (colon <= 0 || colon > 80) {
      last = null // a system notice ("Messages and calls are end-to-end encrypted…")
      continue
    }
    const author = clean(rest.slice(0, colon)).trim()
    const body = rest.slice(colon + 2)
    // iPhone writes system notices as if the chat itself said them, marked with U+200E
    if (/^[\u200e\u200f]/.test(body) && SYSTEM_HINTS.test(body) && !MEDIA.some((r) => r.test(clean(body).trim()))) {
      last = null
      continue
    }
    last = { t, author, text: body, kind: 'text', edited: false }
    messages.push(last)
  }
  if (last && cursor < lines.length - 1) last.text += '\n' + lines.slice(cursor + 1).join('\n')

  for (const msg of messages) {
    let body = clean(msg.text).trim()
    if (EDITED.test(body)) {
      msg.edited = true
      body = body.replace(EDITED, '')
    }
    if (MEDIA.some((r) => r.test(body))) msg.kind = 'media'
    else if (DELETED.test(body)) msg.kind = 'deleted'
    msg.text = msg.kind === 'text' ? body : ''
    people.set(msg.author, (people.get(msg.author) ?? 0) + 1)
  }
  // timestamps only have minute precision on Android: keep the file's order
  return {
    messages,
    people: [...people.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name),
    format: { order, ampm, ios: !!heads[0].m[1] },
  }
}

export class ChatFormatError extends Error {
  constructor() {
    super("This doesn't look like a WhatsApp chat export.")
    this.name = 'ChatFormatError'
  }
}
