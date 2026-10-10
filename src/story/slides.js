import { W, H, M, SERIF, at, clamp, easeInOut, num, date, duration, text, wrap, eyebrow, measure, drawGrain } from './draw.js'
import * as shapes from '../three/shapes.js'

// The story: each slide is a 3D form for the particles (with a camera and a colour) plus a layer
// of words drawn on top. The middle of the frame belongs to the 3D; words live above and below.

const BG = {
  ink: ['#0d0c0b', '#2b2216'],
  night: ['#0a1020', '#1b2a4a'],
  wine: ['#1c0a0d', '#43191d'],
  forest: ['#0a1613', '#17352d'],
  plum: ['#150c18', '#331b38'],
  deep: ['#090e11', '#1a2c34'],
}
const FG = '#f3ede3'
const MUTED = 'rgba(243,237,227,0.62)'
const css = (c) => `rgb(${c.map((v) => Math.round(Math.pow(Math.min(v, 1), 1 / 2.2) * 255)).join(',')})`
const colorOf = (i) => css(shapes.PALETTE[Math.min(Math.max(i, 0), shapes.PALETTE.length - 1)])
const first = (name) => name.split(/\s+/)[0]
const who = (S) => (S.group ? S.title ?? `${S.people.length} orang` : `${S.people[0].name} & ${S.people[1].name}`)
const years = (S) => `${S.start.getFullYear()}${S.end.getFullYear() !== S.start.getFullYear() ? `–${S.end.getFullYear()}` : ''}`
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'

