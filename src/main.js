import { unzipSync, zipSync } from 'fflate'
import { parseWhatsApp, ChatFormatError } from './parse/whatsapp.js'
import { computeStats } from './stats.js'
import { makeStory } from './story/slides.js'
import { Player } from './player.js'
import { readSong, suggestStart, snap } from './music/beat.js'
import { Track } from './music/track.js'
import { slideImage, storyVideo, canMakeVideo } from './export.js'
import { Engine } from './three/engine.js'
import { Stage } from './stage.js'
import { Drum } from './drum.js'
import { nebula, authors } from './three/shapes.js'
import { THEMES, THEME_LIST, detectTheme } from './theme.js'
import { demoMessages, formatExport } from './demo.js'

// Everything happens on this page: the chat is read, counted and drawn in the browser, and
// never sent anywhere.
//
//   landing   the 3D studio playing the demo chat; each part of the page has its own sculpture,
//             the vibes recolour it
//   picker    "what kind of chat is this?" (guessed, changeable), your own chat in the studio
//   story     the 3D film; the bubbles fly up, a flash, and they rain down into the film

const $ = (id) => document.getElementById(id)
const landing = $('landing')
const picker = $('picker')
const storyView = $('story')
const fileInput = $('file')
const mobile = matchMedia('(pointer: coarse)').matches
const N = mobile ? 1200 : 2400
const dpr = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75)

const fontsReady = Promise.all([
  document.fonts.load('800 100px "Bricolage Grotesque"'),
  document.fonts.load('600 100px "Bricolage Grotesque"'),
  document.fonts.load('400 40px "Geist"'),
  document.fonts.load('500 40px "Geist"'),
  document.fonts.load('500 40px "Geist Mono"'),
]).catch(() => {})

// — the page's colours follow the theme too —
function paint(theme) {
  const r = document.documentElement.style
  r.setProperty('--accent', theme.accent)
  r.setProperty('--bg', theme.bg)
  r.setProperty('--ink', theme.ink)
  document.querySelector('meta[name="theme-color"]').content = theme.bg
}

// — the studio (landing and picker), playing the demo until you pick your own chat —
const demoText = formatExport(demoMessages(), 'android-id')
const demoStats = () => analyse(demoText, null).stats
// lighter than the film (no depth of field, a smaller mirror), so it never drops frames
const sceneNames = [...document.querySelectorAll('.scene')].map((s) => s.dataset.scene)
const stage = new Stage($('stage'), { count: mobile ? 900 : 1800, quality: mobile ? 0.4 : 0.55, stats: demoStats(), theme: THEMES.bestie, scenes: sceneNames })
let stageOn = true
// the resolution adapts: if frames run long, draw fewer pixels
let pr = 1
let slow = 0
let last = performance.now()
function stageFrame(now) {
  requestAnimationFrame(stageFrame)
  const dt = Math.min((now - last) / 1000, 0.1)
  last = now
  if (!stageOn) return
  slow = slow * 0.95 + (dt > 0.021 ? 1 : 0) * 0.05
  if (slow > 0.5 && pr > 0.6) {
    pr = Math.max(0.6, pr - 0.2)
    slow = 0
  }
  // the cursor's parallax for the words (the studio's camera leans the same way)
  const r = document.documentElement.style
  r.setProperty('--px', stage.mouse.x.toFixed(3))
  r.setProperty('--py', (-stage.mouse.y).toFixed(3))
  if (!landing.hidden) stage.target = scrollY / (deck[0].offsetHeight || innerHeight)
  songFrame()
  stage.frame(now, innerWidth, innerHeight, pr)
  if (!landing.hidden) motion()
}
requestAnimationFrame(stageFrame)

// — the landing: scenes of one screen each, everything moving with the scroll —
// every title is split into letters (inside unbreakable words), each with its place in line (--k)
function split(el) {
  const letters = []
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment()
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return
          if (/^\s+$/.test(part)) return frag.append(' ')
          const w = document.createElement('span')
          w.className = 'w'
          for (const c of part) {
            const ch = document.createElement('span')
            ch.className = 'ch'
            ch.textContent = c
            letters.push(ch)
            w.append(ch)
          }
          frag.append(w)
        })
        child.replaceWith(frag)
      } else walk(child)
    }
  }
  walk(el)
  // each letter's own way of coming apart: where it flies (em, px towards you) and how it turns (deg)
  const r = (a, b) => (a + Math.random() * (b - a)).toFixed(2)
  letters.forEach((ch, i) => {
    ch.style.setProperty('--k', (i / Math.max(1, letters.length - 1)).toFixed(3))
    ch.style.cssText += `;--sx:${r(-2.6, 2.6)};--sy:${r(-1.8, 1.4)};--sz:${r(250, 900)};--rx:${r(-160, 160)};--ry:${r(-200, 200)};--rz:${r(-90, 90)}`
  })
}
for (const el of document.querySelectorAll('[data-split]')) split(el)
document.querySelectorAll('.steps li').forEach((li, i, all) => li.style.setProperty('--k', i / (all.length - 1)))

