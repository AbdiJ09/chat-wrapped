import { W, H, M, SERIF, SANS, at, clamp, easeInOut, num, date, duration, text, wrap, eyebrow, measure, background, drawGrain } from './draw.js'

// The story: eleven 9:16 slides, each a draw(ctx, t) of its own little animation. Every slide
// is complete at t = duration, which is also the frame that gets saved as an image.

const THEMES = {
  ink: { bg: '#0f0e0d', glow: 'rgba(217,178,111,0.08)', fg: '#f1ebe0', muted: 'rgba(241,235,224,0.56)', faint: 'rgba(241,235,224,0.1)', people: ['#d9b26f', '#9fb4d8'] },
  night: { bg: '#0c1322', glow: 'rgba(159,180,216,0.12)', fg: '#eef0f4', muted: 'rgba(238,240,244,0.56)', faint: 'rgba(238,240,244,0.1)', people: ['#e2bd78', '#a9c1ea'] },
  wine: { bg: '#2a1013', glow: 'rgba(226,140,120,0.12)', fg: '#f6e9e2', muted: 'rgba(246,233,226,0.58)', faint: 'rgba(246,233,226,0.11)', people: ['#ecc283', '#e7b3b8'] },
  forest: { bg: '#0e1e19', glow: 'rgba(160,210,180,0.09)', fg: '#ecf1ea', muted: 'rgba(236,241,234,0.56)', faint: 'rgba(236,241,234,0.1)', people: ['#e3bf78', '#a8cbd8'] },
  paper: { bg: '#efe8dc', glow: null, fg: '#1b1815', muted: 'rgba(27,24,21,0.58)', faint: 'rgba(27,24,21,0.1)', people: ['#a8772c', '#3b5b8f'] },
}
// everyone after the first two in a group
const MORE = { dark: ['#c9a4a0', '#9fc4b0', '#cdbf8c', '#aca3cf', '#d6b4c7', '#a3bfc9'], light: ['#8e4f48', '#3f7a5f', '#7c6a2a', '#5a4f8f', '#8a4a6c', '#3d6f7d'] }
const color = (th, i) => th.people[i] ?? (th === THEMES.paper ? MORE.light : MORE.dark)[(i - 2) % 6]

function footer(ctx, th, S, alpha = 1) {
  text(ctx, 'CHAT WRAPPED', M, H - 84, { size: 24, weight: 500, spacing: 5, color: th.muted, alpha, rise: 0 })
  text(ctx, who(S), W - M, H - 84, { size: 24, weight: 400, color: th.muted, align: 'right', alpha, rise: 0 })
}
const who = (S) => (S.group ? S.title ?? `${S.people.length} orang` : `${S.people[0].name} & ${S.people[1]?.name ?? ''}`)
const first = (name) => name.split(/\s+/)[0]

function frame(ctx, th, S, t, draw) {
  background(ctx, th.bg, th.glow)
  draw()
  footer(ctx, th, S, at(t, 0.2, 1))
  drawGrain(ctx, th === THEMES.paper ? 0.08 : 0.05)
}