// shade the bottom (and top) so words stay readable over the light
function shade(ctx, top = true) {
  let g = ctx.createLinearGradient(0, H * 0.62, 0, H)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = g
  ctx.fillRect(0, H * 0.62, W, H * 0.38)
  if (top) {
    g = ctx.createLinearGradient(0, 0, 0, H * 0.3)
    g.addColorStop(0, 'rgba(0,0,0,0.45)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H * 0.3)
  }
}

function footer(ctx, S, t) {
  text(ctx, 'CHAT WRAPPED', M, H - 84, { size: 24, weight: 500, spacing: 5, color: MUTED, alpha: at(t, 0.2, 1), rise: 0 })
  text(ctx, who(S), W - M, H - 84, { size: 24, color: MUTED, align: 'right', alpha: at(t, 0.2, 1), rise: 0 })
}

/** Words appear a beat after the particles start landing. */
const late = 1.2

export function makeStory(S, N) {
  const A = shapes.authors(S, N)
  const P = S.people
  const slides = []
  const add = (s) => slides.push(s)
  const top6 = P.slice(0, 6)
  const sum6 = top6.reduce((a, p) => a + p.share, 0)
  const shares = S.group ? top6.map((p) => p.share / sum6) : [P[0].share, P[1].share]

  // — 1. cover —
  add({
    duration: 6.5,
    shape: shapes.helix(N, A, Math.min(P.length, 6)),
    cam: { pos: [0, 0.4, 11], look: [0, -0.9, 0], orbit: 0.5, speed: 0.18 },
    bg: BG.ink[0], glow: BG.ink[1],
    words(ctx, t) {
      shade(ctx, false)
      const y0 = 1450
      text(ctx, years(S), M, y0 - 150, { size: 30, weight: 500, spacing: 5, color: MUTED, alpha: at(t, 1.6) })
      if (S.group) {
        wrap(ctx, who(S), W - 2 * M, { size: 118, weight: 300, family: SERIF }).slice(0, 2).forEach((l, i) =>
          text(ctx, l, M, y0 + i * 122, { size: 118, weight: 300, family: SERIF, color: FG, alpha: at(t, 1.9 + i * 0.2) }))
      } else {
        text(ctx, P[0].name, M, y0, { size: 128, weight: 300, family: SERIF, color: colorOf(0), alpha: at(t, 1.9) })
        text(ctx, `& ${P[1].name}`, M, y0 + 136, { size: 128, weight: 300, family: SERIF, italic: true, color: colorOf(1), alpha: at(t, 2.2) })
      }
      text(ctx, `${num(S.total)} pesan, ${num(S.spanDays)} hari. Ini DNA obrolan kalian.`, M, y0 + 240, { size: 34, color: MUTED, alpha: at(t, 2.8) })
    },
  })

  // — 2. the first message —
  if (S.first) {
    const m = S.first
    const ago = Math.max(0, Math.round((Date.now() - m.t) / 86400000))
    const ai = Math.max(0, P.findIndex((p) => p.name === m.author))
    add({
      duration: 6.5,
      shape: shapes.spark(N, A, ai),
      cam: { pos: [0, 1.0, 6.2], look: [0, -0.75, 0], orbit: 0.4, speed: 0.3 },
      bg: BG.night[0], glow: BG.night[1],
      words(ctx, t) {
        shade(ctx)
        eyebrow(ctx, 'Semuanya dimulai dari', 260, MUTED, at(t, late))
        text(ctx, date(new Date(m.t), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }), M, 320, { size: 34, color: MUTED, alpha: at(t, late + 0.2) })
        const quote = m.text.length > 140 ? `${m.text.slice(0, 137)}…` : m.text
        const size = quote.length < 24 ? 108 : quote.length < 60 ? 80 : 58
        const lines = wrap(ctx, `“${quote}”`, W - 2 * M, { size, weight: 300, family: SERIF, italic: true }).slice(0, 5)
        const y0 = 1260
        lines.forEach((l, i) => text(ctx, l, M, y0 + i * size * 1.12, { size, weight: 300, family: SERIF, italic: true, color: FG, alpha: at(t, late + 0.5 + i * 0.15, 1.2), rise: 40 }))
        const yy = y0 + lines.length * size * 1.12 + 20
        text(ctx, `— ${m.author}`, M, yy, { size: 38, color: colorOf(ai), alpha: at(t, late + 1.3) })
        if (ago > 0) text(ctx, `${num(ago)} hari yang lalu.`, M, 1740, { size: 50, weight: 300, family: SERIF, color: FG, alpha: at(t, late + 2.2, 1.2) })
      },
    })
  }

  // — 3. how much —
  const pages = Math.max(1, Math.ceil(S.words / 250))
  add({
    duration: 6.5,
    shape: shapes.words(N, A, num(S.total), { width: 1.75 }),
    cam: { pos: [0, 0.2, 6.4], look: [0, -0.1, 0], orbit: 0.14, speed: 0.4 },
    bg: BG.deep[0], glow: BG.deep[1],
    words(ctx, t) {
      shade(ctx)
      eyebrow(ctx, 'Semuanya', 300, MUTED, at(t, late))
      text(ctx, 'pesan', W / 2, 1250, { size: 64, weight: 300, family: SERIF, italic: true, color: MUTED, align: 'center', alpha: at(t, late + 0.3) })
      const k = easeInOut(clamp((t - late) / 2))
      text(ctx, `${num(S.words * k)} kata`, M, 1500, { size: 84, weight: 300, family: SERIF, color: colorOf(0), alpha: at(t, late + 0.8), rise: 0 })
      wrap(ctx, `Kalau dicetak, jadi buku setebal ${num(pages)} halaman.`, W - 2 * M, { size: 44, weight: 300, family: SERIF }).forEach((l, i) =>
        text(ctx, l, M, 1590 + i * 54, { size: 44, weight: 300, family: SERIF, color: FG, alpha: at(t, late + 1.6 + i * 0.15) }))
    },
  })

  // — 4. who talks more —
  add({
    duration: 6.5,
    shape: shapes.orbs(N, A, shares),
    cam: { pos: [0, 0.3, 7.6], look: [0, 0, 0], orbit: 0.3, speed: 0.25 },
    bg: BG.wine[0], glow: BG.wine[1],
    words(ctx, t) {
      shade(ctx)
      eyebrow(ctx, 'Siapa paling bawel', 260, MUTED, at(t, late))
      const k = easeInOut(clamp((t - late) / 1.6))
      if (!S.group) {
        text(ctx, `${Math.round(P[0].share * 100 * k)}%`, M, 470, { size: 150, weight: 300, family: SERIF, color: colorOf(0), alpha: at(t, late + 0.2), rise: 0 })
        text(ctx, first(P[0].name), M, 540, { size: 40, color: FG, alpha: at(t, late + 0.4) })
        text(ctx, `${Math.round(P[1].share * 100 * k)}%`, W - M, 1560, { size: 150, weight: 300, family: SERIF, color: colorOf(1), align: 'right', alpha: at(t, late + 0.5), rise: 0 })
        text(ctx, first(P[1].name), W - M, 1630, { size: 40, color: FG, align: 'right', alpha: at(t, late + 0.7) })
        const diff = P[0].messages - P[1].messages
        text(ctx, diff > 0 ? `${first(P[0].name)} ngirim ${num(diff)} pesan lebih banyak.` : 'Seimbang. Hampir persis.', M, 1745, { size: 34, color: MUTED, alpha: at(t, late + 1.6) })
      } else {
        top6.forEach((p, i) => {
          const y = 1300 + i * 72
          const a = at(t, late + 0.3 + i * 0.1)
          text(ctx, p.name, M, y, { size: 38, color: colorOf(i), alpha: a })
          text(ctx, `${Math.round(p.share * 100 * k)}%`, W - M, y, { size: 44, weight: 300, family: SERIF, color: FG, align: 'right', alpha: a })
        })
      }
    },
  })

  // — 5. who says hello first —
  const starter = [...P].sort((a, b) => b.starts - a.starts)[0]
  const si = P.indexOf(starter)
  add({
    duration: 6.5,
    shape: S.group || si > 1 ? shapes.orbs(N, A, shares) : shapes.bridge(N, A, shares, si),
    cam: { pos: [0, 0.6, 7.2], look: [0, 0.2, 0], orbit: 0.35, speed: 0.22 },
    bg: BG.plum[0], glow: BG.plum[1],
    words(ctx, t) {
      shade(ctx)
      eyebrow(ctx, 'Yang nyapa duluan', 260, MUTED, at(t, late))
      text(ctx, first(starter.name), M, 430, { size: 150, weight: 300, family: SERIF, color: colorOf(si), alpha: at(t, late + 0.2) })
      wrap(ctx, `membuka ${Math.round(starter.startShare * 100)}% dari ${num(S.conversations)} obrolan kalian.`, W - 2 * M, { size: 48, weight: 300, family: SERIF }).forEach((l, i) =>
        text(ctx, l, M, 1560 + i * 60, { size: 48, weight: 300, family: SERIF, color: FG, alpha: at(t, late + 0.8 + i * 0.15) }))
    },
  })

  // — 6. reply speed —
  const R = P.filter((p) => p.replyMedian != null).slice(0, S.group ? 4 : 2)
  if (R.length) {
    const maxMed = Math.max(...R.map((p) => p.replyMedian))
    const speeds = top6.map((p) => (p.replyMedian ? 0.35 + 1.6 * (1 - p.replyMedian / (maxMed * 1.15)) : 0.3))
    const sorted = [...R].sort((a, b) => a.replyMedian - b.replyMedian)
    const fast = sorted[0]
    add({
      duration: 6.5,
      shape: shapes.rings(N, A, speeds),
      cam: { pos: [0, 2.2, 6.8], look: [0, -0.2, 0], orbit: 0.3, speed: 0.2 },
      bg: BG.night[0], glow: BG.night[1],
      words(ctx, t) {
        shade(ctx)
        eyebrow(ctx, 'Kecepatan bales', 260, MUTED, at(t, late))
        text(ctx, first(fast.name), M, 430, { size: 150, weight: 300, family: SERIF, color: colorOf(P.indexOf(fast)), alpha: at(t, late + 0.2) })
        text(ctx, 'yang paling cepet bales.', M, 510, { size: 46, weight: 300, family: SERIF, italic: true, color: FG, alpha: at(t, late + 0.4) })
        sorted.forEach((p, i) => {
          const y = 1450 + i * 90
          const a = at(t, late + 0.8 + i * 0.15)
          text(ctx, first(p.name), M, y, { size: 40, color: colorOf(P.indexOf(p)), alpha: a })
          text(ctx, duration(p.replyMedian), W - M, y, { size: 56, weight: 300, family: SERIF, color: FG, align: 'right', alpha: a })
        })
        if (!S.group && sorted.length === 2 && sorted[1].replyMedian > sorted[0].replyMedian * 1.4) {
          const x = sorted[1].replyMedian / sorted[0].replyMedian
          text(ctx, `${x.toFixed(x < 10 ? 1 : 0).replace('.', ',')}× lebih cepet. Cincinnya muter lebih kenceng.`, M, 1720, { size: 30, color: MUTED, alpha: at(t, late + 1.6) })
        }
      },
    })
  }

  // — 7. the hours —
  const night = Math.round(S.nightShare * 100)
  add({
    duration: 6.5,
    shape: shapes.pillars(N, A, S.hours, S.peakHour),
    cam: { pos: [0, 2.4, 7.6], look: [0, 0.05, 0], orbit: 0.5, speed: 0.2 },
    bg: BG.ink[0], glow: BG.ink[1],
    words(ctx, t) {
      shade(ctx)
      eyebrow(ctx, 'Jam kalian', 260, MUTED, at(t, late))
      text(ctx, `${String(S.peakHour).padStart(2, '0')}.00`, M, 440, { size: 160, weight: 300, family: SERIF, color: colorOf(0), alpha: at(t, late + 0.2) })
      text(ctx, 'jam paling rame. Tiap pilar satu jam.', M, 520, { size: 40, weight: 300, family: SERIF, italic: true, color: FG, alpha: at(t, late + 0.4) })
      if (night >= 3) wrap(ctx, `${night}% obrolan kalian terjadi lewat tengah malam.`, W - 2 * M, { size: 48, weight: 300, family: SERIF }).forEach((l, i) =>
        text(ctx, l, M, 1600 + i * 60, { size: 48, weight: 300, family: SERIF, color: FG, alpha: at(t, late + 1 + i * 0.15) }))
    },
  })

  // — 8. every day —
  add({
    duration: 7,
    shape: shapes.terrain(N, A, S.calendar, S.busiest),
    cam: { pos: [0, 2.7, 6.4], look: [0, -0.15, 0.1], orbit: 0.3, speed: 0.18 },
    bg: BG.forest[0], glow: BG.forest[1],
    words(ctx, t) {
      shade(ctx)
      eyebrow(ctx, 'Setiap hari', 260, MUTED, at(t, late))
      text(ctx, num(S.activeDays), M, 430, { size: 150, weight: 300, family: SERIF, color: FG, alpha: at(t, late + 0.2) })
      const w = measure(ctx, num(S.activeDays), { size: 150, weight: 300, family: SERIF })
      text(ctx, `dari ${num(S.spanDays)} hari kalian ngobrol.`, M + w + 22, 430, { size: 38, weight: 300, family: SERIF, italic: true, color: MUTED, alpha: at(t, late + 0.4) })
      text(ctx, 'Satu gelombang tiap bulan.', M, 500, { size: 30, color: MUTED, alpha: at(t, late + 0.6) })
      text(ctx, 'HARI PALING RAME', M, 1470, { size: 26, weight: 500, spacing: 4, color: MUTED, alpha: at(t, late + 1) })
      text(ctx, `${date(S.busiest.date)} · ${num(S.busiest.n)} pesan`, M, 1530, { size: 48, weight: 300, family: SERIF, color: colorOf(0), alpha: at(t, late + 1.1) })
      if (S.streak.length > 2) {
        text(ctx, 'REKOR BERUNTUN', M, 1630, { size: 26, weight: 500, spacing: 4, color: MUTED, alpha: at(t, late + 1.5) })
        text(ctx, `${num(S.streak.length)} hari tanpa absen`, M, 1690, { size: 48, weight: 300, family: SERIF, color: FG, alpha: at(t, late + 1.6) })
      }
    },
  })

  // — 9. words —
  const all = new Map()
  for (const p of P) for (const [w, n] of p.topWords) all.set(w, (all.get(w) ?? 0) + n)
  const top = [...all.entries()].sort((a, b) => b[1] - a[1])
  if (top.length) {
    const [word, count] = top[0]
    const cols = P.slice(0, S.group ? 3 : 2)
    add({
      duration: 7,
      shape: shapes.words(N, A, word, { width: 1.8, font: 'italic 300 230px Fraunces' }),
      cam: { pos: [0, -0.2, 6.2], look: [0, 0.15, 0], orbit: 0.16, speed: 0.3 },
      bg: BG.wine[0], glow: BG.wine[1],
      words(ctx, t) {
        shade(ctx)
        eyebrow(ctx, 'Kata kalian', 260, MUTED, at(t, late))
        text(ctx, `${num(count)} kali.`, M, 330, { size: 46, weight: 300, family: SERIF, italic: true, color: FG, alpha: at(t, late + 0.3) })
        const colW = (W - 2 * M) / cols.length
        cols.forEach((p, pi) => {
          const x = M + pi * colW
          text(ctx, first(p.name), x, 1350, { size: 34, weight: 500, color: colorOf(pi), alpha: at(t, late + 0.6 + pi * 0.1) })
          p.topWords.filter(([w]) => w !== word).slice(0, 3).forEach(([w], i) =>
            text(ctx, w, x, 1420 + i * 62, { size: 50, weight: 300, family: SERIF, color: FG, alpha: at(t, late + 0.8 + pi * 0.1 + i * 0.12) }))
        })
        if (S.laughs > 0) text(ctx, `Plus ${num(S.laughs)}× wkwk, haha, hehe.`, M, 1720, { size: 34, color: MUTED, alpha: at(t, late + 1.8) })
      },
    })
  }

  // — 10. emoji —
  const fav = P.flatMap((p) => p.topEmoji).sort((a, b) => b[1] - a[1])[0]
  if (fav) {
    add({
      duration: 6.5,
      shape: shapes.emoji(N, A, fav[0]),
      cam: { pos: [0, 0.1, 6.2], look: [0, 0.25, 0], orbit: 0.35, speed: 0.45 },
      bg: BG.plum[0], glow: BG.plum[1],
      words(ctx, t) {
        shade(ctx)
        eyebrow(ctx, 'Emoji andalan', 260, MUTED, at(t, late))
        text(ctx, `${num(fav[1])} kali dikirim.`, M, 330, { size: 40, weight: 300, family: SERIF, italic: true, color: FG, alpha: at(t, late + 0.3) })
        P.filter((p) => p.topEmoji.length).slice(0, S.group ? 3 : 2).forEach((p, pi) => {
          const y = 1480 + pi * 130
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
    duration: 8,
    shape: shapes.galaxy(N, A),
    cam: { pos: [0, 3.6, 5.2], look: [0, -0.75, 0], orbit: 0.6, speed: 0.15 },
    bg: BG.ink[0], glow: BG.ink[1],
    words(ctx, t) {
      shade(ctx)
      eyebrow(ctx, `${years(S)} dalam angka`, 260, MUTED, at(t, late))
      wrap(ctx, who(S), W - 2 * M, { size: 96, weight: 300, family: SERIF }).slice(0, 2).forEach((l, i) =>
        text(ctx, l, M, 380 + i * 100, { size: 96, weight: 300, family: SERIF, color: FG, alpha: at(t, late + 0.2 + i * 0.15) }))
      const y0 = 1060
      cells.forEach(([label, value], i) => {
        const x = M + (i % 2) * ((W - 2 * M) / 2)
        const y = y0 + Math.floor(i / 2) * 190
        const a = at(t, late + 0.6 + i * 0.12)
        text(ctx, label.toUpperCase(), x, y, { size: 24, weight: 500, spacing: 4, color: MUTED, alpha: a })
        text(ctx, value, x, y + 92, { size: 78, weight: 300, family: SERIF, color: i % 3 === 0 ? colorOf(0) : FG, alpha: a })
      })
      text(ctx, 'Bikin punyamu sendiri.', M, 1740, { size: 38, weight: 300, family: SERIF, italic: true, color: FG, alpha: at(t, late + 2) })
    },
  })

  for (const s of slides) {
    const words = s.words
    s.words = (ctx, t) => {
      words(ctx, t)
      footer(ctx, S, t)
      drawGrain(ctx, 0.045)
    }
  }
  return slides
}