// labels that decode like a cipher: random characters settling into the words, left to right
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+<>/'
function decode(el, ms = 700) {
  const text = (el.dataset.text ??= el.textContent)
  const t0 = performance.now()
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms)
    const fixed = Math.floor(k * text.length)
    el.textContent = text.slice(0, fixed) + [...text.slice(fixed)].map((c) => (c === ' ' ? ' ' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])).join('')
    if (k < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

const deck = [...document.querySelectorAll('.scene')]
let at = 0
const restart = (el, cls) => {
  el.classList.remove(cls)
  void el.offsetWidth
  el.classList.add(cls)
}
// the scene across the middle of the screen: its label decodes
function arrive(i) {
  if (i < 0 || view !== 'landing') return
  const changed = i !== at
  at = i
  if (changed) for (const el of deck[i].querySelectorAll('[data-decode]')) decode(el)
  // the vibes' drum turns by itself while it's showing; leave it and the landing's own colours come back
  const vibes = deck[i].dataset.scene === 'cover'
  vibeDrum.play(vibes)
  if (!vibes && stage.theme !== THEMES.bestie) {
    setTheme(THEMES.bestie)
    vibeDrum.set(THEME_LIST.indexOf(THEMES.bestie), { silent: true })
  }
}
const watcher = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) arrive(deck.indexOf(e.target))
}, { rootMargin: '-45% 0px -45% 0px' })
for (const el of deck) watcher.observe(el)

// — data floating in the studio, at different depths: the further, the faster it slides past —
const DEMO = demoStats()
{
  const S = DEMO
  const P = S.people
  const pct = (p) => `${Math.round(p.share * 100)}%`
  const fav = P.flatMap((p) => p.topEmoji).sort((a, b) => b[1] - a[1])[0]
  const short = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' })
  const chips = {
    badge: [['pesan', S.total.toLocaleString('id-ID')], ['hari', S.spanDays], [`${P[0].name} & ${P[1].name}`, 'contoh']],
    orbs: [[P[0].name, pct(P[0])], [P[1].name, pct(P[1])], ['selisih', `${Math.abs(P[0].messages - P[1].messages).toLocaleString('id-ID')} pesan`]],
    pillars: [['jam paling rame', `${String(S.peakHour).padStart(2, '0')}.00`], ['lewat tengah malam', `${Math.round(S.nightShare * 100)}%`]],
    terrain: [['hari ngobrol', S.activeDays], ['paling rame', `${short.format(S.busiest.date)} · ${S.busiest.n}`], ['rekor', `${S.streak.length} hari`]],
    emoji: [[fav?.[0] ?? '💬', `${fav?.[1] ?? 0}×`], ['ketawa', `${S.laughs.toLocaleString('id-ID')}×`]],
    galaxy: [['adegan', '11'], ['video', '1080×1920'], ['frame', '30/detik']],
    cover: [['vibe', '5 pilihan'], ['tebakan', 'otomatis']],
    spark: [['di-upload', '0 byte'], ['diproses', 'di browsermu']],
  }
  // places around the sculpture (left %, top %, depth); deeper ones move more
  const spots = [[58, 20, 1.7], [80, 62, 0.6], [64, 78, 1.2]]
  for (const scene of deck) {
    for (const [i, [label, value]] of (chips[scene.dataset.scene] ?? []).entries()) {
      const [x, y, d] = spots[i]
      const c = document.createElement('div')
      c.className = 'chip'
      c.dataset.i = i
      c.style.cssText = `--x:${x}%;--y:${y}%;--depth:${d}`
      c.innerHTML = `<i></i><b>${value}</b><span>${label}</span>`
      scene.append(c)
    }
  }
}