// — 1. cover: every message you sent each other, wound into a spiral —
function cover(S) {
  const th = THEMES.ink
  const n = S.sequence.length
  const turns = 11
  const pts = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) {
    const u = i / Math.max(1, n - 1)
    const jitter = (Math.sin(i * 12.9898) * 43758.5453) % 1 // a fixed scatter per message
    const r = 40 + 400 * Math.sqrt(u) + jitter * 14
    const a = u * turns * Math.PI * 2 - Math.PI / 2
    pts[i * 2] = 540 + Math.cos(a) * r
    pts[i * 2 + 1] = 760 + Math.sin(a) * r
  }
  const dot = n > 20000 ? 2 : n > 6000 ? 3 : 4
  return {
    theme: th,
    duration: 6.5,
    draw(ctx, t) {
      frame(ctx, th, S, t, () => {
        const shown = Math.floor(n * easeInOut(clamp((t - 0.2) / 3.2)))
        let last = -1
        for (let i = 0; i < shown; i++) {
          const k = Math.min(S.sequence[i], 7)
          if (k !== last) {
            ctx.fillStyle = color(th, k)
            last = k
          }
          ctx.fillRect(pts[i * 2] - dot / 2, pts[i * 2 + 1] - dot / 2, dot, dot)
        }
        const y0 = 1360
        text(ctx, `${S.start.getFullYear()}${S.end.getFullYear() !== S.start.getFullYear() ? `–${S.end.getFullYear()}` : ''}`, M, y0 - 150, { size: 30, weight: 500, spacing: 5, color: th.muted, alpha: at(t, 1.6) })
        if (S.group) {
          const lines = wrap(ctx, who(S), W - 2 * M, { size: 120, weight: 300, family: SERIF })
          lines.slice(0, 2).forEach((l, i) => text(ctx, l, M, y0 + i * 124, { size: 120, weight: 300, family: SERIF, color: th.fg, alpha: at(t, 1.9 + i * 0.2) }))
        } else {
          text(ctx, S.people[0].name, M, y0, { size: 132, weight: 300, family: SERIF, color: color(th, 0), alpha: at(t, 1.9) })
          text(ctx, `& ${S.people[1].name}`, M, y0 + 140, { size: 132, weight: 300, family: SERIF, italic: true, color: color(th, 1), alpha: at(t, 2.2) })
        }
        text(ctx, `${num(S.total)} pesan, ${num(S.spanDays)} hari. Ini cerita kalian.`, M, y0 + 250, { size: 36, color: th.muted, alpha: at(t, 2.8) })
      })
    },
  }
}

// — 2. the very first message —
function firstMessage(S) {
  const th = THEMES.night
  const m = S.first
  const ago = Math.max(0, Math.round((Date.now() - m.t) / 86400000))
  const idx = S.people.findIndex((p) => p.name === m.author)
  return {
    theme: th,
    duration: 6,
    draw(ctx, t) {
      frame(ctx, th, S, t, () => {
        eyebrow(ctx, 'Pesan pertama', 360, th.muted, at(t, 0.2))
        text(ctx, date(new Date(m.t), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }), M, 420, { size: 34, color: th.muted, alpha: at(t, 0.35) })
        const quote = m.text.length > 180 ? `${m.text.slice(0, 177)}…` : m.text
        const size = quote.length < 24 ? 128 : quote.length < 60 ? 92 : 64
        const lines = wrap(ctx, `“${quote}”`, W - 2 * M, { size, weight: 300, family: SERIF, italic: true })
        lines.slice(0, 7).forEach((l, i) => text(ctx, l, M, 640 + i * size * 1.15, { size, weight: 300, family: SERIF, italic: true, color: th.fg, alpha: at(t, 0.8 + i * 0.15, 1.2), rise: 40 }))
        const yy = 640 + Math.min(lines.length, 7) * size * 1.15 + 40
        text(ctx, `— ${m.author}`, M, yy, { size: 40, color: color(th, idx), alpha: at(t, 1.8) })
        if (ago > 0) text(ctx, `${num(ago)} hari yang lalu.`, M, 1560, { size: 64, weight: 300, family: SERIF, color: th.fg, alpha: at(t, 2.8, 1.2) })
      })
    },
  }
}

// — 3. how much —
function volume(S) {
  const th = THEMES.ink
  const pages = Math.max(1, Math.ceil(S.words / 250))
  return {
    theme: th,
    duration: 6,
    draw(ctx, t) {
      frame(ctx, th, S, t, () => {
        eyebrow(ctx, 'Semuanya', 360, th.muted, at(t, 0.2))
        const k = easeInOut(clamp((t - 0.4) / 2))
        text(ctx, num(S.total * k), M, 640, { size: 230, weight: 300, family: SERIF, color: th.fg, alpha: at(t, 0.3), rise: 0 })
        text(ctx, 'pesan', M, 730, { size: 56, weight: 300, family: SERIF, italic: true, color: th.muted, alpha: at(t, 0.6) })
        text(ctx, num(S.words * k), M, 960, { size: 120, weight: 300, family: SERIF, color: color(th, 0), alpha: at(t, 1.1), rise: 0 })
        text(ctx, 'kata', M, 1030, { size: 48, weight: 300, family: SERIF, italic: true, color: th.muted, alpha: at(t, 1.3) })
        // a book, page by page
        const leaves = Math.min(pages, 60)
        const shown = Math.round(leaves * easeInOut(clamp((t - 2) / 2)))
        for (let i = 0; i < shown; i++) {
          ctx.fillStyle = `rgba(241,235,224,${0.14 + 0.3 * (i / leaves)})`
          ctx.fillRect(W - M - 240 + (i % 3) * 2, 1470 - i * 6, 240, 1.5)
        }
        const lines = wrap(ctx, `Kalau dicetak, jadi buku setebal ${num(pages)} halaman.`, 560, { size: 46, weight: 300, family: SERIF })
        lines.forEach((l, i) => text(ctx, l, M, 1290 + i * 58, { size: 46, weight: 300, family: SERIF, color: th.fg, alpha: at(t, 3.2 + i * 0.15) }))
      })
    },
  }
}

