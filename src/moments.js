// The premium chapters' numbers: the first time one of you said it, who says it most, and the
// longest the chat ever went quiet. Each theme listens for its own words.

const LOVE = /\b(sayang(ku)?|syg|sygg+|cinta(ku)?|love (you|u|uu+)|luv (you|u)|i love|ily|lopyu|lop yu)\b/i
const LAUGH = /\b(w+k+w*k*[wk]*|(?:ha){2,}h?|(?:he){2,}h?|a+wo+k\w*)\b/i
export const LISTEN = {
  // who says it more, per theme: [what, the words]
  couple: /\b(sayang(ku)?|syg|sygg+|cinta(ku)?|love (you|u|uu+)|luv (you|u)|i love|ily|lopyu|kangen+|kgn|rindu|miss (you|u))\b/gi,
  bestie: /\b(anjir+|anjay+|anjrit|anjg|bjir+|njir+|gila+|gokil|astaga+|buset+)\b/gi,
  squad: /\b(anjir+|anjay+|anjrit|anjg|bjir+|njir+|gila+|gokil|astaga+|buset+)\b/gi,
  family: /(udah makan|sudah makan|udh makan|hati[- ]hati|ati[- ]ati|jangan lupa|istirahat|jaga kesehatan|sehat selalu)/gi,
  work: /\b(makasih+|terima ?kasih|thanks|thank you|thx|tq|maaf|mohon)\b/gi,
}

export function computeMoments(messages, people) {
  const first = { love: null, laugh: null }
  const counts = Object.fromEntries(Object.keys(LISTEN).map((id) => [id, Object.fromEntries(people.map((p) => [p, 0]))]))
  let silence = null
  let prev = null
  for (const m of messages) {
    if (prev && (!silence || m.t - prev.t > silence.ms)) silence = { ms: m.t - prev.t, from: prev.t, to: m.t, breaker: m.author, text: m.kind === 'text' ? m.text : '' }
    prev = m
    if (m.kind !== 'text') continue
    if (!first.love && LOVE.test(m.text)) first.love = m
    if (!first.laugh && LAUGH.test(m.text)) first.laugh = m
    for (const id in LISTEN) {
      const n = m.text.match(LISTEN[id])?.length
      if (n) counts[id][m.author] += n
    }
  }
  return { first, counts, silence }
}