// — every frame: each scene's place relative to the screen (from the 3D's eased scroll, so words
// and bubbles move as one), and how fast the page is moving —
// the first scene assembles itself once the fonts are in (1.6 s, by the clock: a slow first frame mustn't stretch it)
let introAt = Infinity
fontsReady.then(() => (introAt = performance.now()))
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
function motion() {
  const intro = clamp((1 - (performance.now() - introAt) / 1600), 0, 1)
  const r = document.documentElement.style
  r.setProperty('--v', clamp((stage.target - stage.pos) * 2.5, -1, 1).toFixed(3))
  for (const [i, el] of deck.entries()) {
    const p = i - stage.pos // −1 above … 0 filling the screen … +1 below
    if (Math.abs(p) > 1.6) continue
    // how far apart it has come: 0 in place, 1 scattered (eased in)
    let a = clamp(Math.abs(p) * 1.3, 0, 1)
    if (i === 0) a = Math.max(a, 1 - (1 - intro) ** 3)
    el.style.setProperty('--p', p.toFixed(4))
    el.style.setProperty('--a', (a * a * (3 - 2 * a)).toFixed(4))
    el.style.setProperty('--s', p > 0 ? -1 : 1) // coming: from deep inside; going: past your face
  }
}

// — the composer: picking your chat, like attaching a file in a chat, always at the bottom —
// Idle, it types its own hints, one after another; it changes when you hover, drag a file over
// the page, while it reads, and when something's wrong.
const composer = $('composer')
const composerText = $('composer-text')
const HINTS = ['Lampirkan export chat WhatsApp kalian…', 'File .txt atau .zip, tanpa media…', 'Nggak di-upload. Dibaca di sini aja…', 'Klik di sini, atau seret file-nya ke mana aja…']
let typing = null
function typeHints() {
  clearTimeout(typing)
  let n = 0
  let k = 0
  let back = false
  const step = () => {
    const line = HINTS[n % HINTS.length]
    if (!back) {
      composerText.textContent = line.slice(0, ++k)
      if (k < line.length) typing = setTimeout(step, 28 + Math.random() * 40)
      else {
        back = true
        typing = setTimeout(step, 2400)
      }
    } else {
      composerText.textContent = line.slice(0, --k)
      if (k > 0) typing = setTimeout(step, 14)
      else {
        back = false
        n++
        typing = setTimeout(step, 350)
      }
    }
  }
  step()
}
/** state: '' (typing its hints), 'hover', 'drop', 'busy', 'error', 'play' (on the picker) */
function composerSay(text, state = '') {
  composer.dataset.state = state
  if (!state) return typeHints()
  clearTimeout(typing)
  composerText.textContent = text
}
// on the picker it plays the film (the paperclip still takes another file)
function composerPlay() {
  composerSay(`Putar film ${whoOf(chat.stats)}${song ? ' ♪' : ''}`, 'play')
}
composer.addEventListener('click', (e) => {
  const state = composer.dataset.state
  if (state === 'busy' || state === 'saving') return
  if (state === 'save') return openSheet(!sheet.classList.contains('is-open'))
  if (state === 'play' && !e.target.closest('.composer__clip')) play()
  else fileInput.click()
})
composer.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), composer.click()))
composer.addEventListener('pointerenter', () => !composer.dataset.state && composerSay('Pilih file chat kalian', 'hover'))
composer.addEventListener('pointerleave', () => composer.dataset.state === 'hover' && composerSay())
fontsReady.then(() => composerSay())

// the hero's messages: each one "typing…" first, then the words
fontsReady.then(() => {
  document.querySelectorAll('.msg').forEach((m, i) => {
    setTimeout(() => m.classList.add('is-on'), 700 + i * 1500)
    setTimeout(() => m.classList.add('is-typed'), 1500 + i * 1500)
  })
})

// — buttons lean towards the cursor —
for (const b of document.querySelectorAll('.button--primary, .button--ghost')) {
  b.addEventListener('pointermove', (e) => {
    const r = b.getBoundingClientRect()
    b.style.setProperty('--mx', `${((e.clientX - r.left) / r.width - 0.5) * 10}px`)
    b.style.setProperty('--my', `${((e.clientY - r.top) / r.height - 0.5) * 8}px`)
  })
  b.addEventListener('pointerleave', () => {
    b.style.removeProperty('--mx')
    b.style.removeProperty('--my')
  })
}
// which screen we're on (or heading to), and a count of moves so an overtaken transition stops
let view = 'landing'
let moves = 0
function setTheme(theme) {
  stage.setTheme(theme)
  paint(theme)
}
paint(THEMES.bestie)

