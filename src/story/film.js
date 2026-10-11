import { W, H, MONO, at, num, date, wrap, drawGrain } from './draw.js'

// The film: not a recap with black bars, a story told with the chat's own lines (see
// screenplay.js). It opens cold — a dark room, one bubble, someone typing, the very first words —
// and only then the title. Then that first night, the days after ("Seminggu kemudian."), the
// busiest day, a night, the silence, the word they say most, and today; then the credits.
//
// Each scene is a sculpture and a camera move, and a timeline of cues over it: a card (a line
// of narration), a line of dialogue (who said it, small, in their colour; what they said, as a
// subtitle), someone typing, or the screen held in black.

export const SERIF = '"Instrument Serif", Georgia, "Times New Roman", serif'
const BAR = Math.round(H * 0.115) // the black bars
const DAY = 86400000

function write(ctx, str, x, y, { size = 40, family = SERIF, italic = false, color = '#fff', alpha = 1, align = 'center', spacing = 0 } = {}) {
  if (alpha <= 0.002 || !str) return
  ctx.save()
  ctx.globalAlpha = Math.min(1, alpha)
  ctx.font = `${italic ? 'italic ' : ''}400 ${size}px ${family}`
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = color
  ctx.shadowColor = 'rgba(0,0,0,0.7)'
  ctx.shadowBlur = size * 0.4
  ctx.fillText(str, x, y)
  ctx.restore()
}
const lines = (ctx, str, size, max = W - 170) => {
  ctx.font = `italic 400 ${size}px ${SERIF}`
  return wrap(ctx, str, max, { size, family: SERIF, italic: true })
}
// in at `from`, out by `to`
const fade = (t, from, to, dur = 0.45) => Math.max(0, Math.min(at(t, from, dur), 1 - at(t, to - dur, dur)))
function veil(ctx, a) {
  if (a <= 0.002) return
  ctx.fillStyle = `rgba(0,0,0,${Math.min(1, a)})`
  ctx.fillRect(0, 0, W, H)
}
function frame(ctx) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.22, W / 2, H / 2, H * 0.62)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  const s = ctx.createLinearGradient(0, H - BAR - 480, 0, H - BAR)
  s.addColorStop(0, 'rgba(0,0,0,0)')
  s.addColorStop(1, 'rgba(0,0,0,0.65)')
  ctx.fillStyle = s
  ctx.fillRect(0, H - BAR - 480, W, 480)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, BAR)
  ctx.fillRect(0, H - BAR, W, BAR)
}

/**
 * A scene. cues: [{ card }, { line: { author, text } }, { dots }, { black, card }, { card, big, under }]
 * each optionally with a heading (shown in the top bar from then on). lead: seconds of picture
 * before the first cue (the bubbles flying into place).
 */