// — 4. who talks more —
function share(S) {
  const th = THEMES.wine
  const P = S.people
  return {
    theme: th,
    duration: 6,
    draw(ctx, t) {
      frame(ctx, th, S, t, () => {
        eyebrow(ctx, 'Siapa paling bawel', 360, th.muted, at(t, 0.2))
        const k = easeInOut(clamp((t - 0.6) / 1.6))
        if (!S.group) {
          const [a, b] = P
          text(ctx, `${Math.round(a.share * 100 * k)}%`, M, 700, { size: 200, weight: 300, family: SERIF, color: color(th, 0), alpha: at(t, 0.4), rise: 0 })
          text(ctx, first(a.name), M, 780, { size: 44, color: th.fg, alpha: at(t, 0.6) })
          text(ctx, `${Math.round(b.share * 100 * k)}%`, W - M, 1060, { size: 200, weight: 300, family: SERIF, color: color(th, 1), align: 'right', alpha: at(t, 0.7), rise: 0 })
          text(ctx, first(b.name), W - M, 1140, { size: 44, color: th.fg, align: 'right', alpha: at(t, 0.9) })
          // the split
          const y = 1260
          const split = M + (W - 2 * M) * (0.5 + (a.share - 0.5) * k)
          ctx.fillStyle = color(th, 0)
          ctx.fillRect(M, y, split - M - 4, 10)
          ctx.fillStyle = color(th, 1)
          ctx.fillRect(split + 4, y, W - M - split - 4, 10)
          const diff = a.messages - b.messages
          const lines = wrap(ctx, diff > 0 ? `${first(a.name)} ngirim ${num(diff)} pesan lebih banyak.` : 'Seimbang. Hampir persis.', W - 2 * M, { size: 54, weight: 300, family: SERIF })
          lines.forEach((l, i) => text(ctx, l, M, 1420 + i * 66, { size: 54, weight: 300, family: SERIF, color: th.fg, alpha: at(t, 2.4 + i * 0.15) }))
        } else {
          const top = P.slice(0, 7)
          const max = top[0].messages
          top.forEach((p, i) => {
            const y = 560 + i * 150
            const a = at(t, 0.5 + i * 0.12)
            text(ctx, p.name, M, y, { size: 44, color: th.fg, alpha: a })
            text(ctx, num(p.messages * k), W - M, y, { size: 44, family: SERIF, weight: 300, color: th.muted, align: 'right', alpha: a })
            ctx.fillStyle = color(th, i)
            ctx.globalAlpha = a
            ctx.fillRect(M, y + 26, (W - 2 * M) * (p.messages / max) * k, 8)
            ctx.globalAlpha = 1
          })
        }
      })
    },
  }
}

