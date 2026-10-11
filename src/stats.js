// Everything the story tells, computed once from the parsed messages.

const HOUR = 3600000
const DAY = 24 * HOUR
// a new conversation starts after this much silence
const NEW_CONVERSATION = 6 * HOUR

// words too common to say anything about the two of you (Indonesian, chat slang, English)
const STOP = new Set(`
yang dan di ke dari ini itu aku kamu ya yaa yah ga gak nggak ngga enggak engga tidak bukan udah sudah belum
aja saja juga kan sih deh dong lah kok nih tuh tu gitu gini kayak kaya kek jadi terus trus tapi tp sama
ada apa mau bisa lagi lg buat untuk utk dengan dgn karena krn kalau kalo klo pas aku ku mu dia kita kami
mereka nya an ini itu emang memang banget bgt sangat aja oke ok okay okee sip iya iyaa iyaaa yg dah udh
sini situ sana mana gimana kenapa knp abis habis bentar nanti ntar dulu baru sampe sampai tadi nah loh
lho kalian kak mas mbak bang gue gua lu lo elu dulu jg tau tahu sih udahan aku
the a an and or to of in on at is it i you me my we be do so not no yes but for this that with are was
just like what have get got can its im dont
`.split(/\s+/).filter(Boolean))
const LAUGH = /\b(w+k+w*k*[wk]*|(?:ha){2,}h?|(?:he){2,}h?|(?:hi){2,}h?|a+wo+k\w*|ak+wk\w*|xi(?:xi)+|lol+|lmao+)\b/gi
const EMOJI = /\p{Extended_Pictographic}/u
// what you call each other (besides your names): pet names and the like
const CALLS = new Set(`
sayang syg sayangku ayang ayangku beb bebeb bebi baby bby babe honey hun darling cantik ganteng bub bubu
ndut gendut cil bocil dek adek adik kakak bestie bes bro bre cuy coy sis gan bos boss
`.split(/\s+/).filter(Boolean))
// a word, however it's stretched: "sayanggg", "sayangg" and "sayang" are one, "bangeeet" is "bangeet"
const stem = (w) => w.replace(/(.)\1{2,}/g, '$1$1').replace(/(\p{L})\1+$/u, '$1')
const URL = /https?:\/\/\S+|www\.\S+/g