// — the vibes: a drum on the landing (turning by itself while it's showing), another on the picker —
const vibeDrum = new Drum($('vibe-drum'), THEME_LIST, { onChange: setTheme })
vibeDrum.set(THEME_LIST.indexOf(THEMES.bestie), { silent: true })
const pickerDrum = new Drum($('picker-drum'), THEME_LIST, {
  wheel: true,
  onChange: (t) => {
    chat.theme = t
    setTheme(t)
    if (song) drawWave()
  },
})

// — a song to watch the film with (optional) —
// Only to hear how the film goes with the song you'll put on it on Instagram: it plays with the
// film here, and the saved video stays silent (you add the song there, from the time we tell you).
// On the picker: add one, and slide the lit part of its waveform to where the film should start
// (it snaps to a beat; we've already put it where the song kicks in). It plays while you choose.
let audio = null // the AudioContext: made on a tap (browsers only make sound after one)
let song = null // { name, buffer, beat, start, track, paused }
const songEl = $('song')
const songWave = $('song-wave')
const songCanvas = songWave.querySelector('canvas')
const HINT = 'opsional · buat ngepasin sama lagu yang mau kamu pakai di IG'
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// how long this chat's film is
let lengthOf = null
function filmLength() {
  if (lengthOf?.chat !== chat) lengthOf = { chat, s: makeStory(chat.stats, 300, chat.theme).reduce((a, s) => a + s.duration, 0) }
  return lengthOf.s
}

function drawWave() {
  const r = songWave.getBoundingClientRect()
  const k = Math.min(devicePixelRatio || 1, 2)
  songCanvas.width = Math.round(r.width * k)
  songCanvas.height = Math.round(r.height * k)
  const g = songCanvas.getContext('2d')
  const { peaks, duration } = song.beat
  const len = filmLength()
  const from = song.start / duration
  const to = Math.min(1, (song.start + len) / duration)
  songWave.style.setProperty('--from', from)
  songWave.style.setProperty('--span', to - from)
  $('song-at').textContent = `${mmss(song.start)} – ${mmss(Math.min(duration, song.start + len))}`
  // bars like a voice note's: the part the film plays in the accent
  const n = Math.max(24, Math.floor(r.width / 5))
  const w = songCanvas.width / n
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  for (let i = 0; i < n; i++) {
    let m = 0
    for (let j = Math.floor((i / n) * peaks.length); j < Math.floor(((i + 1) / n) * peaks.length); j++) m = Math.max(m, peaks[j])
    const h = Math.max(3 * k, m ** 0.8 * songCanvas.height * 0.72)
    const x = (i + 0.5) / n
    g.fillStyle = x >= from && x <= to ? accent : 'rgba(242, 246, 255, 0.22)'
    g.beginPath()
    g.roundRect(i * w + w * 0.22, (songCanvas.height - h) / 2, w * 0.56, h, w * 0.28)
    g.fill()
  }
}

function songUI() {
  const on = !!song
  $('song-add').hidden = on
  $('song-deck').hidden = !on
  if (!on) return
  $('song-name').textContent = song.name
  drawWave()
  if (view === 'picker') composerPlay()
}

// the preview: the film's part of the song, round and round
function preview(on = true) {
  if (!song) return
  song.paused = !on
  if (on) song.track.play(song.start, 0.15)
  else song.track.stop(0.25)
}

