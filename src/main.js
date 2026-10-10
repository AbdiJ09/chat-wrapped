import { unzipSync, zipSync } from 'fflate'
import { parseWhatsApp, ChatFormatError } from './parse/whatsapp.js'
import { computeStats } from './stats.js'
import { makeStory } from './story/slides.js'
import { Player } from './player.js'
import { slideImage, storyVideo, canMakeVideo } from './export.js'
import { Engine } from './three/engine.js'
import { nebula, authors } from './three/shapes.js'
import { demoMessages, formatExport } from './demo.js'

// Everything happens on this page: the chat is read, counted and drawn in the browser, and
// never sent anywhere.

const $ = (id) => document.getElementById(id)
const landing = $('landing')
const storyView = $('story')
const fileInput = $('file')
const note = $('note')
const mobile = matchMedia('(pointer: coarse)').matches
const N = mobile ? 16000 : 30000

const fontsReady = Promise.all([
  document.fonts.load('300 100px "Fraunces"'),
  document.fonts.load('italic 300 100px "Fraunces"'),
  document.fonts.load('400 40px "Inter"'),
  document.fonts.load('500 40px "Inter"'),
]).catch(() => {})

const engine = new Engine({ count: N })
let player = null
let story = null

// — the landing page: the example chat's DNA, turning behind the headline —
const demoText = formatExport(demoMessages(), 'android-id')
let demo = null
let landingT = 0
let landingOn = false
let lastNow = performance.now()

async function startLanding() {
  await fontsReady
  demo ??= makeStory(computeStats(parseWhatsApp(demoText)), N)
  const holder = $('landing-3d')
  holder.append(engine.canvas)
  engine.setStory([demo[0]], nebula(N, authors({ sequence: new Uint16Array([0, 1]) }, N)))
  landingT = 0
  landingOn = true
  lastNow = performance.now()
  requestAnimationFrame(landingFrame)
}

function landingFrame(now) {
  if (!landingOn) return
  requestAnimationFrame(landingFrame)
  const dt = Math.min((now - lastNow) / 1000, 0.1)
  lastNow = now
  landingT += dt
  const w = innerWidth
  const h = innerHeight
  engine.resize(w, h, Math.min(devicePixelRatio || 1, 1.5))
  // wide screens: the helix stands to the right of the words
  engine.shiftX = w / h > 1.1 ? 1.9 : 0
  // phones: further back and higher, a glow behind the words rather than a wall
  engine.zoom = w / h > 1.1 ? 1 : 1.5
  engine.render(0, landingT, landingT)
}

function error(message) {
  note.textContent = message
  note.classList.add('is-error')
}

// "WhatsApp Chat with Nadia.txt", "Chat WhatsApp dengan Liburan.zip", "WhatsApp Chat - Nadia.zip"
function titleFrom(filename) {
  return (
    filename
      .replace(/\.(txt|zip)$/i, '')
      .replace(/^(whatsapp chat (with|-)|chat whatsapp (dengan|-))\s*/i, '')
      .trim() || null
  )
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

async function open(text, title) {
  const parsed = parseWhatsApp(text)
  if (parsed.people.length < 2) throw new Error('Chat ini cuma berisi satu orang. Coba chat dengan orang lain atau grup.')
  if (parsed.messages.length < 30) throw new Error('Chat-nya terlalu pendek untuk diceritain. Coba chat yang lebih panjang.')
  const stats = computeStats(parsed, { title: parsed.people.length > 2 ? title : null })
  await fontsReady
  show(text === demoText && demo ? demo : makeStory(stats, N))
}

function fitEngine() {
  // the 3D renders at the frame's real pixel size (at most 1080 wide); words are always 1080
  const r = $('story-frame').getBoundingClientRect()
  const w = Math.min(1080, Math.round(r.width * Math.min(devicePixelRatio || 1, 2)))
  engine.resize(w, Math.round((w * 16) / 9), 1)
}

function show(slides) {
  // the particles fly out of whatever the landing page was showing
  const from = engine.slides[0]?.shape
  landingOn = false
  player?.destroy()
  landing.hidden = true
  storyView.hidden = false
  document.body.classList.add('is-story')
  engine.shiftX = 0
  engine.zoom = 1
  engine.setStory(slides, from ?? nebula(N, authors({ sequence: new Uint16Array([0]) }, N)))
  story = { engine, slides }
  fitEngine()
  player = new Player({ canvas: $('story-canvas'), bars: $('bars'), story })
  $('save-video').hidden = !canMakeVideo()
  scrollTo(0, 0)
}

function back() {
  player?.destroy()
  player = null
  story = null
  storyView.hidden = true
  landing.hidden = false
  document.body.classList.remove('is-story')
  fileInput.value = ''
  startLanding()
}

async function handle(file) {
  if (!file) return
  note.classList.remove('is-error')
  note.textContent = 'Membaca chat…'
  try {
    await open(await readChat(file), titleFrom(file.name))
    note.textContent = ''
  } catch (err) {
    console.error(err)
    error(err instanceof ChatFormatError ? 'Ini bukan file export chat WhatsApp. Pilih file .txt atau .zip hasil "Ekspor chat".' : err.message)
  }
}

fileInput.addEventListener('change', () => handle(fileInput.files[0]))
$('pick').addEventListener('click', () => fileInput.click())
$('demo').addEventListener('click', () => open(demoText, null))
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
startLanding()

// — the story —
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

if (import.meta.env.DEV) window.__cw = { get player() { return player }, get story() { return story }, engine, open, demoText, storyVideo, slideImage, skip: (t) => (landingT = t) }
