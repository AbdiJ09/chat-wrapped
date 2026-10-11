import { W, H, MONO, at, num, wrap, drawGrain } from './draw.js'

// The film cut: the same sculptures, told like a film instead of a recap. Black bars above and
// below; an opening ("chatwrapped mempersembahkan", then the title card); the story in chapters,
// each opening on black with its title; no big numbers, but one quiet line of narration at a
// time, like subtitles; and credits rolling at the end ("Dibintangi …").

export const SERIF = '"Instrument Serif", Georgia, "Times New Roman", serif'
const BAR = Math.round(H * 0.115) // the black bars
const ROMAN = ['I', 'II', 'III', 'IV', 'V']
// the chapters, by the slides they start with
const CHAPTERS = [
  { title: 'Awal', ids: ['first', 'moment'] },
  { title: 'Kita, dalam angka', ids: ['total', 'share', 'awards', 'count', 'starter', 'reply'] },
  { title: 'Setiap hari', ids: ['hours', 'days', 'quiet'] },
  { title: 'Bahasa kita', ids: ['words', 'emoji'], mine: true },
  { title: 'Untukmu', ids: ['ending'] },
]
const chapterOf = (id) => CHAPTERS.findIndex((c) => c.ids.includes(id) || (c.mine && id.startsWith('mine')))
const OPEN = 2.4 // seconds of black and the chapter's title before the picture

function write(ctx, str, x, y, { size = 40, family = SERIF, italic = false, color = '#fff', alpha = 1, align = 'center', spacing = 0, weight = 400 } = {}) {
  if (alpha <= 0.002 || !str) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = color
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = size * 0.35
  ctx.fillText(str, x, y)
  ctx.restore()
}
// in at `from`, out by `to` (seconds), softly
const fade = (t, from, to, dur = 0.8) => Math.min(at(t, from, dur), 1 - at(t, to - dur, dur))
function black(ctx, a) {
  if (a <= 0) return
  ctx.fillStyle = `rgba(0,0,0,${Math.min(1, a)})`
  ctx.fillRect(0, 0, W, H)
}
function frame(ctx) {
  // a vignette, then the bars
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.62)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.5)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // where the subtitles go, a little darker
  const s = ctx.createLinearGradient(0, H - BAR - 460, 0, H - BAR)
  s.addColorStop(0, 'rgba(0,0,0,0)')
  s.addColorStop(1, 'rgba(0,0,0,0.62)')
  ctx.fillStyle = s
  ctx.fillRect(0, H - BAR - 460, W, 460)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, BAR)
  ctx.fillRect(0, H - BAR, W, BAR)
}
function subtitles(ctx, say, t, start, end, ink) {
  if (!say) return
  const a = fade(t, start + 0.5, end, 0.9)
  const y = H - BAR - 150
  write(ctx, say.kicker?.toUpperCase(), W / 2, y - 92, { size: 22, family: MONO, spacing: 6, color: `${ink}b0`, alpha: a })
  const lines = say.lines.filter(Boolean)
  lines.forEach((l, i) => {
    ctx.font = `italic 400 54px ${SERIF}`
    wrap(ctx, l, W - 160, { size: 54, family: SERIF, italic: true }).slice(0, 2).forEach((part, j) =>
      write(ctx, part, W / 2, y + i * 74 + j * 62, { size: 54, italic: true, color: ink, alpha: fade(t, start + 0.9 + i * 1.1, end, 0.9) }))
  })
}

/**
 * Turn the recap's slides into the film's (in place). info: { S, who, theme, word, N, A, shapes }
 */
