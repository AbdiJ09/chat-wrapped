import { W, H, M, DISPLAY, MONO, at, clamp, easeInOut, num, date, duration, text, wrap, eyebrow, measure, drawGrain } from './draw.js'
import * as shapes from '../three/shapes.js'
import { KINDS, CAMS, sceneShape, sceneMessage } from './scenes.js'
import { toFilm } from './film.js'

// The story: each slide is a sculpture for the bubbles (with a camera and a backdrop) plus a
// layer of words on top. The middle of the frame belongs to the 3D; words live above and below.
// The theme decides the colours, a few of the forms, and the voice.

const VOICE = {
  couple: {
    dna: 'Ini DNA cinta kalian.', first: 'Semuanya dimulai dari', share: 'Siapa yang lebih bawel', starter: 'Yang selalu nyapa duluan',
    fast: 'paling cepet bales.', night: (n) => `${n}% obrolan kalian lewat tengah malam. Bucin.`, words: 'Kata kalian', emoji: 'Emoji kalian', end: 'Bikin punya kalian sendiri.',
  },
  bestie: {
    dna: 'Ini DNA persahabatan kalian.', first: 'Awal mula', share: 'Siapa paling bawel', starter: 'Yang selalu ngechat duluan',
    fast: 'si paling fast respon.', night: (n) => `${n}% obrolan lewat tengah malam. Nggak tidur, ya?`, words: 'Kata andalan', emoji: 'Emoji andalan', end: 'Bikin punyamu sendiri.',
  },
  squad: {
    dna: 'Ini DNA geng kalian.', first: 'Pesan pertama di grup', share: 'Si paling bawel', starter: 'Si paling ngajak ngobrol',
    fast: 'si paling fast respon.', night: (n) => `${n}% pesan lewat tengah malam. Grup ini nggak pernah tidur.`, words: 'Kata wajib geng ini', emoji: 'Emoji wajib', end: 'Kirim ke grup.',
  },
  family: {
    dna: 'Ini DNA keluarga kalian.', first: 'Pesan pertama', share: 'Paling rajin ngabarin', starter: 'Yang paling sering nyapa',
    fast: 'paling cepet bales.', night: (n) => `${n}% pesan lewat tengah malam. Ada yang belum tidur.`, words: 'Kata favorit keluarga', emoji: 'Emoji keluarga', end: 'Kirim ke grup keluarga.',
  },
  work: {
    dna: 'Ini DNA tim kalian.', first: 'Pesan pertama', share: 'Paling aktif di grup', starter: 'Yang paling sering mulai thread',
    fast: 'fast response award.', night: (n) => `${n}% pesan dikirim lewat tengah malam. Lembur, ya?`, words: 'Kata paling sering', emoji: 'Emoji paling sering', end: 'Noted. Bikin punya timmu.',
  },
}

// premium: the chapters' titles, per theme
const MOMENTS = {
  couple: { first: ['love', 'Pertama kali bilang sayang'], count: 'Siapa yang lebih bucin', unit: 'kali bilang sayang, kangen, love you', quiet: 'Paling lama diem-dieman' },
  bestie: { first: ['laugh', 'Pertama kali ketawa bareng'], count: 'Siapa paling heboh', unit: 'kali bilang anjir, gila, buset', quiet: 'Paling lama nggak ngobrol' },
  squad: { first: ['laugh', 'Pertama kali grup ini ketawa'], count: 'Siapa paling heboh', unit: 'kali bilang anjir, gila, buset', quiet: 'Grup paling lama sepi' },
  family: { first: ['laugh', 'Pertama kali ketawa bareng'], count: 'Siapa paling perhatian', unit: 'kali nanya udah makan & bilang hati-hati', quiet: 'Paling lama sepi' },
  work: { first: ['laugh', 'Pertama kali ada yang ketawa'], count: 'Siapa paling sopan', unit: 'kali bilang makasih & maaf', quiet: 'Paling lama sepi' },
}

const first = (name) => name.split(/\s+/)[0]
const years = (S) => `${S.start.getFullYear()}${S.end.getFullYear() !== S.start.getFullYear() ? `–${S.end.getFullYear()}` : ''}`
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
const big = (size, extra = {}) => ({ size, weight: 800, family: DISPLAY, spacing: -size * 0.04, ...extra })
const head = (size, extra = {}) => ({ size, weight: 600, family: DISPLAY, spacing: -size * 0.02, ...extra })

