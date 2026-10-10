// Vibes. A couple's chat and the office group shouldn't feel the same: each theme has its own
// colours (people, background, light), its own voice in the copy, and a few 3D forms of its own.
// Colours are sRGB hex; the 3D converts them.

export const THEMES = {
  couple: {
    id: 'couple',
    name: 'Pasangan',
    emoji: '💞',
    blurb: 'Buat kamu & dia',
    people: ['#ff5d8f', '#ffb18a'],
    bg: '#14060d',
    glow: '#4a1630',
    accent: '#ff5d8f',
    ink: '#fff1f4',
  },
  bestie: {
    id: 'bestie',
    name: 'Bestie',
    emoji: '🫶',
    blurb: 'Berdua, tapi bukan pacaran',
    people: ['#c8ff3d', '#5b8cff'],
    bg: '#05080f',
    glow: '#14254a',
    accent: '#c8ff3d',
    ink: '#f2f6ff',
  },
  squad: {
    id: 'squad',
    name: 'Geng',
    emoji: '🔥',
    blurb: 'Grup temen yang nggak pernah sepi',
    people: ['#c8ff3d', '#ff7a2f', '#9a6bff', '#33d1ff', '#ff5d8f', '#ffd23f', '#5effb0', '#ff9be0'],
    bg: '#070707',
    glow: '#22180f',
    accent: '#ff7a2f',
    ink: '#f7f5f0',
  },
  family: {
    id: 'family',
    name: 'Keluarga',
    emoji: '🏡',
    blurb: 'Grup keluarga, papa mama, kakak adik',
    people: ['#ffb547', '#8fd6a8', '#f2836b', '#9cc8ff', '#e7c4ff', '#ffe08a', '#7fd1c7', '#ffaf8f'],
    bg: '#070d0a',
    glow: '#1a2e22',
    accent: '#ffb547',
    ink: '#f6f3ea',
  },
  work: {
    id: 'work',
    name: 'Kantor',
    emoji: '💼',
    blurb: 'Grup kerjaan. Noted.',
    people: ['#39d0ff', '#e8eef5', '#7a8cff', '#5effd1', '#b8c4d6', '#3d7bff', '#9ff0ff', '#c9d2ff'],
    bg: '#060a10',
    glow: '#10233a',
    accent: '#39d0ff',
    ink: '#eef3f9',
  },
}
export const THEME_LIST = Object.values(THEMES)

// words that give a chat away (counted over everyone's top words and the whole text)
const HINTS = {
  couple: /\b(sayang|syg|sayangku|beb|bebeb|baby|babe|love|lop|cinta|kangen|kangenn|ayang|ayangku|muach|mwah|cium|peluk|honey|darling)\b/gi,
  family: /\b(mama|mamah|mami|papa|papah|papi|ayah|bunda|ibu|bapak|nak|ade|adek|kakak|kak|om|tante|nenek|kakek|eyang|opa|oma|pakde|bude|lebaran|arisan)\b/gi,
  work: /\b(meeting|rapat|deadline|noted|pak|bu|bapak|ibu|klien|client|laporan|report|project|proyek|invoice|zoom|jadwal|approve|revisi|tim|team|kantor|absen)\b/gi,
}

/** A best guess at what kind of chat this is. */
export function detectTheme(stats, text) {
  const sample = text.length > 400000 ? text.slice(-400000) : text
  const messages = Math.max(1, (stats.total * sample.length) / text.length)
  const count = (re) => (sample.match(re) ?? []).length / messages
  const couple = count(HINTS.couple)
  const family = count(HINTS.family)
  const work = count(HINTS.work)
  if (!stats.group) return couple > 0.04 ? 'couple' : 'bestie'
  if (work > 0.05 && work > family) return 'work'
  if (family > 0.04) return 'family'
  return 'squad'
}

/** Linear RGB triplets for the 3D. */
export function linear(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
}
