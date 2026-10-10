import { unzipSync, zipSync } from 'fflate'
import { parseWhatsApp, ChatFormatError } from './parse/whatsapp.js'
import { computeStats } from './stats.js'
import { makeStory } from './story/slides.js'
import { Player } from './player.js'
import { slideImage, storyVideo, canMakeVideo } from './export.js'
import { Engine } from './three/engine.js'
import { Tunnel } from './three/tunnel.js'
import { nebula, authors } from './three/shapes.js'
import { THEMES, THEME_LIST, detectTheme } from './theme.js'
import { demoMessages, formatExport } from './demo.js'

// Everything happens on this page: the chat is read, counted and drawn in the browser, and
// never sent anywhere.
//
//   landing   a tunnel of chat bubbles; the vibe cards recolour it
//   picker    "what kind of chat is this?" (guessed, changeable), the tunnel in that theme
//   story     the 3D film; warp + flash on the way in

const $ = (id) => document.getElementById(id)
const landing = $('landing')
const picker = $('picker')
const storyView = $('story')
const fileInput = $('file')
const note = $('note')
const mobile = matchMedia('(pointer: coarse)').matches
const N = mobile ? 16000 : 30000
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

// — the tunnel (landing and picker) —
const tunnel = new Tunnel($('tunnel'), { count: mobile ? 200 : 380, theme: THEMES.bestie })
let tunnelOn = true
let last = performance.now()
function tunnelFrame(now) {
  requestAnimationFrame(tunnelFrame)
  const dt = Math.min((now - last) / 1000, 0.1)
  last = now
  if (!tunnelOn) return
  tunnel.resize(innerWidth, innerHeight, dpr)
  tunnel.update(dt)
}
requestAnimationFrame(tunnelFrame)
function setTheme(theme) {
  tunnel.setTheme(theme)
  paint(theme)
}
paint(THEMES.bestie)

// — vibe cards —
function vibeCard(theme, { auto = false, onPick } = {}) {
  const b = document.createElement('button')
  b.className = 'vibe'
  b.style.setProperty('--c1', theme.people[0])
  b.innerHTML = `${auto ? '<span class="vibe__auto">tebakan kami</span>' : ''}<span class="vibe__emoji">${theme.emoji}</span><span class="vibe__name">${theme.name}</span><span class="vibe__blurb">${theme.blurb}</span><span class="vibe__swatches">${theme.people.slice(0, 4).map((c) => `<i style="background:${c}"></i>`).join('')}</span>`
  b.addEventListener('pointerenter', () => setTheme(theme))
  b.addEventListener('focus', () => setTheme(theme))
  b.addEventListener('click', () => onPick?.(theme))
  return b
}
for (const theme of THEME_LIST) {
  $('vibe-list').append(vibeCard(theme, { onPick: (t) => {
    setTheme(t)
    for (const el of $('vibe-list').children) el.classList.toggle('is-on', el.querySelector('.vibe__name').textContent === t.name)
  } }))
}
$('vibe-list').addEventListener('pointerleave', () => {
  const on = [...$('vibe-list').children].find((el) => el.classList.contains('is-on'))
  if (!on) setTheme(THEMES.bestie)
})

// — reading a chat —
function error(message) {
  note.textContent = message
  note.classList.add('is-error')
}

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

function showPicker({ stats, guess }) {
  chat = { stats, theme: THEMES[guess] }
  landing.hidden = true
  picker.hidden = false
  scrollTo(0, 0)
  $('picker-count').textContent = `${stats.total.toLocaleString('id-ID')} pesan · ${stats.people.length} orang`
  const list = $('picker-list')
  list.innerHTML = ''
  for (const theme of THEME_LIST) {
    const card = vibeCard(theme, {
      auto: theme.id === guess,
      onPick: (t) => {
        chat.theme = t
        setTheme(t)
        for (const el of list.children) el.classList.toggle('is-on', el === card)
      },
    })
    if (theme.id === guess) card.classList.add('is-on')
    list.append(card)
  }
  // leaving a card puts the chosen theme back
  list.onpointerleave = () => setTheme(chat.theme)
  setTheme(chat.theme)
}