function scene({ id, label, shape, cam, look, cues, lead = 1.6, tail = 1.2, colorOf, ink, presents = false }) {
  let t0 = lead
  const timed = cues.map((c) => {
    const len = c.dots ? 1.8 : c.black ? c.black : c.line ? Math.min(4.4, Math.max(2, 1.4 + c.line.text.length * 0.05)) : c.big ? 3.6 : Math.min(3.4, Math.max(2.2, 1.2 + c.card.length * 0.045))
    const cue = { ...c, from: t0, to: t0 + len }
    t0 += len + 0.15
    return cue
  })
  return {
    id,
    label,
    duration: t0 + tail,
    shape,
    cam,
    ...look,
    words(ctx, t) {
      // held in black (and the opening's darkness)
      let dark = presents ? 1 - at(t, 2.3, 1.4) * 0.6 : 0
      for (const c of timed) if (c.black) dark = Math.max(dark, fade(t, c.from, c.to, 0.8) * 0.94)
      veil(ctx, dark)
      if (presents) write(ctx, 'CHATWRAPPED MEMPERSEMBAHKAN', W / 2, H / 2, { size: 24, family: MONO, spacing: 9, color: ink, alpha: fade(t, 0.3, 2.3, 0.6) })
      frame(ctx)
      // the heading in the top bar: the latest one shown so far
      const head = [...timed].reverse().find((c) => c.heading && t >= c.from - 0.3)
      if (head) write(ctx, head.heading.toUpperCase(), 70, BAR - 38, { size: 19, family: MONO, spacing: 4, color: `${ink}88`, align: 'left', alpha: at(t, head.from - 0.3, 0.6) })
      for (const c of timed) {
        const a = fade(t, c.from, c.to)
        if (a <= 0) continue
        if (c.dots) {
          // someone typing: three dots, breathing one after another
          for (let i = 0; i < 3; i++) {
            ctx.save()
            ctx.globalAlpha = a * (0.35 + 0.65 * Math.max(0, Math.sin((t - c.from) * 6 - i * 0.9)))
            ctx.fillStyle = ink
            ctx.beginPath()
            ctx.arc(W / 2 + (i - 1) * 40, H - BAR - 160, 12, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
          }
        } else if (c.line) {
          write(ctx, c.line.author.split(/\s+/)[0].toUpperCase(), W / 2, H - BAR - 240, { size: 21, family: MONO, spacing: 6, color: colorOf(c.line.author), alpha: a })
          const ls = lines(ctx, `“${c.line.text}”`, 58).slice(0, 2)
          ls.forEach((l, i) => write(ctx, l, W / 2, H - BAR - 160 + i * 68 - (ls.length - 1) * 34, { size: 58, italic: true, color: ink, alpha: a }))
        } else if (c.big) {
          write(ctx, c.card, W / 2, H / 2 - 150, { size: 46, italic: true, color: `${ink}cc`, alpha: a })
          write(ctx, c.big, W / 2, H / 2 + 10, { size: 150, color: ink, alpha: a })
          if (c.under) write(ctx, c.under, W / 2, H / 2 + 110, { size: 44, italic: true, color: `${ink}bb`, alpha: a })
        } else if (c.card) {
          // narration: centred on black, or low over the picture
          const y = c.black ? H / 2 : H - BAR - 170
          const size = c.black ? 76 : 62
          lines(ctx, c.card, size).slice(0, 3).forEach((l, i, all) => write(ctx, l, W / 2, y + i * (size + 14) - ((all.length - 1) * (size + 14)) / 2, { size, italic: true, color: ink, alpha: a }))
        }
      }
      drawGrain(ctx, 0.065)
    },
  }
}

const hhmm = (t) => date(new Date(t), { hour: '2-digit', minute: '2-digit' })
const day = (t) => date(new Date(t), { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * The film, from the recap's slides (keeping your own scenes and your ending from them).
 * info: { S, who, theme, word: { word, count }, N, A, shapes, shares, colorOf }
 */
export function toFilm(slides, { S, who, theme, word, N, A, shapes, shares, colorOf: colorAt }) {
  const ink = theme.ink
  const P = S.people
  const colorOf = (name) => colorAt(Math.max(0, P.findIndex((p) => p.name === name)))
  const script = S.script ?? {}
  const base = { colorOf, ink }
  const dark = { bg: '#000000', glow: theme.bg, rim: theme.people[0] }
  const lit = { bg: theme.bg, glow: theme.glow, rim: theme.people[1] }
  const mine = slides.filter((s) => s.scene)
  const ending = slides.find((s) => s.id === 'ending')
  const out = []
  const opening = script.opening ?? []
  const first = opening[0] ?? S.first

  // — cold open: the dark, one bubble, someone typing, the first words —
  out.push(scene({
    ...base,
    id: 'open',
    label: 'Pembuka',
    presents: true,
    lead: 3.2,
    shape: () => shapes.spark(N, A, Math.max(0, P.findIndex((p) => p.name === first?.author))),
    cam: { pos: [0.8, 1.0, 7.2], look: [0, 1.3, 0], orbit: 0.12, speed: 0.05, dolly: 0.022 },
    look: dark,
    cues: [{ dots: true, heading: first ? `${day(first.t)} · ${hhmm(first.t)}` : '' }, ...opening.slice(0, 2).map((l) => ({ line: l }))],
  }))

  // — the title —
  out.push({
    id: 'title',
    label: 'Judul',
    duration: 7,
    shape: () => (theme.id === 'couple' ? shapes.heart(N, A) : shapes.helix(N, A, Math.min(P.length, 6))),
    cam: { pos: [0, 2.2, 13.5], look: [0, 1.3, 0], orbit: 0.2, speed: 0.1, dolly: 0.012 },
    ...lit,
    words(ctx, t) {
      veil(ctx, 1 - at(t, 0, 1.4))
      frame(ctx)
      const a = fade(t, 1.4, 7, 1)
      const ls = lines(ctx, who, 124, W - 160)
      ls.slice(0, 3).forEach((l, i) => write(ctx, l, W / 2, H - BAR - 330 + i * 118 - (ls.length - 1) * 59, { size: 124, color: ink, alpha: a }))
      write(ctx, `sebuah film dari ${num(S.total)} pesan`, W / 2, H - BAR - 150, { size: 46, italic: true, color: `${ink}cc`, alpha: fade(t, 2.1, 7, 1) })
      drawGrain(ctx, 0.065)
    },
  })

  // — that first conversation, going on —
  if (opening.length > 2) out.push(scene({
    ...base,
    id: 'first',
    label: 'Malam pertama',
    shape: () => shapes.bridge(N, A, shares, Math.max(0, P.findIndex((p) => p.name === opening[0].author))),
    cam: { pos: [-2.6, 1.3, 7.4], look: [0, 1.0, 0], orbit: 0.3, speed: 0.08, dolly: 0.02 },
    look: lit,
    cues: opening.slice(2, 6).map((l, i) => ({ line: l, heading: i ? undefined : day(l.t) })),
  }))

  // — the days after —
  if (script.skips?.length) out.push(scene({
    ...base,
    id: 'after',
    label: 'Hari-hari berikutnya',
    shape: () => shapes.terrain(N, A, S.calendar, S.busiest),
    cam: { pos: [3.8, 1.2, 4.2], look: [-0.6, 0.25, 0], orbit: 0.35, speed: 0.1, dolly: 0.025 },
    look: lit,
    cues: script.skips.flatMap((s) => [{ card: s.card, heading: day(s.lines[0].t) }, ...s.lines.slice(0, 2).map((l) => ({ line: l }))]),
  }))

  // — the busiest day —
  if (script.busiest) out.push(scene({
    ...base,
    id: 'busy',
    label: 'Hari paling rame',
    shape: () => shapes.vortex(N, A),
    cam: { pos: [0, 1.4, 8.6], look: [0, 1.9, 0], orbit: 0.25, speed: 0.12, dolly: 0.02 },
    look: lit,
    cues: [{ card: `Lalu ada hari seperti ini. ${num(script.busiest.n)} pesan dalam sehari.`, heading: day(script.busiest.t) }, ...script.busiest.lines.map((l) => ({ line: l }))],
  }))

  // — a night —
  if (script.night) out.push(scene({
    ...base,
    id: 'night',
    label: 'Larut malam',
    shape: () => shapes.galaxy(N, A),
    cam: { pos: [0, 0.5, 6.4], look: [0, 1.6, 0], orbit: 0.25, speed: 0.06, dolly: 0.015 },
    look: dark,
    cues: [{ card: `Pukul ${hhmm(script.night.t)}.`, heading: day(script.night.t) }, ...script.night.lines.map((l) => ({ line: l }))],
  }))

  // — the silence —
  const q = script.silence
  if (q) {
    const days = q.ms / DAY
    const long = days >= 2 ? `${num(Math.floor(days))} hari` : `${num(Math.floor(q.ms / 3600000))} jam`
    out.push(scene({
      ...base,
      id: 'quiet',
      label: 'Sunyi',
      shape: () => shapes.apart(N, A),
      cam: { pos: [0, 1.0, 9.6], look: [0, 1.0, 0], orbit: 0.08, speed: 0.04, dolly: 0.01 },
      look: dark,
      cues: [
        ...(q.before ? [{ line: q.before, heading: day(q.from) }] : []),
        { black: 3.4, card: `${long} tanpa kabar.`, heading: day(q.from) },
        ...q.after.map((l, i) => ({ line: l, heading: i ? undefined : day(q.to) })),
      ],
    }))
  }

  // — the word they say most —
  if (word) out.push(scene({
    ...base,
    id: 'word',
    label: 'Kata kalian',
    shape: () => shapes.words(N, A, word.word, { width: 2.1 }),
    cam: { pos: [0, 0.9, 7.6], look: [0, 0.4, 0], orbit: 0.2, speed: 0.1, dolly: 0.02 },
    look: lit,
    lead: 2.2,
    cues: [{ card: 'Kata yang paling sering mereka ucapkan', big: `“${word.word}”`, under: `${num(word.count)} kali.` }],
  }))

  // — your own scenes, told the same way —
  for (const s of mine) {
    const sc = s.scene
    const m = sc.kind === 'quote' ? sc.m : sc.first
    out.push(scene({
      ...base,
      id: s.id,
      label: s.label,
      shape: s.shape,
      cam: { ...s.cam, dolly: 0.02, speed: (s.cam.speed ?? 0.2) * 0.5 },
      look: lit,
      cues: sc.kind === 'quote' ? [{ card: s.label, heading: day(m.t) }, { line: m }]
        : sc.kind === 'count' ? [{ card: s.label, big: `${num(sc.total)}×`, under: m ? `pertama kali ${day(m.t)}` : '' }]
        : [{ card: s.label, heading: day(sc.t) }, { card: `${num(sc.n)} pesan hari itu.` }, ...(m ? [{ line: m }] : [])],
    }))
  }

  // — today —
  const now = script.now ?? []
  if (now.length) out.push(scene({
    ...base,
    id: 'now',
    label: 'Hari ini',
    shape: () => (theme.id === 'couple' ? shapes.heart(N, A) : shapes.orbs(N, A, shares)),
    cam: { pos: [0, 0.9, 6.2], look: [0, 1.4, 0], orbit: 0.3, speed: 0.08, dolly: 0.025 },
    look: lit,
    cues: [{ card: 'Sampai hari ini.', heading: day(now.at(-1).t) }, ...now.slice(-3).map((l) => ({ line: l }))],
  }))

  // — your ending: your words typed in under the picture —
  if (ending) {
    const msg = ending.message ?? ''
    out.push({
      ...ending,
      duration: Math.max(9, 4 + msg.length / 20),
      words(ctx, t) {
        veil(ctx, 1 - at(t, 0.2, 1.4))
        frame(ctx)
        const shown = msg.slice(0, Math.max(0, Math.floor((t - 2.6) * 22)))
        let left = shown.length
        lines(ctx, msg, 56).slice(0, 4).forEach((l, i, all) => {
          const part = l.slice(0, Math.max(0, left))
          left -= l.length + 1
          write(ctx, part, W / 2, H - BAR - 130 - (all.length - 1 - i) * 66, { size: 56, italic: true, color: ink })
        })
        if (!msg) write(ctx, who, W / 2, H - BAR - 130, { size: 72, color: ink, alpha: at(t, 2.4, 1.2) })
        drawGrain(ctx, 0.065)
      },
    })
  }

  // — the credits —
  const blocks = [
    ['Dibintangi', P.slice(0, 6).map((p) => p.name)],
    ['Ditulis oleh', [`${num(S.total)} pesan`]],
    ['Selama', [`${num(S.spanDays)} hari`]],
    word && ['Kata yang paling sering', [`“${word.word}”`]],
    ['Jam syuting favorit', [`${String(S.peakHour).padStart(2, '0')}.00`]],
    ['Lokasi', ['WhatsApp']],
    ['Tata suara', ['Bunyi notifikasi']],
  ].filter(Boolean)
  const height = blocks.reduce((h, [, names]) => h + 70 + names.length * 76 + 70, 0)
  const duration = 16
  out.push({
    id: 'credits',
    label: 'Credits',
    duration,
    ...lit,
    shape: () => shapes.galaxy(N, A),
    cam: { pos: [0, 4.6, 9.4], look: [0, -0.1, 0], orbit: 0.6, speed: 0.15 },
    words(ctx, t) {
      veil(ctx, 0.35 + at(t, 0, 2) * 0.3)
      frame(ctx)
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, BAR, W, H - 2 * BAR)
      ctx.clip()
      let y = H - BAR + 60 - (t - 1) * ((height + H * 0.35) / (duration - 6))
      for (const [role, names] of blocks) {
        write(ctx, role.toUpperCase(), W / 2, y + 40, { size: 22, family: MONO, spacing: 6, color: `${ink}99` })
        names.forEach((n, i) => write(ctx, n, W / 2, y + 110 + i * 76, { size: 62, color: ink }))
        y += 70 + names.length * 76 + 70
      }
      ctx.restore()
      write(ctx, 'chatwrapped', W / 2, H / 2, { size: 76, color: ink, alpha: at(t, duration - 5, 1.4) })
      write(ctx, 'Terima kasih sudah nonton.', W / 2, H / 2 + 76, { size: 40, italic: true, color: `${ink}bb`, alpha: at(t, duration - 4.4, 1.4) })
      drawGrain(ctx, 0.065)
    },
  })

  slides.splice(0, slides.length, ...out)
  return slides
}
