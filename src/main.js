import { unzipSync, zipSync } from 'fflate'
import { parseWhatsApp, ChatFormatError } from './parse/whatsapp.js'
import { computeStats } from './stats.js'
import { makeStory } from './story/slides.js'
import { Player, slideImage } from './player.js'
import { demoMessages, formatExport } from './demo.js'

// Everything happens on this page: the chat is read, counted and drawn in the browser, and
// never sent anywhere.

const $ = (id) => document.getElementById(id)
const landing = $('landing')
const story = $('story')
const fileInput = $('file')
const note = $('note')
let player = null
let preview = null

const fontsReady = Promise.all([
  document.fonts.load('300 100px "Fraunces"'),
  document.fonts.load('italic 300 100px "Fraunces"'),
  document.fonts.load('400 40px "Inter"'),
  document.fonts.load('500 40px "Inter"'),
]).catch(() => {})

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
  show(makeStory(stats))
}

function show(slides) {
  preview?.destroy()
  player?.destroy()
  landing.hidden = true
  story.hidden = false
  document.body.classList.add('is-story')
  player = new Player({ canvas: $('story-canvas'), bars: $('bars'), slides })
  scrollTo(0, 0)
}

function back() {
  player?.destroy()
  player = null
  story.hidden = true
  landing.hidden = false
  document.body.classList.remove('is-story')
  fileInput.value = ''
  startPreview()
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

// — the landing page —
fileInput.addEventListener('change', () => handle(fileInput.files[0]))
$('pick').addEventListener('click', () => fileInput.click())
$('demo').addEventListener('click', async () => {
  await fontsReady
  open(formatExport(demoMessages(), 'android-id'), null)
})
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
  if (!story.hidden) return
  handle(e.dataTransfer.files[0])
})

// the example story plays on a little phone next to the headline
async function startPreview() {
  await fontsReady
  const parsed = parseWhatsApp(formatExport(demoMessages(), 'android-id'))
  preview = new Player({ canvas: $('preview-canvas'), bars: $('preview-bars'), slides: makeStory(computeStats(parsed)), loop: true })
}
startPreview()

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
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
const pad = (n) => String(n).padStart(2, '0')

$('save').addEventListener('click', async () => {
  if (!player) return
  const blob = await slideImage(player.slide)
  const file = new File([blob], `chat-wrapped-${pad(player.i + 1)}.png`, { type: 'image/png' })
  // on phones, straight to the share sheet (Instagram, WhatsApp, Photos)
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (err) {
      if (err.name === 'AbortError') return
    }
  }
  download(blob, file.name)
})
$('save-all').addEventListener('click', async () => {
  if (!player) return
  const button = $('save-all')
  button.disabled = true
  button.textContent = 'Menyiapkan…'
  const files = {}
  for (let i = 0; i < player.slides.length; i++) {
    const blob = await slideImage(player.slides[i])
    files[`chat-wrapped-${pad(i + 1)}.png`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]
  }
  download(new Blob([zipSync(files)], { type: 'application/zip' }), 'chat-wrapped.zip')
  button.disabled = false
  button.textContent = 'Simpan semua'
})
$('again').addEventListener('click', back)

if (import.meta.env.DEV) window.__cw = { get player() { return player }, open, demo: () => formatExport(demoMessages(), 'android-id') }