const dayKey = (t) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
const median = (arr) => {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export function computeStats({ messages, people }, { title = null } = {}) {
  const by = new Map(people.map((p) => [p, {
    name: p, messages: 0, words: 0, media: 0, deleted: 0, starts: 0, laughs: 0, night: 0,
    replies: [], words_: new Map(), calls: new Map(), emoji: new Map(), longest: null,
  }]))
  // how each word is written, most often (to show it the way you write it)
  const forms = new Map()
  // everyone's name, as a word (the first word of it): what the others may call them
  const names = new Map(people.map((p) => [p, stem(p.toLowerCase().match(/\p{L}+/u)?.[0] ?? '')]))
  const hours = new Array(24).fill(0)
  const weekdays = new Array(7).fill(0)
  const days = new Map() // dayKey → count
  let first = null
  let words = 0
  let laughs = 0
  let prev = null
  let conversations = 0
  const starters = [] // who opened each conversation, in order
  const order = new Map(people.map((p, i) => [p, i]))
  const sequence = new Uint16Array(messages.length) // who sent each message (index into people)
  let n = 0

  const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null

  for (const m of messages) {
    const p = by.get(m.author)
    p.messages++
    sequence[n++] = order.get(m.author)
    const d = new Date(m.t)
    hours[d.getHours()]++
    if (d.getHours() < 4) p.night++
    weekdays[d.getDay()]++
    const k = dayKey(m.t)
    days.set(k, (days.get(k) ?? 0) + 1)

    // conversations and who starts them; how long until the other one answers
    if (!prev || m.t - prev.t >= NEW_CONVERSATION) {
      conversations++
      p.starts++
      starters.push(m.author)
    } else if (prev.author !== m.author) {
      p.replies.push(m.t - prev.t)
    }
    prev = m

    if (m.kind === 'media') p.media++
    if (m.kind === 'deleted') p.deleted++
    if (m.kind !== 'text') continue
    if (!first) first = m

    const text = m.text.replace(URL, ' ')
    const tokens = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []
    p.words += tokens.length
    words += tokens.length
    if (!p.longest || tokens.length > p.longest.words) p.longest = { words: tokens.length, t: m.t, text: m.text }

    const l = text.match(LAUGH)?.length ?? 0
    p.laughs += l
    laughs += l
    for (const raw of tokens) {
      if (raw.length < 3 || /^\d+$/.test(raw) || STOP.has(raw)) continue
      if (/^(w+k+[wk]*|(ha)+h?|(he)+h?|(hi)+h?)$/.test(raw)) continue // laughter is counted on its own
      const w = stem(raw)
      // a pet name, or (the start of) someone else's name
      if (CALLS.has(w) || people.some((q) => q !== m.author && w.length >= 3 && names.get(q).startsWith(w))) p.calls.set(w, (p.calls.get(w) ?? 0) + 1)
      if (STOP.has(w)) continue
      p.words_.set(w, (p.words_.get(w) ?? 0) + 1)
      const f = forms.get(w) ?? new Map()
      f.set(raw, (f.get(raw) ?? 0) + 1)
      forms.set(w, f)
    }
    if (EMOJI.test(text)) {
      const graphemes = segmenter ? [...segmenter.segment(text)].map((s) => s.segment) : [...text]
      for (const g of graphemes) if (EMOJI.test(g)) p.emoji.set(g, (p.emoji.get(g) ?? 0) + 1)
    }
  }

  // — days: busiest, streaks, the calendar —
  const start = new Date(messages[0].t)
  const end = new Date(messages[messages.length - 1].t)
  const day0 = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const spanDays = Math.round((new Date(end.getFullYear(), end.getMonth(), end.getDate()) - day0) / DAY) + 1
  const calendar = []
  let streak = 0
  let best = { length: 0, from: null, to: null }
  let run = 0
  let runFrom = null
  for (let i = 0; i < spanDays; i++) {
    const d = new Date(day0.getFullYear(), day0.getMonth(), day0.getDate() + i)
    const n = days.get(dayKey(d.getTime())) ?? 0
    calendar.push({ date: d, n })
    if (n) {
      if (!run) runFrom = d
      run++
      if (run > best.length) best = { length: run, from: runFrom, to: d }
    } else run = 0
  }
  streak = best
  const busiest = calendar.reduce((a, b) => (b.n > a.n ? b : a), calendar[0])

  const peakHour = hours.indexOf(Math.max(...hours))
  const night = hours.slice(0, 4).reduce((a, b) => a + b, 0) // midnight to 4am

  const shown = (w) => [...(forms.get(w) ?? [[w, 1]])].sort((a, b) => b[1] - a[1])[0][0]
  const persons = people.map((name) => {
    const p = by.get(name)
    return {
      name,
      messages: p.messages,
      share: p.messages / messages.length,
      words: p.words,
      media: p.media,
      deleted: p.deleted,
      starts: p.starts,
      startShare: conversations ? p.starts / conversations : 0,
      replyMedian: median(p.replies),
      // (most exports only keep the minute, so medians often tie at 0: the mean tells them apart)
      replyMean: p.replies.length ? p.replies.reduce((x, y) => x + y, 0) / p.replies.length : null,
      laughs: p.laughs,
      night: p.night,
      longest: p.longest,
      topWords: [...p.words_.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w, n]) => [shown(w), n]),
      // what they call the other one(s) most
      calls: [...p.calls.entries()].sort((a, b) => b[1] - a[1]).filter(([, n]) => n >= 5).slice(0, 1).map(([w, n]) => [shown(w), n])[0] ?? null,
      topEmoji: [...p.emoji.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    }
  })

  // words that are distinctly one person's: used a lot, and far more by them than the others
  // (share: how much of everyone's use of it is theirs)
  for (const p of persons) {
    const mine = by.get(p.name).words_
    const list = []
    for (const [w, n] of mine) {
      if (n < 5) continue
      let others = 0
      for (const q of persons) if (q !== p) others += by.get(q.name).words_.get(w) ?? 0
      if (n / (n + others) < 0.7) continue
      list.push({ word: shown(w), n, share: n / (n + others), score: n / (others + 2) })
    }
    p.signatures = list.sort((a, b) => b.score - a.score).slice(0, 3)
    p.signature = p.signatures[0] ?? null
  }

  return {
    people: persons,
    group: people.length > 2,
    title,
    total: messages.length,
    words,
    laughs,
    conversations,
    starters,
    sequence,
    first,
    start,
    end,
    spanDays,
    activeDays: days.size,
    hours,
    weekdays,
    peakHour,
    nightShare: night / messages.length,
    calendar,
    busiest,
    streak,
  }
}