export function toFilm(slides, { S, who, theme, word, N, A, shapes }) {
  const ink = theme.ink
  // the recap's last slide (everything in numbers) gives way to the credits
  const sum = slides.findIndex((s) => s.id === 'summary')
  if (sum >= 0) slides.splice(sum, 1)
  let last = -1
  for (const s of slides) {
    const recap = s.words
    const c = s.id === 'cover' ? -1 : chapterOf(s.id)
    const opens = c >= 0 && c !== last
    if (c >= 0) last = c
    const begin = opens ? OPEN : 0
    if (s.id === 'cover') {
      // the opening: who presents, then the title card over the bubbles raining into it
      s.duration = 9.5
      s.words = (ctx, t) => {
        black(ctx, 1 - at(t, 2.6, 1.6) * 0.98)
        write(ctx, 'CHATWRAPPED MEMPERSEMBAHKAN', W / 2, H / 2, { size: 24, family: MONO, spacing: 9, color: ink, alpha: fade(t, 0.5, 2.6, 0.7) })
        frame(ctx)
        const a = fade(t, 3.4, 9.5, 1)
        const lines = wrap(ctx, who, W - 180, { size: 120, family: SERIF })
        lines.slice(0, 3).forEach((l, i) => write(ctx, l, W / 2, H - BAR - 330 + i * 116 - (lines.length - 1) * 58, { size: 120, color: ink, alpha: a }))
        write(ctx, `sebuah film dari ${num(S.total)} pesan`, W / 2, H - BAR - 150, { size: 46, italic: true, color: `${ink}cc`, alpha: fade(t, 4.2, 9.5, 1) })
        drawGrain(ctx, 0.06)
      }
      continue
    }
    s.duration = Math.max(7.5, s.duration + 1) + begin
    const end = s.duration
    if (s.id === 'ending') {
      // your words, typed in under the picture, as the last line of the film
      const msg = s.message ?? ''
      s.words = (ctx, t) => {
        black(ctx, opens ? 1 - at(t, OPEN - 0.9, 1.2) : 0)
        if (opens) chapterCard(ctx, t, c, ink)
        frame(ctx)
        const shown = msg.slice(0, Math.max(0, Math.floor((t - begin - 2.4) * 22)))
        ctx.font = `italic 400 56px ${SERIF}`
        let left = shown.length
        wrap(ctx, msg, W - 160, { size: 56, family: SERIF, italic: true }).slice(0, 4).forEach((l, i, all) => {
          const part = l.slice(0, Math.max(0, left))
          left -= l.length + 1
          write(ctx, part, W / 2, H - BAR - 120 - (all.length - 1 - i) * 66, { size: 56, italic: true, color: ink })
        })
        if (!msg) write(ctx, who, W / 2, H - BAR - 120, { size: 72, color: ink, alpha: at(t, begin + 2.4, 1.2) })
        drawGrain(ctx, 0.06)
      }
      continue
    }
    s.words = (ctx, t) => {
      black(ctx, opens ? 1 - at(t, OPEN - 0.9, 1.2) : 0)
      if (opens) chapterCard(ctx, t, c, ink)
      frame(ctx)
      subtitles(ctx, s.say, t, begin + 0.6, end, ink)
      write(ctx, `${ROMAN[c]} · ${CHAPTERS[c].title}`.toUpperCase(), W - 70, BAR - 36, { size: 18, family: MONO, spacing: 4, color: `${ink}70`, align: 'right', alpha: at(t, begin + 0.4, 1) })
      drawGrain(ctx, 0.06)
    }
    s.recap = recap
  }

  // — the credits —
  const P = S.people
  const blocks = [
    ['Dibintangi', P.slice(0, 6).map((p) => p.name)],
    ['Ditulis oleh', [`${num(S.total)} pesan`]],
    ['Selama', [`${num(S.spanDays)} hari`]],
    word && ['Kata yang paling sering', [`“${word}”`]],
    ['Jam syuting favorit', [`${String(S.peakHour).padStart(2, '0')}.00`]],
    ['Lokasi', ['WhatsApp']],
    ['Tata suara', ['Bunyi notifikasi']],
  ].filter(Boolean)
  const height = blocks.reduce((h, [, names]) => h + 70 + names.length * 76 + 70, 0)
  const duration = 16
  slides.push({
    id: 'credits',
    label: 'Credits',
    duration,
    bg: theme.bg,
    glow: theme.glow,
    rim: theme.people[0],
    shape: () => shapes.galaxy(N, A),
    cam: { pos: [0, 4.6, 9.4], look: [0, -0.1, 0], orbit: 0.6, speed: 0.15 },
    words(ctx, t) {
      black(ctx, 0.35 + at(t, 0, 2) * 0.3)
      frame(ctx)
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, BAR, W, H - 2 * BAR)
      ctx.clip()
      // rolls up from below the bar until the last name has gone past the middle
      let y = H - BAR + 60 - (t - 1) * ((height + H * 0.35) / (duration - 6))
      for (const [role, names] of blocks) {
        write(ctx, role.toUpperCase(), W / 2, y + 40, { size: 22, family: MONO, spacing: 6, color: `${ink}99` })
        names.forEach((n, i) => write(ctx, n, W / 2, y + 110 + i * 76, { size: 62, color: ink }))
        y += 70 + names.length * 76 + 70
      }
      ctx.restore()
      // and the end
      const a = at(t, duration - 5, 1.4)
      write(ctx, 'chatwrapped', W / 2, H / 2, { size: 76, color: ink, alpha: a })
      write(ctx, 'Terima kasih sudah nonton.', W / 2, H / 2 + 76, { size: 40, italic: true, color: `${ink}bb`, alpha: at(t, duration - 4.4, 1.4) })
      drawGrain(ctx, 0.06)
    },
  })
  return slides
}

function chapterCard(ctx, t, c, ink) {
  const a = fade(t, 0.2, OPEN - 0.3, 0.6)
  write(ctx, `BAB ${ROMAN[c]}`, W / 2, H / 2 - 40, { size: 24, family: MONO, spacing: 9, color: `${ink}aa`, alpha: a })
  write(ctx, CHAPTERS[c].title, W / 2, H / 2 + 60, { size: 96, italic: true, color: ink, alpha: a })
}