// — 5. who says hello first —
function starters(S) {
  const th = THEMES.paper
  const top = [...S.people].sort((a, b) => b.starts - a.starts)[0]
  const idx = new Map(S.people.map((p, i) => [p.name, i]))
  const list = S.starters.slice(-600)
  const cols = 24
  const cell = (W - 2 * M) / cols
  return {
    theme: th,
    duration: 6,
    draw(ctx, t) {
      frame(ctx, th, S, t, () => {
        eyebrow(ctx, 'Yang nyapa duluan', 360, th.muted, at(t, 0.2))
        text(ctx, first(top.name), M, 560, { size: 170, weight: 300, family: SERIF, color: color(th, idx.get(top.name)), alpha: at(t, 0.4) })
        const lines = wrap(ctx, `membuka ${Math.round(top.startShare * 100)}% dari ${num(S.conversations)} obrolan kalian.`, W - 2 * M, { size: 50, weight: 300, family: SERIF })
        lines.forEach((l, i) => text(ctx, l, M, 660 + i * 62, { size: 50, weight: 300, family: SERIF, color: th.fg, alpha: at(t, 0.8 + i * 0.12) }))
        // one dot per conversation, coloured by whoever opened it
        const shown = Math.floor(list.length * easeInOut(clamp((t - 1.2) / 2.4)))
        const y0 = 860
        for (let i = 0; i < shown; i++) {
          const x = M + (i % cols) * cell + cell / 2
          const y = y0 + Math.floor(i / cols) * cell + cell / 2
          if (y > 1700) break
          ctx.fillStyle = color(th, Math.min(idx.get(list[i]) ?? 7, 7))
          ctx.beginPath()
          ctx.arc(x, y, cell * 0.3, 0, Math.PI * 2)
          ctx.fill()
        }
      })
    },
  }
}