$('song-add').addEventListener('click', () => {
  audio ??= new (window.AudioContext || window.webkitAudioContext)()
  audio.resume()
  $('song-file').click()
})
$('song-file').addEventListener('change', async () => {
  const file = $('song-file').files[0]
  $('song-file').value = ''
  if (!file) return
  songEl.classList.remove('is-error')
  songEl.classList.add('is-busy')
  $('song-hint').textContent = 'Dengerin lagunya…'
  await wait(30)
  try {
    const { buffer, beat } = await readSong(file, audio)
    song?.track.stop()
    song = { name: file.name.replace(/\.[^.]+$/, ''), buffer, beat, track: new Track(audio, buffer), start: 0 }
    song.start = suggestStart(beat, filmLength())
    songUI()
    preview()
  } catch (err) {
    console.error(err)
    songEl.classList.add('is-error')
    $('song-hint').textContent = 'Lagu ini nggak kebaca. Coba file mp3 atau m4a.'
  } finally {
    songEl.classList.remove('is-busy')
  }
})
$('song-drop').addEventListener('click', () => {
  song?.track.stop(0.3)
  song = null
  $('song-hint').textContent = HINT
  songUI()
  composerPlay()
})
// slide the lit part along (it snaps to a beat when you let go); a tap without sliding: play/pause
{
  let drag = null
  songWave.addEventListener('pointerdown', (e) => {
    if (!song) return
    songWave.setPointerCapture(e.pointerId)
    drag = { x: e.clientX, start: song.start, moved: false }
  })
  songWave.addEventListener('pointermove', (e) => {
    if (!drag) return
    const dx = e.clientX - drag.x
    if (Math.abs(dx) > 4) drag.moved = true
    if (!drag.moved) return
    songWave.classList.add('is-dragging')
    const { duration } = song.beat
    song.start = Math.max(0, Math.min(duration - 4, drag.start + (dx / songWave.clientWidth) * duration))
    drawWave()
  })
  const end = () => {
    if (!drag) return
    songWave.classList.remove('is-dragging')
    if (drag.moved) {
      song.start = snap(song.beat, song.start)
      drawWave()
      preview()
    } else preview(song.paused || !song.track.on)
    drag = null
  }
  songWave.addEventListener('pointerup', end)
  songWave.addEventListener('pointercancel', end)
  // a bar at a time with the keys
  songWave.addEventListener('keydown', (e) => {
    if (!song || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return
    e.preventDefault()
    const bar = 4 * song.beat.period
    song.start = snap(song.beat, Math.max(0, Math.min(song.beat.duration - 4, song.start + (e.key === 'ArrowRight' ? bar : -bar))))
    drawWave()
    preview()
  })
}
addEventListener('resize', () => song && view === 'picker' && drawWave())
// every frame on the picker: round again at the end of the film's part
function songFrame() {
  if (!song || view !== 'picker' || !song.track.on) return
  const T = song.track.time - song.start
  if (T >= Math.min(filmLength(), song.beat.duration - song.start - 0.1)) song.track.play(song.start, 0.15)
}

// — reading a chat —

// "WhatsApp Chat with Nadia.txt", "Chat WhatsApp dengan Liburan.zip", "WhatsApp Chat - Nadia.zip"
function titleFrom(filename) {
  return filename.replace(/\.(txt|zip)$/i, '').replace(/^(whatsapp chat (with|-)|chat whatsapp (dengan|-))\s*/i, '').trim() || null
}

async function readChat(file) {
  const buf = new Uint8Array(await file.arrayBuffer())
  // a .zip (with or without media): the chat is the biggest .txt inside
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const files = unzipSync(buf, { filter: (f) => /\.txt$/i.test(f.name) && !f.name.startsWith('__MACOSX') })
    const best = Object.entries(files).sort((a, b) => b[1].length - a[1].length)[0]
    if (!best) throw new ChatFormatError()
    return new TextDecoder().decode(best[1])
  }
  return new TextDecoder().decode(buf)
}

let chat = null // { stats, theme }

function analyse(text, title) {
  const parsed = parseWhatsApp(text)
  if (parsed.people.length < 2) throw new Error('Chat ini cuma berisi satu orang. Coba chat dengan orang lain atau grup.')
  if (parsed.messages.length < 30) throw new Error('Chat-nya terlalu pendek untuk diceritain. Coba chat yang lebih panjang.')
  const stats = computeStats(parsed, { title: parsed.people.length > 2 ? title : null })
  return { stats, guess: detectTheme(stats, text) }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// a number counting up to n (in id-ID), easing out
function count(el, n, ms, done) {
  const t0 = performance.now()
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms)
    el.textContent = Math.round(n * (1 - (1 - k) ** 4)).toLocaleString('id-ID')
    if (k < 1) requestAnimationFrame(step)
    else done?.()
  }
  requestAnimationFrame(step)
}
const whoOf = (S) => (S.group ? S.title ?? `${S.people.length} orang` : `${S.people[0].name} & ${S.people[1].name}`)

// a value eased from a to b over ms, handed to fn each frame; resolves when done
function tween(a, b, ms, fn, curve = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2)) {
  return new Promise((resolve) => {
    const t0 = performance.now()
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms)
      fn(a + (b - a) * curve(k))
      if (k < 1) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  })
}

/*
 * After you pick your chat — one thing at a time:
 *   send     the composer shrinks to a point of light and floats up to the middle; the page fades
 *   gather   every bubble is drawn into one ball there, the camera comes close, the edges darken;
 *            one quiet line counts your messages
 *   breathe  the ball pulses with the reading, faster and tighter
 *   hush     the line goes; the ball presses in once more; a beat of nothing
 *   bang     it bursts: all at once, outwards, a flash and a ring of light, the camera thrown back,
 *            and the bubbles brake into your chat's own sculpture
 *   title    your names, letter by letter, like a film's title card
 *   land     the title flies up into the picker's corner; the picker builds in round it
 */
