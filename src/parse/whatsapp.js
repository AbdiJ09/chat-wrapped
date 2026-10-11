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
//
// A message can also hold what looks like another one: copy a few messages in WhatsApp and paste
// them, and they come out as "[10/10/24 21.30] Dinda: halo". Those aren't the chat's: they're
// written differently from the export's own lines (brackets on Android, no seconds on iPhone) or
// they go back in time, so they stay part of the message they were pasted into.

// iPhone: "[date time] rest"; Android: "date time - rest" (strict, so a message that merely starts
// with a date doesn't get mistaken for a new one)
const HEAD = /^[\u200e\u200f\u202a-\u202e\ufeff]*(\[)?(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4}),?\s+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?(?:[\s\u202f\u00a0]*([AaPp])\.?\s?[Mm]\.?)?(\]\s*|\s+-\s+)(.*)$/

// what the exported text says in place of things it didn't include
const MEDIA = [
  /^<?(media omitted|media tidak disertakan|media tidak dilampirkan)>?$/i,
  /^(image|video|audio|sticker|gif|document|contact card|gambar|foto|stiker|dokumen|kartu kontak)\s+(omitted|tidak disertakan|dihilangkan)$/i,
]
// an export "with media" names the file instead; a caption, if any, comes before it (iPhone) or on the next lines (Android)
const ATTACHED_IOS = /\s*<(?:attached|lampiran|terlampir):\s*([^>]+)>\s*$/i
const ATTACHED_ANDROID = /^(\S+\.[a-z0-9]{2,5})\s*\((?:file attached|file terlampir)\)\s*/i
const DELETED = /^(this message was deleted|you deleted this message|pesan ini (telah )?dihapus|anda menghapus pesan ini|kamu menghapus pesan ini)\.?$/i
const EDITED = /\s*<(this message was edited|pesan ini (telah )?diedit)>\s*$/i
const SYSTEM_HINTS = /end-to-end|terenkripsi|enkripsi end|security code|kode keamanan|created group|membuat grup|added|menambahkan|left$|keluar$|changed the subject|mengubah subjek|changed this group|mengubah ikon|joined using|bergabung menggunakan|missed (voice|video) call|panggilan (suara|video) tak terjawab|disappearing messages|pesan sementara|is a contact|adalah kontak/i

const clean = (s) => s.replace(/[\u200e\u200f\u202a-\u202e\ufeff]/g, '')

/**
 * @param {string} text the whole export
 * @returns {{ messages: Message[], people: string[], format: object }}
 * Message: { t: ms since epoch (local time), author, text, kind: 'text'|'media'|'deleted', edited, media? }
 * (media: the attached file's name in an export with media; a captioned one stays kind 'text' with the caption)
 */
export function parseWhatsApp(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')

  // pass 1: find the timestamped lines, keep the ones written the way most of them are, and decide
  // day/month order from the numbers themselves
  let heads = []
  const looks = new Map()
  for (let i = 0; i < lines.length; i++) {
    const m = HEAD.exec(lines[i])
    if (!m || !m[1] !== !m[9].startsWith(']')) continue
    const look = `${!!m[1]} ${m[7] != null} ${!!m[8]}`
    looks.set(look, (looks.get(look) ?? 0) + 1)
    heads.push({ i, m, look })
  }
  if (!heads.length) throw new ChatFormatError()
  const usual = [...looks].sort((a, b) => b[1] - a[1])[0][0]
  heads = heads.filter((h) => h.look === usual)
  let firstMax = 0
  let secondMax = 0
  let ampm = false
  for (const { m } of heads) {
    if (m[2].length < 4) {
      firstMax = Math.max(firstMax, +m[2])
      secondMax = Math.max(secondMax, +m[3])
    }
    if (m[8]) ampm = true
  }

  // dd/mm unless the numbers prove otherwise; US-style AM/PM exports lean mm/dd
  let order = 'dmy'
  if (heads[0].m[2].length === 4) order = 'ymd'
  else if (firstMax > 12) order = 'dmy'
  else if (secondMax > 12) order = 'mdy'
  else if (ampm) order = 'mdy'

  const time = (m) => {
    let [y, mo, d] = order === 'ymd' ? [+m[2], +m[3], +m[4]] : order === 'dmy' ? [+m[4], +m[3], +m[2]] : [+m[4], +m[2], +m[3]]
    if (y < 100) y += 2000
    let h = +m[5]
    if (m[8]) {
      const pm = m[8].toLowerCase() === 'p'
      if (h === 12) h = pm ? 12 : 0
      else if (pm) h += 12
    }
    return new Date(y, mo - 1, d, h, +m[6], +(m[7] ?? 0)).getTime()
  }
  for (const h of heads) h.t = time(h.m)

  // the export runs forward in time: a line dated well before the ones above it was pasted in.
  // (Unless that happens a lot: then it's more likely we got the day/month order wrong.)
  let latest = -Infinity
  const back = heads.filter((h) => {
    const early = h.t < latest - 2 * 60000
    latest = Math.max(latest, h.t)
    return early
  })
  if (back.length <= Math.max(3, heads.length / 100)) heads = heads.filter((h) => !back.includes(h))

  const messages = []
  const people = new Map()
  let last = null
  let cursor = 0
  for (const { i, m, t } of heads) {
    // lines between the previous header and this one belong to the previous message
    if (last && i > cursor + 1) last.text += '\n' + lines.slice(cursor + 1, i).join('\n')
    cursor = i

    const rest = m[10]
    const colon = rest.indexOf(': ')
    if (colon <= 0 || colon > 80) {
      last = null // a system notice ("Messages and calls are end-to-end encrypted…")
      continue
    }
    const author = clean(rest.slice(0, colon)).trim()
    const body = rest.slice(colon + 2)
    // iPhone writes system notices as if the chat itself said them, marked with U+200E
    if (/^[\u200e\u200f]/.test(body) && SYSTEM_HINTS.test(body) && !ATTACHED_IOS.test(body) && !MEDIA.some((r) => r.test(clean(body).trim()))) {
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
    const file = body.match(ATTACHED_IOS) ?? body.match(ATTACHED_ANDROID)
    if (file) {
      msg.media = file[1].trim()
      body = body.replace(file[0], ' ').trim()
    }
    if (file ? !body : MEDIA.some((r) => r.test(body))) msg.kind = 'media'
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
