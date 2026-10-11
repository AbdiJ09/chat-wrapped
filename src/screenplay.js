// The film's script: not numbers, the chat's own lines, picked out of it to tell what happened.
//
//   opening   how it began: the first conversation, line by line
//   skips     a week later, a month later, a year later: a little exchange from each
//   busiest   the busiest day: a few lines from it
//   night     a conversation after midnight
//   silence   the longest the chat went quiet: the last line before, the first ones after
//   now       the latest lines
//
// A line: { t, author, text }. Only short, plain lines are used (no links, no media).

const HOUR = 3600000
const DAY = 24 * HOUR
const ok = (m) => m && m.kind === 'text' && m.text.length >= 2 && m.text.length <= 90 && !/https?:\/\/|www\./i.test(m.text)
const line = (m) => ({ t: m.t, author: m.author, text: m.text.replace(/\s+/g, ' ').trim() })

// from message i on: up to n good lines of the same conversation (no gap longer than `gap`)
function exchange(messages, i, n, gap = 2 * HOUR) {
  const out = []
  for (let k = i; k < messages.length && out.length < n; k++) {
    if (k > i && messages[k].t - messages[k - 1].t > gap) break
    if (ok(messages[k])) out.push(line(messages[k]))
  }
  return out
}
// the first message at or after time t
function at(messages, t) {
  let lo = 0
  let hi = messages.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (messages[mid].t < t) lo = mid + 1
    else hi = mid
  }
  return lo
}
// the start of the next conversation from index i (after a pause of an hour or more)
function nextTalk(messages, i) {
  for (let k = Math.max(1, i); k < messages.length; k++) if (messages[k].t - messages[k - 1].t >= HOUR) return k
  return i
}

const NIGHT_WORDS = /(tidur|bobo|bubu|ngantuk|malem|malam|begadang|good ?night|\bgn\b|insomnia|belum tidur)/i
const SKIPS = [
  [7, 'Seminggu kemudian.'],
  [30, 'Sebulan kemudian.'],
  [100, 'Seratus hari kemudian.'],
  [365, 'Setahun kemudian.'],
  [730, 'Dua tahun kemudian.'],
]

export function screenplay(messages, S) {
  if (!messages.length) return null
  const start = messages[0].t
  const end = messages[messages.length - 1].t
  const span = (end - start) / DAY

  const opening = exchange(messages, 0, 6, 6 * HOUR)

  const skips = []
  for (const [days, card] of SKIPS) {
    if (days > span - 3) break
    // the first conversation from that day on
    const d = new Date(start + days * DAY)
    const i = nextTalk(messages, at(messages, new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()))
    const lines = exchange(messages, i, 3)
    if (lines.length >= 2) skips.push({ card, lines })
  }
  // at most three, the furthest apart
  while (skips.length > 3) skips.splice(1, 1)

  let busiest = null
  if (S.busiest?.n > 20) {
    const d = S.busiest.date
    const from = at(messages, new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime())
    const to = at(messages, new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime())
    const day = messages.slice(from, to).filter(ok)
    const lines = [0.2, 0.5, 0.8].map((f) => day[Math.floor(f * day.length)]).filter(Boolean).map(line)
    if (lines.length) busiest = { t: d.getTime(), n: S.busiest.n, lines }
  }

  // a night: the first time after the first tenth of the chat that someone talks of sleep after midnight
  let night = null
  for (let k = Math.floor(messages.length * 0.1); k < messages.length; k++) {
    const m = messages[k]
    const h = new Date(m.t).getHours()
    if (h < 4 && ok(m) && NIGHT_WORDS.test(m.text)) {
      const lines = exchange(messages, Math.max(0, k - 1), 3, 30 * 60000)
      if (lines.length >= 2) {
        night = { t: m.t, lines }
        break
      }
    }
  }

  let silence = null
  for (let k = 1, best = 0; k < messages.length; k++) {
    const gap = messages[k].t - messages[k - 1].t
    if (gap > best) {
      best = gap
      silence = { ms: gap, from: messages[k - 1].t, to: messages[k].t, i: k }
    }
  }
  if (silence && silence.ms >= DAY) {
    let b = silence.i - 1
    while (b > 0 && !ok(messages[b])) b--
    silence = { ms: silence.ms, from: silence.from, to: silence.to, before: ok(messages[b]) ? line(messages[b]) : null, after: exchange(messages, silence.i, 2, 6 * HOUR) }
  } else silence = null

  const now = []
  for (let k = messages.length - 1; k >= 0 && now.length < 4; k--) if (ok(messages[k])) now.unshift(line(messages[k]))

  return { opening, skips, busiest, night, silence, now }
}