async function showPicker({ stats, guess }) {
  view = 'picker'
  const move = ++moves
  const theme = THEMES[guess]
  chat = { stats, theme }
  const e = stage.engine
  const gone = () => move !== moves
  // send
  composer.classList.remove('is-away')
  restart(composer, 'is-sending')
  if (!landing.hidden) landing.classList.add('is-leaving')
  if (!picker.hidden) picker.classList.add('is-leaving')
  document.body.classList.add('is-reading')
  // gather
  stage.setStats(stats)
  stage.focus = 'centre'
  stage.show('core', { force: true, style: 'gather' })
  await wait(350)
  const reading = $('reading')
  reading.hidden = false
  restart(reading, 'is-on')
  count($('reading-count'), stats.total, 1700)
  tween(0, 1, 1750, (v) => ($('reading-bar').style.transform = `scaleX(${v})`))
  // breathe: in and out, quicker each time
  for (const [to, ms] of [[0.84, 380], [1.04, 300], [0.8, 260], [1.03, 220], [0.78, 200], [1, 180]]) {
    await tween(e.squeeze, to, ms, (v) => (e.squeeze = v))
    if (gone()) return
  }
  // hush
  reading.classList.add('is-out')
  await tween(e.squeeze, 0.62, 260, (v) => (e.squeeze = v))
  await wait(140)
  if (gone()) return
  // bang
  e.squeeze = 1
  $('flash').classList.add('is-soft')
  restart($('flash'), 'is-on')
  paint(theme)
  stage.show('cover', { theme, style: 'bang' })
  composer.classList.remove('is-sending')
  composer.classList.add('is-away')
  landing.classList.remove('is-leaving')
  picker.classList.remove('is-leaving')
  landing.hidden = true
  picker.hidden = true
  reading.hidden = true
  document.body.classList.remove('is-reading')
  await wait(550)
  if (gone()) return
  // title
  const card = $('reveal')
  const who = $('reveal-who')
  who.textContent = whoOf(stats)
  split(who)
  const since = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(stats.start)
  $('reveal-meta').textContent = `${stats.total.toLocaleString('id-ID')} pesan · ${stats.spanDays.toLocaleString('id-ID')} hari · sejak ${since}`
  card.hidden = false
  restart(card, 'is-on')
  await wait(1500)
  if (gone()) return
  // land: the picker is laid out (unseen), the title flies to where its name sits, then it builds in
  $('picker-who').textContent = whoOf(stats)
  const since2 = new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric' }).format(stats.start)
  $('picker-stats').innerHTML = [['pesan', stats.total], ['hari', stats.spanDays], ['orang', stats.people.length], ['sejak', since2]]
    .map(([label, v], i) => `<div style="--k:${i / 3}"><dt>${label}</dt><dd data-n="${typeof v === 'number' ? v : ''}">${typeof v === 'number' ? 0 : v}</dd></div>`).join('')
  pickerDrum.guess(guess)
  pickerDrum.set(THEME_LIST.indexOf(theme), { silent: true })
  picker.classList.add('is-prep')
  picker.hidden = false
  const from = who.getBoundingClientRect()
  const to = $('picker-who').getBoundingClientRect()
  stage.focus = 'side'
  card.classList.add('is-landing')
  who.animate(
    [{ transform: 'none' }, { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.height / from.height})` }],
    { duration: 750, easing: 'cubic-bezier(0.7, 0, 0.2, 1)', fill: 'forwards' },
  )
  await wait(620)
  if (gone()) return
  picker.classList.remove('is-prep')
  restart(picker, 'is-entering')
  for (const dd of $('picker-stats').querySelectorAll('[data-n]:not([data-n=""])')) setTimeout(() => count(dd, +dd.dataset.n, 1200), 400)
  await wait(200)
  card.hidden = true
  who.getAnimations().forEach((a) => a.cancel())
  card.classList.remove('is-on', 'is-landing')
  composer.classList.remove('is-away')
  composerPlay()
  if (song) songUI()
}

async function handle(file) {
  if (!file) return
  composerSay(`Membaca ${file.name}…`, 'busy')
  try {
    await showPicker(analyse(await readChat(file), titleFrom(file.name)))
  } catch (err) {
    console.error(err)
    composerSay(err instanceof ChatFormatError ? 'Itu bukan export chat WhatsApp. Pakai .txt / .zip hasil "Ekspor chat".' : err.message, 'error')
    setTimeout(() => composer.dataset.state === 'error' && (view === 'picker' ? composerPlay() : composerSay()), 5000)
  }
}

// — the film —
let engine = null
let player = null
let story = null

function fitEngine() {
  // the 3D renders at the frame's real pixel size (at most 1080 wide); words are always 1080
  const r = $('story-frame').getBoundingClientRect()
  const w = Math.min(1080, Math.round(r.width * Math.min(devicePixelRatio || 1, 2)))
  engine.resize(w, Math.round((w * 16) / 9), 1)
}

async function play() {
  if (!chat) return
  view = 'story'
  moves++
  await fontsReady
  const { stats, theme } = chat
  // the preview fades; the film starts the song from the top of its part
  song?.track.stop(0.9)
  audio?.resume()
  // everything lifts off into the sky…
  composerSay('Menyiapkan film…', 'busy')
  paint(theme)
  stage.show('nebula', { theme })
  await new Promise((resolve) => setTimeout(resolve, 1300))
  $('flash').classList.remove('is-soft')
  restart($('flash'), 'is-on')
  engine ??= new Engine({ count: N, quality: mobile ? 0.5 : 1 })
  const slides = makeStory(stats, N, theme)
  engine.setStory(slides, nebula(N, authors({ sequence: new Uint16Array([0, 1]) }, N)))
  story = { engine, slides }
  picker.hidden = true
  landing.hidden = true
  storyView.hidden = false
  document.body.classList.add('is-story')
  stageOn = false
  fitEngine()
  player?.destroy()
  player = new Player({ canvas: $('story-canvas'), bars: $('bars'), story, music: song && { track: song.track, start: song.start } })
  $('save-video').hidden = !canMakeVideo()
  // the video is silent: on Instagram, the song goes on from where it starts here
  $('save-video').querySelector('small').textContent = song ? `Tanpa suara · di IG, mulai lagunya dari ${mmss(song.start)}` : 'MP4 1080×1920, siap story & reels'
  composerSay(SAVE, 'save')
  scrollTo(0, 0)
}

function back() {
  view = 'landing'
  moves++
  player?.destroy()
  player = null
  story = null
  chat = null
  song?.track.stop(0.3)
  song = null
  $('song-hint').textContent = HINT
  songUI()
  storyView.hidden = true
  picker.hidden = true
  $('reading').hidden = true
  $('reveal').hidden = true
  document.body.classList.remove('is-reading')
  composer.classList.remove('is-sending', 'is-away')
  landing.hidden = false
  document.body.classList.remove('is-story')
  fileInput.value = ''
  stageOn = true
  // back where you were on the landing, with the demo again
  stage.setStats(demoStats())
  stage.focus = 'side'
  paint(THEMES.bestie)
  stage.theme = THEMES.bestie
  deck[at].scrollIntoView({ behavior: 'instant' })
  stage.target = at
  stage.follow()
  composerSay()
}
// leaving the picker without playing: back to the landing
async function leavePicker() {
  const move = ++moves
  picker.classList.add('is-leaving')
  await wait(550)
  picker.classList.remove('is-leaving', 'is-entering')
  if (move === moves) back()
}

fileInput.addEventListener('change', () => handle(fileInput.files[0]))
$('demo').addEventListener('click', () => {
  chat = { stats: demoStats(), theme: THEMES.couple }
  setTheme(chat.theme)
  play()
})
// a file dragged over the page: anywhere will do, the button says so
addEventListener('dragover', (e) => {
  e.preventDefault()
  if (view !== 'story' && composer.dataset.state !== 'drop') composerSay('Lepas di sini, langsung dibaca', 'drop')
})
addEventListener('dragleave', (e) => {
  if (!e.relatedTarget && composer.dataset.state === 'drop') view === 'picker' ? composerPlay() : composerSay()
})
addEventListener('drop', (e) => {
  e.preventDefault()
  if (view === 'story') return
  handle(e.dataTransfer.files[0])
})
addEventListener('resize', () => story && fitEngine())

// — the story's controls —
const frame = $('story-frame')
let holdTimer = null
let held = false
frame.addEventListener('pointerdown', () => {
  held = false
  holdTimer = setTimeout(() => {
    held = true
    if (player) player.held = true
  }, 220)
})
frame.addEventListener('pointerup', (e) => {
  clearTimeout(holdTimer)
  if (!player) return
  player.held = false
  if (held) return // that was a pause, not a tap
  const r = frame.getBoundingClientRect()
  if (e.clientX - r.left < r.width * 0.3) player.prev()
  else player.next()
})
frame.addEventListener('pointercancel', () => {
  clearTimeout(holdTimer)
  if (player) player.held = false
})
addEventListener('keydown', (e) => {
  if (view === 'picker' && e.key === 'Escape') return leavePicker()
  if (!player) return
  if (e.key === 'ArrowRight') player.next()
  if (e.key === 'ArrowLeft') player.prev()
  if (e.key === ' ') {
    e.preventDefault()
    player.playing = !player.playing
  }
  if (e.key === 'Escape') sheet.classList.contains('is-open') ? openSheet(false) : back()
})

function download(blob, name) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
const pad = (n) => String(n).padStart(2, '0')

// on phones, straight to the share sheet (Instagram, WhatsApp, Photos); elsewhere, a download
async function deliver(blob, name, type) {
  const file = new File([blob], name, { type })
  if (mobile && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (err) {
      if (err.name === 'AbortError') return
    }
  }
  download(blob, name)
}

// — under the film: the composer says "save", and opens a small sheet of what you can save —
const sheet = $('sheet')
const SAVE = 'Simpan film kalian'
function openSheet(on) {
  if (on) sheet.hidden = false
  void sheet.offsetWidth
  sheet.classList.toggle('is-open', on)
  composer.classList.toggle('is-open', on)
  if (!on) setTimeout(() => sheet.classList.contains('is-open') || (sheet.hidden = true), 450)
}
addEventListener('pointerdown', (e) => {
  if (sheet.classList.contains('is-open') && !e.target.closest('#sheet, #composer')) openSheet(false)
})
const bar = composer.querySelector('.composer__bar')
// one job at a time, its progress told in the composer (p: 0…1 fills its line)
async function saving(label, job) {
  if (!player || composer.dataset.state === 'saving') return
  openSheet(false)
  player.paused = true
  composerSay(label, 'saving')
  bar.style.transform = 'scaleX(0)'
  try {
    await job((text, p) => {
      composerText.textContent = text
      if (p != null) bar.style.transform = `scaleX(${p})`
    })
    composerSay('Tersimpan', 'saving')
    bar.style.transform = 'scaleX(1)'
    await wait(1200)
  } catch (err) {
    console.error(err)
    composerSay(err.message, 'error')
    await wait(4500)
  } finally {
    if (player) player.paused = false
    bar.style.transform = ''
    if (view === 'story') composerSay(SAVE, 'save')
  }
}

$('save').addEventListener('click', () =>
  saving('Menyimpan gambar…', async () => {
    const blob = await slideImage(story, player.i)
    await deliver(blob, `chat-wrapped-${pad(player.i + 1)}.png`, 'image/png')
  }))
$('save-all').addEventListener('click', () =>
  saving('Menyiapkan semua gambar…', async (say) => {
    const files = {}
    for (let i = 0; i < story.slides.length; i++) {
      const blob = await slideImage(story, i)
      files[`chat-wrapped-${pad(i + 1)}.png`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]
      say(`Menyiapkan gambar ${i + 1} dari ${story.slides.length}…`, (i + 1) / story.slides.length)
    }
    download(new Blob([zipSync(files)], { type: 'application/zip' }), 'chat-wrapped.zip')
  }))
$('save-video').addEventListener('click', () =>
  saving('Bikin video…', async (say) => {
    // how far, and roughly how long to go (from how fast it's been so far)
    const t0 = performance.now()
    const blob = await storyVideo(story, {
      onProgress: (p) => {
        const left = p > 0.03 ? ((performance.now() - t0) / p) * (1 - p) / 1000 : null
        say(`Bikin video ${Math.floor(p * 100)}%${left == null ? '' : left > 60 ? ` · ±${Math.ceil(left / 60)} menit lagi` : ` · ±${Math.ceil(left / 5) * 5} detik lagi`}`, p)
      },
    })
    if (blob) await deliver(blob, 'chat-wrapped.mp4', 'video/mp4')
  }))
$('again').addEventListener('click', () => {
  openSheet(false)
  back()
})

if (import.meta.env.DEV) window.__cw = { get player() { return player }, get story() { return story }, get engine() { return engine }, stage, analyse, showPicker, play, demoText, storyVideo, slideImage, THEMES, setChat: (c) => (chat = c), get song() { return song } }
