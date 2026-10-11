import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseWhatsApp } from '../src/parse/whatsapp.js'
import { computeStats } from '../src/stats.js'

const chat = (lines) => computeStats(parseWhatsApp(lines.map(([who, text], i) => `[10/10/26 ${String(10 + Math.floor(i / 60)).padStart(2, '0')}.${String(i % 60).padStart(2, '0')}.00] ${who}: ${text}`).join('\n')))
const person = (S, name) => S.people.find((p) => p.name === name)

test('a stretched word is the word: "akuu" is "aku" (left out), "sayangg" counts as "sayang"', () => {
  const S = chat([...Array(10)].flatMap(() => [['Raka', 'akuu kangen sayangg'], ['Nadia', 'okayy sayang']]))
  const words = person(S, 'Raka').topWords.map(([w]) => w)
  assert.ok(!words.includes('akuu'))
  assert.ok(!person(S, 'Nadia').topWords.some(([w]) => w === 'okayy'))
  assert.equal(person(S, 'Raka').topWords.find(([w]) => w.startsWith('sayang'))?.[1], 10)
})

test('what you call each other: a pet name, or their name', () => {
  const S = chat([...Array(8)].flatMap(() => [['Raka', 'iya sayangg'], ['Nadia', 'rakaa lagi apa']]))
  assert.deepEqual(person(S, 'Raka').calls, ['sayangg', 8])
  assert.deepEqual(person(S, 'Nadia').calls, ['rakaa', 8])
})

test('words only one of you says', () => {
  const S = chat([...Array(8)].flatMap(() => [['Raka', 'gemesin banget kamu'], ['Nadia', 'sayangku kangen']]))
  assert.equal(person(S, 'Raka').signatures[0].word, 'gemesin')
  assert.equal(person(S, 'Nadia').signatures[0].share, 1)
})