function mix(a, b, k) {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k)
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`
}

// shade the bottom (and top) so words stay readable over the light
function shade(ctx, top = true) {
  let g = ctx.createLinearGradient(0, H * 0.6, 0, H)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.6)')
  ctx.fillStyle = g
  ctx.fillRect(0, H * 0.6, W, H * 0.4)
  if (top) {
    g = ctx.createLinearGradient(0, 0, 0, H * 0.32)
    g.addColorStop(0, 'rgba(0,0,0,0.5)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H * 0.32)
  }
}

/** Words appear a beat after the bubbles start landing. */
const late = 1.1

/**
 * premium (or null): { moments (computeMoments), photo (a 4:5 canvas, or null), message (your
 * words for the end, or ''), title (for the cover, or ''), hidden (a Set of slide ids to leave
 * out) } — adds the chapters, the ending, and takes the watermark off. Every slide has an id and
 * a label (for choosing which to keep). only: build just the slide with this id (a preview);
 * sculpt: false to skip building the sculptures (when only the slides' lengths and names matter).
 * style: 'recap' (like a year in review) or 'film' (told like a film: see film.js).
 */
export function makeStory(S, N, theme, premium = null, { only = null, sculpt = true, style = 'recap' } = {}) {
  shapes.usePalette(theme)
  const A = shapes.authors(S, N)
  const P = S.people
  const V = VOICE[theme.id]
  const PM = MOMENTS[theme.id]
  const FG = theme.ink
  const MUTED = `${theme.ink}a0`
  const colorOf = (i) => theme.people[Math.min(Math.max(i, 0), theme.people.length - 1)]
  const who = premium?.title?.trim() || (S.group ? S.title ?? `${P.length} orang` : `${P[0].name} & ${P[1].name}`)
  // backdrops: the theme's dark, lit by each slide's own tint
  const bgs = [theme.glow, mix(theme.bg, theme.people[0], 0.22), mix(theme.bg, theme.people[1], 0.2), mix(theme.glow, theme.people[0], 0.12)]
  let n = 0
  const backdrop = () => ({ bg: theme.bg, glow: bgs[n % bgs.length], rim: theme.people[n++ % 2] })

  const slides = []
  const add = (s) => slides.push({ ...backdrop(), ...s })
  const top6 = P.slice(0, 6)
  const sum6 = top6.reduce((a, p) => a + p.share, 0)
  const shares = S.group ? top6.map((p) => p.share / sum6) : [P[0].share, P[1].share]
  const starter = [...P].sort((a, b) => b.starts - a.starts)[0]
  const si = P.indexOf(starter)

  // — 1. cover —
  add({
    id: 'cover',
    label: 'Sampul',
    duration: 6.5,
    shape: () => theme.id === 'couple' ? shapes.heart(N, A) : shapes.helix(N, A, Math.min(P.length, 6)),
    cam: { pos: [0, 2.4, 12.6], look: [0, 1.15, 0], orbit: 0.35, speed: 0.25 },
    words(ctx, t) {
      shade(ctx, false)
      const y0 = 1420
      text(ctx, years(S), M, y0 - 170, { size: 28, family: MONO, weight: 500, spacing: 3, color: MUTED, alpha: at(t, 1.5) })
      if (S.group || premium?.title?.trim()) {
        wrap(ctx, who, W - 2 * M, big(140)).slice(0, 2).forEach((l, i) => text(ctx, l, M, y0 + i * 130, big(140, { color: FG, alpha: at(t, 1.8 + i * 0.15), rise: 60 })))
      } else {
        text(ctx, P[0].name, M, y0, big(150, { color: colorOf(0), alpha: at(t, 1.8), rise: 60 }))
        text(ctx, `& ${P[1].name}`, M, y0 + 140, big(150, { color: colorOf(1), alpha: at(t, 2.05), rise: 60 }))
      }
      text(ctx, `${num(S.total)} pesan · ${num(S.spanDays)} hari. ${V.dna}`, M, y0 + 250, { size: 34, color: MUTED, alpha: at(t, 2.6) })
    },
  })

  // — 2. the first message —
  if (S.first) {
    const m = S.first
    const ago = Math.max(0, Math.round((Date.now() - m.t) / 86400000))
    const ai = Math.max(0, P.findIndex((p) => p.name === m.author))
    add({
      id: 'first',
      label: 'Pesan pertama',
      duration: 6.5,
      shape: () => shapes.spark(N, A, ai),
      cam: { pos: [0, 2.0, 7.8], look: [0, 1.0, 0], orbit: 0.45, speed: 0.25 },
      words(ctx, t) {
        shade(ctx)
        eyebrow(ctx, V.first, 250, MUTED, at(t, late))
        text(ctx, date(new Date(m.t), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }), M, 310, { size: 32, color: MUTED, alpha: at(t, late + 0.2) })
        const quote = m.text.length > 140 ? `${m.text.slice(0, 137)}…` : m.text
        const size = quote.length < 24 ? 120 : quote.length < 60 ? 84 : 60
        const lines = wrap(ctx, `“${quote}”`, W - 2 * M, head(size)).slice(0, 5)
        const y0 = 1240
        lines.forEach((l, i) => text(ctx, l, M, y0 + i * size * 1.05, head(size, { color: FG, alpha: at(t, late + 0.5 + i * 0.15, 1.2), rise: 50 })))
        text(ctx, `— ${m.author}`, M, y0 + lines.length * size * 1.05 + 24, { size: 38, weight: 500, color: colorOf(ai), alpha: at(t, late + 1.3) })
        if (ago > 0) text(ctx, `${num(ago)} hari yang lalu.`, M, 1740, head(54, { color: FG, alpha: at(t, late + 2.1, 1.2) }))
      },
    })
  }

  // — premium: the first time one of you said it —
  const firstOf = premium?.moments.first[PM.first[0]]
  if (firstOf) {
    const m = firstOf
    const ai = Math.max(0, P.findIndex((p) => p.name === m.author))
    const d = new Date(m.t)
    const after = S.first ? Math.round((m.t - S.first.t) / 86400000) : 0
    add({
      id: 'moment',
      label: PM.first[1],
      duration: 7,
      shape: () => shapes.words(N, A, `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)}`, { width: 1.9 }),
      cam: { pos: [0, 1.6, 8.4], look: [0, 0.35, 0], orbit: 0.3, speed: 0.3 },
      words(ctx, t) {
        shade(ctx)
        eyebrow(ctx, PM.first[1], 250, MUTED, at(t, late))
        text(ctx, date(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }), M, 310, { size: 32, color: MUTED, alpha: at(t, late + 0.2) })
        const quote = m.text.length > 110 ? `${m.text.slice(0, 107)}…` : m.text
        const size = quote.length < 24 ? 110 : quote.length < 60 ? 80 : 58
        const lines = wrap(ctx, `“${quote}”`, W - 2 * M, head(size)).slice(0, 4)
        const y0 = 1300
        lines.forEach((l, i) => text(ctx, l, M, y0 + i * size * 1.05, head(size, { color: FG, alpha: at(t, late + 0.5 + i * 0.15, 1.2), rise: 50 })))
        text(ctx, `— ${m.author}, duluan.`, M, y0 + lines.length * size * 1.05 + 24, { size: 38, weight: 500, color: colorOf(ai), alpha: at(t, late + 1.3) })
        if (after > 0) text(ctx, `${num(after)} hari setelah pesan pertama.`, M, 1740, head(50, { color: FG, alpha: at(t, late + 2.1, 1.2) }))
      },
    })
  }

  // — 3. how much —
  const pages = Math.max(1, Math.ceil(S.words / 250))
  add({
    id: 'total',
    label: 'Total pesan',
    duration: 6.5,
    shape: () => shapes.words(N, A, num(S.total), { width: 2.1 }),
    cam: { pos: [0, 1.7, 8.6], look: [0, 0.25, 0], orbit: 0.3, speed: 0.3 },
    words(ctx, t) {
      shade(ctx)
      eyebrow(ctx, 'Total', 250, MUTED, at(t, late))
      text(ctx, 'pesan', W / 2, 1250, head(64, { color: MUTED, align: 'center', alpha: at(t, late + 0.3) }))
      const k = easeInOut(clamp((t - late) / 2))
      text(ctx, `${num(S.words * k)} kata`, M, 1520, big(110, { color: theme.accent, alpha: at(t, late + 0.8), rise: 0 }))
      wrap(ctx, `Kalau dicetak, jadi buku setebal ${num(pages)} halaman.`, W - 2 * M, { size: 40 }).forEach((l, i) =>
        text(ctx, l, M, 1600 + i * 52, { size: 40, color: FG, alpha: at(t, late + 1.6 + i * 0.15) }))
    },
  })

  // — 4. who talks more (duo) / the awards (group) —
  if (!S.group) {
    add({
      id: 'share',
      label: V.share,
      duration: 6.5,
      shape: () => shapes.orbs(N, A, shares),
      cam: { pos: [0, 2.2, 9.8], look: [0, 0.85, 0], orbit: 0.4, speed: 0.22 },
      words(ctx, t) {
        shade(ctx)
        eyebrow(ctx, V.share, 250, MUTED, at(t, late))
        const k = easeInOut(clamp((t - late) / 1.6))
        text(ctx, `${Math.round(P[0].share * 100 * k)}%`, M, 480, big(190, { color: colorOf(0), alpha: at(t, late + 0.2), rise: 0 }))
        text(ctx, first(P[0].name), M, 550, { size: 40, weight: 500, color: FG, alpha: at(t, late + 0.4) })
        text(ctx, `${Math.round(P[1].share * 100 * k)}%`, W - M, 1580, big(190, { color: colorOf(1), align: 'right', alpha: at(t, late + 0.5), rise: 0 }))
        text(ctx, first(P[1].name), W - M, 1650, { size: 40, weight: 500, color: FG, align: 'right', alpha: at(t, late + 0.7) })
        const diff = P[0].messages - P[1].messages
        text(ctx, diff > 0 ? `${first(P[0].name)} ngirim ${num(diff)} pesan lebih banyak.` : 'Seimbang. Hampir persis.', M, 1750, { size: 32, color: MUTED, alpha: at(t, late + 1.6) })
      },
    })
  } else {
    const ranked = [...P].sort((a, b) => b.messages - a.messages)
    const podiumTop = ranked.slice(0, 3).map((p) => Math.min(P.indexOf(p), 7))
    const active = P.filter((p) => p.messages >= 5)
    const most = (f) => [...active].sort((a, b) => f(b) - f(a))[0]
    const quicker = (a, b) => a.replyMedian - b.replyMedian || a.replyMean - b.replyMean
    const awards = []
    awards.push(['Si paling bawel', ranked[0], `${num(ranked[0].messages)} pesan`])
    const owl = most((p) => p.night / p.messages)
    if (owl?.night) awards.push(['Si paling malam', owl, `${Math.round((owl.night / owl.messages) * 100)}% pesannya lewat jam 12`])
    const quick = active.filter((p) => p.replyMedian != null).sort(quicker)[0]
    if (quick?.replyMedian != null) awards.push(['Si paling fast respon', quick, `bales dalam ${duration(quick.replyMedian)}`])
    const funny = most((p) => p.laughs / p.messages)
    if (funny?.laughs) awards.push(['Si paling receh', funny, `${num(funny.laughs)}× wkwk`])
    const quiet = [...P].sort((a, b) => a.messages - b.messages)[0]
    if (quiet !== ranked[0]) awards.push(['Si silent reader', quiet, `cuma ${num(quiet.messages)} pesan`])
    add({
      id: 'awards',
      label: 'Penghargaan',
      duration: 8,
      shape: () => shapes.podium(N, A, podiumTop),
      cam: { pos: [0, 2.6, 9.6], look: [0, 0.75, 0], orbit: 0.4, speed: 0.22 },
      words(ctx, t) {
        shade(ctx)
        eyebrow(ctx, 'Penghargaan', 250, MUTED, at(t, late))
        text(ctx, first(ranked[0].name), M, 400, big(150, { color: colorOf(P.indexOf(ranked[0])), alpha: at(t, late + 0.2), rise: 50 }))
        text(ctx, 'juara satu ngobrol.', M, 470, head(44, { color: FG, alpha: at(t, late + 0.4) }))
        awards.forEach(([title, p, note], i) => {
          const y = 1290 + i * 96
          const a = at(t, late + 0.7 + i * 0.22)
          text(ctx, title.toUpperCase(), M, y, { size: 22, family: MONO, weight: 500, spacing: 2, color: MUTED, alpha: a })
          text(ctx, first(p.name), M, y + 48, head(44, { color: colorOf(P.indexOf(p)), alpha: a }))
          text(ctx, note, W - M, y + 48, { size: 28, color: FG, align: 'right', alpha: a })
        })
      },
    })
  }

  // — premium: who says it more —
  if (premium) {
    const said = premium.moments.counts[theme.id]
    const who6 = (S.group ? top6 : P.slice(0, 2)).map((p) => ({ p, n: said[p.name] ?? 0 }))
    const sum = who6.reduce((a, x) => a + x.n, 0)
    if (sum >= 5) {
      const ranked = [...who6].sort((a, b) => b.n - a.n)
      const win = ranked[0]
      add({
        id: 'count',
        label: PM.count,
        duration: 7,
        shape: () => shapes.towers(N, A, who6.map((x) => x.n)),
        cam: { pos: [0, 2.1, 8.4], look: [0, 1.0, 0], orbit: 0.3, speed: 0.2 },
        words(ctx, t) {
          shade(ctx)
          eyebrow(ctx, PM.count, 250, MUTED, at(t, late))
          text(ctx, first(win.p.name), M, 430, big(170, { color: colorOf(P.indexOf(win.p)), alpha: at(t, late + 0.2), rise: 50 }))
          const k = easeInOut(clamp((t - late) / 1.6))
          text(ctx, `${num(win.n * k)} ${PM.unit}.`, M, 510, head(40, { color: FG, alpha: at(t, late + 0.4) }))
          ranked.slice(0, 4).forEach(({ p, n }, i) => {
            const y = 1460 + i * 92
            const a = at(t, late + 0.8 + i * 0.15)
            text(ctx, first(p.name), M, y, { size: 40, weight: 500, color: colorOf(P.indexOf(p)), alpha: a })
            text(ctx, `${num(n * k)}×`, W - M, y, head(56, { color: FG, align: 'right', alpha: a }))
          })
          if (!S.group && ranked[1].n > 0 && win.n > ranked[1].n * 1.15) {
            const x = win.n / ranked[1].n
            text(ctx, `${x.toFixed(x < 10 ? 1 : 0).replace('.', ',')}× lebih sering dari ${first(ranked[1].p.name)}.`, M, 1740, { size: 32, color: MUTED, alpha: at(t, late + 1.6) })
          } else if (!S.group) text(ctx, ranked[0].n === ranked[1].n ? 'Seri. Sama persis.' : `Tipis. Cuma beda ${num(ranked[0].n - ranked[1].n)}.`, M, 1740, { size: 32, color: MUTED, alpha: at(t, late + 1.6) })
        },
      })
    }
  }

  // — 5. who says hello first —
  add({
    id: 'starter',
    label: V.starter,
    duration: 6.5,
    shape: () => S.group || si > 1 ? shapes.orbs(N, A, shares) : shapes.bridge(N, A, shares, si),
    cam: { pos: [0, 2.4, 10.4], look: [0, 1.1, 0], orbit: 0.35, speed: 0.22 },
    words(ctx, t) {
      shade(ctx)
      eyebrow(ctx, V.starter, 250, MUTED, at(t, late))
      text(ctx, first(starter.name), M, 430, big(170, { color: colorOf(si), alpha: at(t, late + 0.2), rise: 50 }))
      wrap(ctx, `membuka ${Math.round(starter.startShare * 100)}% dari ${num(S.conversations)} obrolan.`, W - 2 * M, head(52)).forEach((l, i) =>
        text(ctx, l, M, 1600 + i * 62, head(52, { color: FG, alpha: at(t, late + 0.8 + i * 0.15) })))
    },
  })

  // — 6. reply speed —
  const R = P.filter((p) => p.replyMedian != null).slice(0, S.group ? 4 : 2)
  if (R.length) {
    const maxMean = Math.max(...R.map((p) => p.replyMean))
    const speeds = top6.map((p) => (p.replyMean != null && maxMean ? 0.35 + 1.6 * (1 - p.replyMean / (maxMean * 1.15)) : 0.3))
    const sorted = [...R].sort((a, b) => a.replyMedian - b.replyMedian || a.replyMean - b.replyMean)
    const fast = sorted[0]
    add({
      id: 'reply',
      label: 'Kecepatan bales',
      duration: 6.5,
      shape: () => shapes.rings(N, A, speeds),
      cam: { pos: [0, 3.8, 8.2], look: [0, 0.9, 0], orbit: 0.35, speed: 0.2 },
      words(ctx, t) {
        shade(ctx)
        eyebrow(ctx, 'Kecepatan bales', 250, MUTED, at(t, late))
        text(ctx, first(fast.name), M, 430, big(170, { color: colorOf(P.indexOf(fast)), alpha: at(t, late + 0.2), rise: 50 }))
        text(ctx, V.fast, M, 510, head(48, { color: FG, alpha: at(t, late + 0.4) }))
        sorted.forEach((p, i) => {
          const y = 1460 + i * 92
          const a = at(t, late + 0.8 + i * 0.15)
          text(ctx, first(p.name), M, y, { size: 40, weight: 500, color: colorOf(P.indexOf(p)), alpha: a })
          text(ctx, duration(p.replyMedian), W - M, y, head(56, { color: FG, align: 'right', alpha: a }))
        })
        if (!S.group && sorted.length === 2 && sorted[0].replyMedian > 0 && sorted[1].replyMedian > sorted[0].replyMedian * 1.4) {
          const x = sorted[1].replyMedian / sorted[0].replyMedian
          text(ctx, `${x.toFixed(x < 10 ? 1 : 0).replace('.', ',')}× lebih cepet. Cincinnya muter lebih kenceng.`, M, 1740, { size: 30, color: MUTED, alpha: at(t, late + 1.6) })
        }
      },
    })
  }

  // — 7. the hours —
  const night = Math.round(S.nightShare * 100)
  add({
    id: 'hours',
    label: 'Jam kalian',
    duration: 6.5,
    shape: () => shapes.pillars(N, A, S.hours, S.peakHour),
    cam: { pos: [0, 2.6, 9.4], look: [0, 0.75, -0.4], orbit: 0.3, speed: 0.2 },
    words(ctx, t) {
      shade(ctx)
      eyebrow(ctx, 'Jam kalian', 250, MUTED, at(t, late))
      text(ctx, `${String(S.peakHour).padStart(2, '0')}.00`, M, 450, big(200, { color: theme.accent, alpha: at(t, late + 0.2), rise: 50 }))
      text(ctx, 'jam paling rame. Tiap pilar satu jam.', M, 520, { size: 36, color: FG, alpha: at(t, late + 0.4) })
      if (night >= 3) wrap(ctx, V.night(night), W - 2 * M, head(50)).forEach((l, i) =>
        text(ctx, l, M, 1600 + i * 60, head(50, { color: FG, alpha: at(t, late + 1 + i * 0.15) })))
    },
  })

  // — 8. every day —
  add({
    id: 'days',
    label: 'Setiap hari',
    duration: 7,
    shape: () => shapes.terrain(N, A, S.calendar, S.busiest),
    cam: { pos: [3.6, 1.7, 4.4], look: [-0.4, 0.2, 0], orbit: 0.25, speed: 0.2, dolly: 0.02 },
    words(ctx, t) {
      shade(ctx)
      eyebrow(ctx, 'Setiap hari', 250, MUTED, at(t, late))
      text(ctx, num(S.activeDays), M, 430, big(170, { color: FG, alpha: at(t, late + 0.2), rise: 50 }))
      const w = measure(ctx, num(S.activeDays), big(170))
      text(ctx, `dari ${num(S.spanDays)} hari`, M + w + 24, 430, head(40, { color: MUTED, alpha: at(t, late + 0.4) }))
      text(ctx, 'Satu menara tiap hari, setahun terakhir.', M, 500, { size: 30, color: MUTED, alpha: at(t, late + 0.6) })
      text(ctx, 'HARI PALING RAME', M, 1470, { size: 24, family: MONO, weight: 500, spacing: 3, color: MUTED, alpha: at(t, late + 1) })
      text(ctx, `${date(S.busiest.date)} · ${num(S.busiest.n)} pesan`, M, 1530, head(50, { color: theme.accent, alpha: at(t, late + 1.1) }))
      if (S.streak.length > 2) {
        text(ctx, 'REKOR BERUNTUN', M, 1630, { size: 24, family: MONO, weight: 500, spacing: 3, color: MUTED, alpha: at(t, late + 1.5) })
        text(ctx, `${num(S.streak.length)} hari tanpa absen`, M, 1690, head(50, { color: FG, alpha: at(t, late + 1.6) }))
      }
    },
  })

  // — premium: the longest the chat went quiet, and who broke it —
  const quiet = premium?.moments.silence
  if (quiet && quiet.ms >= 12 * 3600000) {
    const bi = Math.max(0, P.findIndex((p) => p.name === quiet.breaker))
    const days = quiet.ms / 86400000
    const long = days >= 2 ? `${num(Math.floor(days))} hari` : `${num(Math.floor(quiet.ms / 3600000))} jam`
    const short = { day: 'numeric', month: 'short', year: 'numeric' }
    add({
      id: 'quiet',
      label: PM.quiet,
      duration: 7,
      shape: () => shapes.apart(N, A),
      cam: { pos: [0, 2.2, 9.2], look: [0, 0.8, 0], orbit: 0.15, speed: 0.12 },
      words(ctx, t) {
        shade(ctx)
        eyebrow(ctx, PM.quiet, 250, MUTED, at(t, late))
        text(ctx, long, M, 440, big(190, { color: FG, alpha: at(t, late + 0.2), rise: 50 }))
        text(ctx, `${date(new Date(quiet.from), short)} – ${date(new Date(quiet.to), short)}`, M, 520, { size: 34, color: MUTED, alpha: at(t, late + 0.4) })
        text(ctx, `Lalu ${first(quiet.breaker)} yang nyapa duluan:`, M, 1420, { size: 38, weight: 500, color: colorOf(bi), alpha: at(t, late + 1) })
        if (quiet.text) {
          const q = quiet.text.length > 90 ? `${quiet.text.slice(0, 87)}…` : quiet.text
          wrap(ctx, `“${q}”`, W - 2 * M, head(64)).slice(0, 3).forEach((l, i) => text(ctx, l, M, 1510 + i * 70, head(64, { color: FG, alpha: at(t, late + 1.3 + i * 0.15), rise: 40 })))
        }
      },
    })
  }

  // — 9. words —
  const all = new Map()
  for (const p of P) for (const [w, c] of p.topWords) all.set(w, (all.get(w) ?? 0) + c)
  const top = [...all.entries()].sort((a, b) => b[1] - a[1])
  if (top.length) {
    const [word, count] = top[0]
    const cols = P.slice(0, S.group ? 3 : 2)
    add({
      id: 'words',
      label: V.words,
      duration: 7,
      shape: () => shapes.words(N, A, word, { width: 2.1 }),
      cam: { pos: [0, 1.7, 8.6], look: [0, 0.25, 0], orbit: 0.3, speed: 0.3 },
      words(ctx, t) {
        shade(ctx)
        eyebrow(ctx, V.words, 250, MUTED, at(t, late))
        text(ctx, `${num(count)} kali.`, M, 330, head(48, { color: FG, alpha: at(t, late + 0.3) }))
        const colW = (W - 2 * M) / cols.length
        cols.forEach((p, pi) => {
          const x = M + pi * colW
          text(ctx, first(p.name), x, 1350, { size: 32, weight: 500, color: colorOf(pi), alpha: at(t, late + 0.6 + pi * 0.1) })
          p.topWords.filter(([w]) => w !== word).slice(0, 3).forEach(([w], i) =>
            text(ctx, w, x, 1420 + i * 64, head(52, { color: FG, alpha: at(t, late + 0.8 + pi * 0.1 + i * 0.12) })))
        })
        if (S.laughs > 0) text(ctx, `Plus ${num(S.laughs)}× wkwk, haha, hehe.`, M, 1740, { size: 32, color: MUTED, alpha: at(t, late + 1.8) })
      },
    })
  }

  // — 10. emoji —
  const fav = P.flatMap((p) => p.topEmoji).sort((a, b) => b[1] - a[1])[0]
  if (fav) {
    add({
      id: 'emoji',
      label: V.emoji,
      duration: 6.5,
      shape: () => shapes.emoji(N, A, fav[0]),
      cam: { pos: [0, 1.9, 8], look: [0, 1.2, 0], orbit: 0.3, speed: 0.3 },
      words(ctx, t) {
        shade(ctx)
        eyebrow(ctx, V.emoji, 250, MUTED, at(t, late))
        text(ctx, `${num(fav[1])} kali dikirim.`, M, 330, head(46, { color: FG, alpha: at(t, late + 0.3) }))
        P.filter((p) => p.topEmoji.length).slice(0, S.group ? 3 : 2).forEach((p, pi) => {
          const y = 1490 + pi * 128
          const a = at(t, late + 0.8 + pi * 0.2)
          text(ctx, first(p.name), M, y, { size: 36, weight: 500, color: colorOf(P.indexOf(p)), alpha: a })
          ctx.save()
          ctx.globalAlpha = a
          ctx.font = `76px ${EMOJI_FONT}`
          ctx.textAlign = 'right'
          ctx.fillText(p.topEmoji.slice(0, 3).map(([e]) => e).join(' '), W - M, y + 14)
          ctx.restore()
        })
      },
    })
  }

  // — premium: the scenes you made yourself (our layouts, your chat) —
  for (const sc of premium?.scenes ?? []) {
    const m = sceneMessage(sc)
    const ai = Math.max(0, P.findIndex((p) => p.name === m?.author))
    const title = sc.title?.trim() || (sc.kind === 'count' ? `“${sc.phrase}”` : KINDS[sc.kind].title)
    // a message, big, in lines (cut short if it's long)
    const quote = (ctx, msg, y0, { max = 110, cap = 110, rows = 4, delay = 0.5 } = {}, t = 0) => {
      const q = msg.text.length > max ? `${msg.text.slice(0, max - 3)}…` : msg.text
      const size = Math.min(cap, q.length < 24 ? 110 : q.length < 60 ? 80 : 58)
      const lines = wrap(ctx, `“${q}”`, W - 2 * M, head(size)).slice(0, rows)
      lines.forEach((l, i) => text(ctx, l, M, y0 + i * size * 1.05, head(size, { color: FG, alpha: at(t, late + delay + i * 0.15, 1.2), rise: 50 })))
      return y0 + lines.length * size * 1.05
    }
    add({
      id: sc.id,
      label: title,
      scene: sc,
      duration: 7,
      shape: () => sceneShape(sc, S, N, A),
      cam: CAMS[sc.object],
      words(ctx, t) {
        shade(ctx)
        eyebrow(ctx, title, 250, MUTED, at(t, late))
        if (sc.kind === 'quote') {
          text(ctx, date(new Date(m.t), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }), M, 310, { size: 32, color: MUTED, alpha: at(t, late + 0.2) })
          const end = quote(ctx, m, 1300, { max: 140 }, t)
          text(ctx, `— ${m.author}`, M, end + 24, { size: 38, weight: 500, color: colorOf(ai), alpha: at(t, late + 1.3) })
        } else if (sc.kind === 'count') {
          const k = easeInOut(clamp((t - late) / 1.6))
          text(ctx, `${num(sc.total * k)}×`, M, 450, big(190, { color: theme.accent, alpha: at(t, late + 0.2), rise: 0 }))
          text(ctx, `Pertama kali: ${date(new Date(m.t))}, ${first(m.author)}.`, M, 530, { size: 34, color: MUTED, alpha: at(t, late + 0.5) })
          const people = (S.group ? top6 : P.slice(0, 2)).map((p) => [p, sc.by[p.name] ?? 0]).sort((a, b) => b[1] - a[1]).slice(0, 4)
          people.forEach(([p, n], i) => {
            const y = 1460 + i * 92
            const a = at(t, late + 0.8 + i * 0.15)
            text(ctx, first(p.name), M, y, { size: 40, weight: 500, color: colorOf(P.indexOf(p)), alpha: a })
            text(ctx, `${num(n * k)}×`, W - M, y, head(56, { color: FG, align: 'right', alpha: a }))
          })
        } else {
          text(ctx, date(new Date(sc.t), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), M, 420, head(70, { color: FG, alpha: at(t, late + 0.2), rise: 40 }))
          text(ctx, `${num(sc.n)} pesan hari itu.`, M, 500, { size: 34, color: MUTED, alpha: at(t, late + 0.4) })
          if (m) {
            text(ctx, `DIMULAI ${first(m.author).toUpperCase()}, JAM ${date(new Date(m.t), { hour: '2-digit', minute: '2-digit' })}`, M, 1400, { size: 24, family: MONO, weight: 500, spacing: 3, color: colorOf(ai), alpha: at(t, late + 0.8) })
            quote(ctx, m, 1490, { max: 90, cap: 72, rows: 3, delay: 1 }, t)
          }
        }
      },
    })
  }

  // — 11. everything —
  const cells = [
    ['Pesan', num(S.total)],
    ['Hari ngobrol', num(S.activeDays)],
    ['Rekor beruntun', `${num(S.streak.length)} hari`],
    ['Jam favorit', `${String(S.peakHour).padStart(2, '0')}.00`],
    ['Nyapa duluan', first(starter.name)],
    ['Ketawa', `${num(S.laughs)}×`],
  ]
  add({
    id: 'summary',
    label: 'Semua dalam angka',
    duration: 8,
    shape: () => shapes.galaxy(N, A),
    cam: { pos: [0, 4.6, 9.4], look: [0, -0.1, 0], orbit: 0.6, speed: 0.15 },
    words(ctx, t) {
      shade(ctx)
      eyebrow(ctx, `${years(S)} dalam angka`, 250, MUTED, at(t, late))
      wrap(ctx, who, W - 2 * M, big(104)).slice(0, 2).forEach((l, i) => text(ctx, l, M, 370 + i * 100, big(104, { color: FG, alpha: at(t, late + 0.2 + i * 0.15) })))
      const y0 = 1080
      cells.forEach(([label, value], i) => {
        const x = M + (i % 2) * ((W - 2 * M) / 2)
        const y = y0 + Math.floor(i / 2) * 190
        const a = at(t, late + 0.6 + i * 0.12)
        text(ctx, label.toUpperCase(), x, y, { size: 22, family: MONO, weight: 500, spacing: 3, color: MUTED, alpha: a })
        text(ctx, value, x, y + 92, big(84, { color: i % 3 === 0 ? theme.accent : FG, alpha: a }))
      })
      text(ctx, V.end, M, 1745, head(40, { color: FG, alpha: at(t, late + 2) }))
    },
  })

  // — premium: the ending: your photo, made of every message, and your own words typed in —
  if (premium && (premium.photo || premium.message || only === 'ending')) {
    const msg = premium.message.trim()
    add({
      id: 'ending',
      label: 'Penutup',
      message: msg,
      duration: msg ? Math.min(14, 9 + msg.length / 30) : 9,
      shape: () => premium.photo ? shapes.portrait(N, A, premium.photo) : theme.id === 'couple' ? shapes.heart(N, A) : shapes.helix(N, A, Math.min(P.length, 6)),
      cam: premium.photo ? { pos: [0, 1.6, 10.6], look: [0, 1.15, 0], orbit: 0.12, speed: 0.12, dolly: 0.006 } : { pos: [0, 2.4, 12.6], look: [0, 1.15, 0], orbit: 0.35, speed: 0.25 },
      words(ctx, t) {
        shade(ctx, false)
        text(ctx, `${num(S.total)} pesan, jadi ini.`.toUpperCase(), M, 1390, { size: 26, family: MONO, weight: 500, spacing: 3, color: MUTED, alpha: at(t, 2.2) })
        if (msg) {
          // typed in, a letter at a time, after the picture has formed
          const shown = msg.slice(0, Math.max(0, Math.floor((t - 2.6) * 26)))
          const size = msg.length < 50 ? 76 : msg.length < 110 ? 60 : 48
          const lines = wrap(ctx, msg, W - 2 * M, head(size)).slice(0, 6)
          let left = shown.length
          lines.forEach((l, i) => {
            const part = l.slice(0, Math.max(0, left))
            left -= l.length + 1
            if (part) text(ctx, part, M, 1490 + i * size * 1.12, head(size, { color: FG, alpha: 1, rise: 0 }))
          })
        } else text(ctx, who, M, 1510, big(110, { color: FG, alpha: at(t, 2.6), rise: 50 }))
      },
    })
  }

  if (style === 'film') toFilm(slides, { S, who, theme, word: top[0] && { word: top[0][0], count: top[0][1] }, N, A, shapes, shares, colorOf })
  // premium: the scenes you switched off (never the first)
  if (premium?.hidden?.size) for (let i = slides.length - 1; i > 0; i--) if (premium.hidden.has(slides[i].id)) slides.splice(i, 1)
  // only now are the sculptures built (just the one, for a preview)
  if (only) slides.splice(0, slides.length, ...slides.filter((sl) => sl.id === only))
  if (sculpt) for (const sl of slides) sl.shape = sl.shape()

  if (style === 'film') return slides
  for (const s of slides) {
    const draw = s.words
    s.words = (ctx, t) => {
      draw(ctx, t)
      if (!premium) text(ctx, 'chatwrapped', M, H - 84, { size: 26, family: DISPLAY, weight: 800, spacing: -0.5, color: theme.accent, alpha: at(t, 0.2, 1), rise: 0 })
      text(ctx, who, W - M, H - 84, { size: 24, family: MONO, color: MUTED, align: 'right', alpha: at(t, 0.2, 1), rise: 0 })
      drawGrain(ctx, 0.04)
    }
  }
  return slides
}

/**
 * premium: the words of the poster (a print, A-paper shaped), drawn over the ending's sculpture.
 * Laid out on a page 1080 wide and h tall.
 */
export function posterWords(S, theme, premium) {
  const P = S.people
  const FG = theme.ink
  const MUTED = `${theme.ink}a0`
  const who = premium.title?.trim() || (S.group ? S.title ?? `${P.length} orang` : `${P[0].name} & ${P[1].name}`)
  const starter = [...P].sort((a, b) => b.starts - a.starts)[0]
  return (ctx, h) => {
    let g = ctx.createLinearGradient(0, h * 0.5, 0, h)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.72)')
    ctx.fillStyle = g
    ctx.fillRect(0, h * 0.5, W, h * 0.5)
    const msg = premium.message.trim()
    if (msg) {
      g = ctx.createLinearGradient(0, 0, 0, h * 0.3)
      g.addColorStop(0, 'rgba(0,0,0,0.55)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, h * 0.3)
      wrap(ctx, `“${msg}”`, W - 2 * M, head(40)).slice(0, 4).forEach((l, i) => text(ctx, l, M, 120 + i * 48, head(40, { color: FG })))
    }
    const y0 = h - 520
    text(ctx, `${years(S)} · ${num(S.spanDays)} hari`.toUpperCase(), M, y0, { size: 22, family: MONO, weight: 500, spacing: 3, color: MUTED })
    const lines = wrap(ctx, who, W - 2 * M, big(104)).slice(0, 2)
    lines.forEach((l, i) => text(ctx, l, M, y0 + 110 + i * 100, big(104, { color: FG })))
    const cells = [
      ['Pesan', num(S.total)],
      ['Hari ngobrol', num(S.activeDays)],
      ['Rekor beruntun', `${num(S.streak.length)} hari`],
      ['Nyapa duluan', first(starter.name)],
    ]
    const cw = (W - 2 * M) / cells.length
    cells.forEach(([label, value], i) => {
      const x = M + i * cw
      text(ctx, label.toUpperCase(), x, h - 170, { size: 17, family: MONO, weight: 500, spacing: 2, color: MUTED })
      text(ctx, value, x, h - 110, big(46, { color: i === 0 ? theme.accent : FG }))
    })
    drawGrain(ctx, 0.035)
  }
}