async function handle(file) {
  if (!file) return
  note.classList.remove('is-error')
  note.textContent = 'Membaca chat…'
  try {
    showPicker(analyse(await readChat(file), titleFrom(file.name)))
    note.textContent = ''
  } catch (err) {
    console.error(err)
    error(err instanceof ChatFormatError ? 'Ini bukan file export chat WhatsApp. Pilih file .txt atau .zip hasil "Ekspor chat".' : err.message)
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
  await fontsReady
  const { stats, theme } = chat
  // into hyperspace…
  const t0 = performance.now()
  await new Promise((resolve) => {
    const ramp = (now) => {
      const k = Math.min(1, (now - t0) / 1100)
      tunnel.warp = k * k
      if (k < 1) requestAnimationFrame(ramp)
      else resolve()
    }
    requestAnimationFrame(ramp)
  })
  $('flash').classList.remove('is-on')
  void $('flash').offsetWidth
  $('flash').classList.add('is-on')
  engine ??= new Engine({ count: N })
  const slides = makeStory(stats, N, theme)
  engine.setStory(slides, nebula(N, authors({ sequence: new Uint16Array([0, 1]) }, N)))
  story = { engine, slides }
  picker.hidden = true
  landing.hidden = true
  storyView.hidden = false
  document.body.classList.add('is-story')
  tunnelOn = false
  tunnel.warp = 0
  fitEngine()
  player?.destroy()
  player = new Player({ canvas: $('story-canvas'), bars: $('bars'), story })
  $('save-video').hidden = !canMakeVideo()
  scrollTo(0, 0)
}

function back() {
  player?.destroy()
  player = null
  story = null
  chat = null
  storyView.hidden = true
  picker.hidden = true
  landing.hidden = false
  document.body.classList.remove('is-story')
  fileInput.value = ''
  tunnelOn = true
  setTheme(THEMES.bestie)
}

fileInput.addEventListener('change', () => handle(fileInput.files[0]))
$('pick').addEventListener('click', () => fileInput.click())
const demoText = formatExport(demoMessages(), 'android-id')
$('demo').addEventListener('click', () => {
  chat = { stats: analyse(demoText, null).stats, theme: THEMES.couple }
  setTheme(chat.theme)
  play()
})
$('go').addEventListener('click', play)
$('cancel').addEventListener('click', back)
addEventListener('dragover', (e) => {
  e.preventDefault()
  document.body.classList.add('is-dragging')
})
addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) document.body.classList.remove('is-dragging')
})
addEventListener('drop', (e) => {
  e.preventDefault()
  document.body.classList.remove('is-dragging')
  if (!storyView.hidden) return
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
  if (!player) return
  if (e.key === 'ArrowRight') player.next()
  if (e.key === 'ArrowLeft') player.prev()
  if (e.key === ' ') {
    e.preventDefault()
    player.playing = !player.playing
  }
  if (e.key === 'Escape') back()
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

async function busy(button, label, job) {
  const was = button.textContent
  button.disabled = true
  button.textContent = label
  player.paused = true
  try {
    await job((text) => (button.textContent = text))
  } catch (err) {
    console.error(err)
    alert(err.message)
  } finally {
    button.disabled = false
    button.textContent = was
    if (player) player.paused = false
  }
}

$('save').addEventListener('click', () => {
  if (!player) return
  busy($('save'), 'Menyimpan…', async () => {
    const blob = await slideImage(story, player.i)
    await deliver(blob, `chat-wrapped-${pad(player.i + 1)}.png`, 'image/png')
  })
})
$('save-all').addEventListener('click', () => {
  if (!player) return
  busy($('save-all'), 'Menyiapkan…', async () => {
    const files = {}
    for (let i = 0; i < story.slides.length; i++) {
      const blob = await slideImage(story, i)
      files[`chat-wrapped-${pad(i + 1)}.png`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]
    }
    download(new Blob([zipSync(files)], { type: 'application/zip' }), 'chat-wrapped.zip')
  })
})
$('save-video').addEventListener('click', () => {
  if (!player) return
  busy($('save-video'), 'Bikin video 0%', async (say) => {
    const blob = await storyVideo(story, { onProgress: (p) => say(`Bikin video ${Math.round(p * 100)}%`) })
    if (blob) await deliver(blob, 'chat-wrapped.mp4', 'video/mp4')
  })
})
$('again').addEventListener('click', back)

if (import.meta.env.DEV) window.__cw = { get player() { return player }, get story() { return story }, get engine() { return engine }, tunnel, analyse, showPicker, play, demoText, storyVideo, slideImage, THEMES, setChat: (c) => (chat = c) }