// — 6. how fast you answer each other —
function replies(S) {
  const th = THEMES.night
  const P = S.people.filter((p) => p.replyMedian != null).slice(0, S.group ? 5 : 2).sort((a, b) => a.replyMedian - b.replyMedian)
  const max = Math.max(...P.map((p) => p.replyMedian), 1)
  const idx = new Map(S.people.map((p, i) => [p.name, i]))
  return {
    theme: th,
    duration: 6.5,
    draw(ctx, t) {
      frame(ctx, th, S, t, () => {
        eyebrow(ctx, 'Kecepatan bales', 360, th.muted, at(t, 0.2))
        if (!P.length) return
        const fast = P[0]
        text(ctx, first(fast.name), M, 540, { size: 150, weight: 300, family: SERIF, color: color(th, idx.get(fast.name)), alpha: at(t, 0.4) })
        text(ctx, 'yang paling cepet bales.', M, 620, { size: 50, weight: 300, family: SERIF, italic: true, color: th.fg, alpha: at(t, 0.7) })
        // each line grows as long as that person usually takes to answer: shorter is faster
        P.forEach((p, i) => {
          const y = 860 + i * (S.group ? 170 : 260)
          const a = at(t, 1 + i * 0.15)
          const c = color(th, idx.get(p.name))
          const len = (W - 2 * M) * (0.12 + 0.88 * (p.replyMedian / max))
          const u = easeInOut(clamp((t - 1.3 - i * 0.2) / 2))
          text(ctx, first(p.name), M, y, { size: 40, color: th.fg, alpha: a })
          text(ctx, duration(p.replyMedian), M + len, y, { size: 56, weight: 300, family: SERIF, color: c, align: 'right', alpha: at(t, 1.6 + u * 1.2) })
          ctx.globalAlpha = a
          ctx.fillStyle = th.faint
          ctx.fillRect(M, y + 50, W - 2 * M, 2)
          ctx.fillStyle = c
          ctx.fillRect(M, y + 49, len * u, 4)
          ctx.beginPath()
          ctx.arc(M + len * u, y + 51, 11, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
        })
        if (!S.group && P.length === 2 && P[1].replyMedian > P[0].replyMedian * 1.4) {
          const x = P[1].replyMedian / P[0].replyMedian
          text(ctx, `${x.toFixed(x < 10 ? 1 : 0).replace('.', ',')}× lebih cepet.`, M, 1500, { size: 64, weight: 300, family: SERIF, color: th.fg, alpha: at(t, 4.2) })
        }
        text(ctx, 'waktu tunggu yang biasa (median), selama obrolan masih nyambung', M, 1640, { size: 28, color: th.muted, alpha: at(t, 4.4) })
      })
    },
  }
}

// — 7. your hours —
function hours(S) {
  const th = THEMES.ink
  const max = Math.max(...S.hours, 1)
  const cx = 540
  const cy = 1090
  return {
    theme: th,
    duration: 6.5,
    draw(ctx, t) {
      frame(ctx, th, S, t, () => {
        eyebrow(ctx, 'Jam kalian', 300, th.muted, at(t, 0.2))
        text(ctx, `${String(S.peakHour).padStart(2, '0')}.00`, M, 500, { size: 170, weight: 300, family: SERIF, color: color(th, 0), alpha: at(t, 0.4) })
        text(ctx, 'jam paling rame.', M, 580, { size: 50, weight: 300, family: SERIF, italic: true, color: th.fg, alpha: at(t, 0.7) })
        // a 24-hour clock; each hour reaches out as far as it was busy
        const R0 = 150
        const R1 = 400
        ctx.strokeStyle = th.faint
        ctx.lineWidth = 2
        ctx.globalAlpha = at(t, 0.8)
        ctx.beginPath()
        ctx.arc(cx, cy, R0, 0, Math.PI * 2)
        ctx.stroke()
        for (let h = 0; h < 24; h++) {
          const a = (h / 24) * Math.PI * 2 - Math.PI / 2
          const g = easeInOut(clamp((t - 1 - h * 0.06) / 1.2))
          const len = (R1 - R0) * (S.hours[h] / max) * g
          ctx.strokeStyle = h === S.peakHour ? color(th, 0) : 'rgba(241,235,224,0.5)'
          ctx.lineWidth = 14
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(cx + Math.cos(a) * (R0 + 16), cy + Math.sin(a) * (R0 + 16))
          ctx.lineTo(cx + Math.cos(a) * (R0 + 16 + len), cy + Math.sin(a) * (R0 + 16 + len))
          ctx.stroke()
        }
        ctx.globalAlpha = 1
        for (const [h, label] of [[0, '00'], [6, '06'], [12, '12'], [18, '18']]) {
          const a = (h / 24) * Math.PI * 2 - Math.PI / 2
          text(ctx, label, cx + Math.cos(a) * (R0 - 46), cy + Math.sin(a) * (R0 - 46) + 12, { size: 30, color: th.muted, align: 'center', alpha: at(t, 1), rise: 0 })
        }
        const night = Math.round(S.nightShare * 100)
        if (night >= 3) {
          const lines = wrap(ctx, `${night}% obrolan terjadi lewat tengah malam.`, W - 2 * M, { size: 50, weight: 300, family: SERIF })
          lines.forEach((l, i) => text(ctx, l, M, 1590 + i * 62, { size: 50, weight: 300, family: SERIF, color: th.fg, alpha: at(t, 3 + i * 0.15) }))
        }
      })
    },
  }
}

// — 8. every day: a calendar of the chat —
function calendar(S) {
  const th = THEMES.forest
  // rows = months (the last 24 at most), columns = days of the month
  const months = []
  for (const d of S.calendar) {
    const key = d.date.getFullYear() * 12 + d.date.getMonth()
    let m = months[months.length - 1]
    if (!m || m.key !== key) months.push((m = { key, date: d.date, days: new Array(31).fill(-1) }))
    m.days[d.date.getDate() - 1] = d.n
  }
  const rows = months.slice(-24)
  const max = Math.max(...S.calendar.map((d) => d.n), 1)
  const cell = (W - 2 * M - 90) / 31
  const rowH = Math.min(cell * 1.25, 760 / rows.length)
  const busiest = S.busiest
  return {
    theme: th,
    duration: 7,
    draw(ctx, t) {
      frame(ctx, th, S, t, () => {
        eyebrow(ctx, 'Setiap hari', 300, th.muted, at(t, 0.2))
        text(ctx, num(S.activeDays), M, 470, { size: 150, weight: 300, family: SERIF, color: th.fg, alpha: at(t, 0.4) })
        const w = measure(ctx, num(S.activeDays), { size: 150, weight: 300, family: SERIF })
        text(ctx, `dari ${num(S.spanDays)} hari, kalian ngobrol.`, M + w + 24, 470, { size: 40, weight: 300, family: SERIF, italic: true, color: th.muted, alpha: at(t, 0.7) })
        const y0 = 560
        rows.forEach((r, ri) => {
          const y = y0 + ri * rowH
          const a = at(t, 0.8 + ri * 0.05, 0.6)
          if (ri % 3 === 0 || rows.length <= 12) {
            text(ctx, date(r.date, { month: 'short' }).replace('.', ''), M, y + rowH * 0.7, { size: 24, color: th.muted, alpha: a, rise: 0 })
          }
          r.days.forEach((n, di) => {
            if (n < 0) return
            const x = M + 90 + di * cell
            const isBest = r.key === busiest.date.getFullYear() * 12 + busiest.date.getMonth() && di === busiest.date.getDate() - 1
            ctx.globalAlpha = a
            ctx.fillStyle = n === 0 ? th.faint : isBest ? color(th, 0) : `rgba(236,241,234,${0.18 + 0.82 * Math.sqrt(n / max)})`
            ctx.fillRect(x + 2, y + 2, cell - 4, rowH - 4)
            ctx.globalAlpha = 1
          })
        })
        const yb = y0 + rows.length * rowH + 110
        text(ctx, 'Hari paling rame', M, yb, { size: 30, weight: 500, spacing: 3, color: th.muted, alpha: at(t, 2.6) })
        text(ctx, `${date(busiest.date)} · ${num(busiest.n)} pesan`, M, yb + 64, { size: 50, weight: 300, family: SERIF, color: color(th, 0), alpha: at(t, 2.8) })
        if (S.streak.length > 2) {
          text(ctx, 'Rekor beruntun', M, yb + 170, { size: 30, weight: 500, spacing: 3, color: th.muted, alpha: at(t, 3.4) })
          text(ctx, `${num(S.streak.length)} hari tanpa absen`, M, yb + 234, { size: 50, weight: 300, family: SERIF, color: th.fg, alpha: at(t, 3.6) })
        }
      })
    },
  }
}

// — 9. your words —
function words(S) {
  const th = THEMES.wine
  const P = S.people.slice(0, S.group ? 3 : 2)
  return {
    theme: th,
    duration: 7,
    draw(ctx, t) {
      frame(ctx, th, S, t, () => {
        eyebrow(ctx, 'Kata-kata kalian', 300, th.muted, at(t, 0.2))
        const colW = (W - 2 * M) / P.length
        P.forEach((p, pi) => {
          const x = M + pi * colW
          const c = color(th, pi)
          text(ctx, first(p.name), x, 430, { size: 40, weight: 500, color: c, alpha: at(t, 0.4 + pi * 0.2) })
          p.topWords.slice(0, 6).forEach(([w, n], i) => {
            const size = (P.length > 2 ? 54 : 74) * (1 - i * 0.09)
            const a = at(t, 0.8 + pi * 0.2 + i * 0.14)
            text(ctx, w, x, 540 + i * 108, { size, weight: 300, family: SERIF, color: th.fg, alpha: a })
            text(ctx, num(n), x, 576 + i * 108, { size: 24, color: th.muted, alpha: a })
          })
        })
        if (S.laughs > 0) {
          text(ctx, `${num(S.laughs * easeInOut(clamp((t - 3) / 1.5)))}×`, M, 1380, { size: 150, weight: 300, family: SERIF, color: color(th, 0), alpha: at(t, 2.9), rise: 0 })
          text(ctx, 'wkwk, haha, hehe. Kalian ketawa sebanyak itu.', M, 1460, { size: 40, weight: 300, family: SERIF, italic: true, color: th.fg, alpha: at(t, 3.3) })
        }
        const sig = P.find((p) => p.signature)
        if (sig) text(ctx, `Kata khas ${first(sig.name)}: “${sig.signature.word}”`, M, 1600, { size: 36, color: th.muted, alpha: at(t, 4) })
      })
    },
  }
}

// — 10. emoji —
function emoji(S) {
  const th = THEMES.paper
  const P = S.people.filter((p) => p.topEmoji.length).slice(0, S.group ? 4 : 2)
  const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
  return {
    theme: th,
    duration: 6,
    draw(ctx, t) {
      frame(ctx, th, S, t, () => {
        eyebrow(ctx, 'Emoji andalan', 300, th.muted, at(t, 0.2))
        P.forEach((p, pi) => {
          const y = 460 + pi * (S.group ? 300 : 520)
          const i = S.people.indexOf(p)
          text(ctx, first(p.name), M, y, { size: 44, weight: 500, color: color(th, i), alpha: at(t, 0.4 + pi * 0.3) })
          p.topEmoji.slice(0, 3).forEach(([e, n], k) => {
            const size = (S.group ? 120 : 190) * (k === 0 ? 1 : 0.62)
            const x = M + (k === 0 ? 0 : (S.group ? 170 : 270) + (k - 1) * (S.group ? 120 : 180))
            const a = at(t, 0.8 + pi * 0.3 + k * 0.15, 0.7)
            ctx.save()
            ctx.globalAlpha = a
            ctx.font = `${size}px ${EMOJI_FONT}`
            ctx.textBaseline = 'alphabetic'
            const s = 0.8 + 0.2 * a
            ctx.translate(x, y + 60 + size)
            ctx.scale(s, s)
            ctx.fillText(e, 0, 0)
            ctx.restore()
            text(ctx, `${num(n)}×`, x, y + 110 + size, { size: 28, color: th.muted, alpha: a })
          })
        })
      })
    },
  }
}

// — 11. everything on one card —
function summary(S) {
  const th = THEMES.ink
  const starter = [...S.people].sort((a, b) => b.starts - a.starts)[0]
  const fav = S.people.flatMap((p) => p.topEmoji).sort((a, b) => b[1] - a[1])[0]
  const cells = [
    ['Pesan', num(S.total)],
    ['Hari ngobrol', num(S.activeDays)],
    ['Rekor beruntun', `${num(S.streak.length)} hari`],
    ['Jam favorit', `${String(S.peakHour).padStart(2, '0')}.00`],
    ['Nyapa duluan', first(starter.name)],
    ['Ketawa', `${num(S.laughs)}×`],
  ]
  return {
    theme: th,
    duration: 8,
    draw(ctx, t) {
      frame(ctx, th, S, t, () => {
        eyebrow(ctx, `${S.start.getFullYear()}${S.end.getFullYear() !== S.start.getFullYear() ? `–${S.end.getFullYear()}` : ''} dalam angka`, 300, th.muted, at(t, 0.2))
        const title = who(S)
        const lines = wrap(ctx, title, W - 2 * M, { size: 110, weight: 300, family: SERIF })
        lines.slice(0, 2).forEach((l, i) => text(ctx, l, M, 450 + i * 118, { size: 110, weight: 300, family: SERIF, color: th.fg, alpha: at(t, 0.4 + i * 0.15) }))
        const y0 = 450 + Math.min(lines.length, 2) * 118 + 60
        ctx.fillStyle = th.faint
        ctx.fillRect(M, y0, W - 2 * M, 2)
        cells.forEach(([label, value], i) => {
          const col = i % 2
          const row = Math.floor(i / 2)
          const x = M + col * ((W - 2 * M) / 2)
          const y = y0 + 90 + row * 220
          const a = at(t, 0.9 + i * 0.12)
          text(ctx, label.toUpperCase(), x, y, { size: 26, weight: 500, spacing: 4, color: th.muted, alpha: a })
          text(ctx, value, x, y + 110, { size: 88, weight: 300, family: SERIF, color: i % 3 === 0 ? color(th, 0) : th.fg, alpha: a })
        })
        if (fav) {
          ctx.save()
          ctx.globalAlpha = at(t, 2)
          ctx.font = '150px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
          ctx.textAlign = 'right'
          ctx.fillText(fav[0], W - M, 1690)
          ctx.restore()
        }
        text(ctx, 'Bikin punyamu sendiri.', M, 1650, { size: 44, weight: 300, family: SERIF, italic: true, color: th.fg, alpha: at(t, 2.4) })
      })
    },
  }
}

export function makeStory(S) {
  const slides = [cover(S)]
  if (S.first) slides.push(firstMessage(S))
  slides.push(volume(S), share(S), starters(S))
  if (S.people.some((p) => p.replyMedian != null)) slides.push(replies(S))
  slides.push(hours(S), calendar(S))
  if (S.people.some((p) => p.topWords.length)) slides.push(words(S))
  if (S.people.some((p) => p.topEmoji.length)) slides.push(emoji(S))
  slides.push(summary(S))
  return slides
}

export { SANS }
