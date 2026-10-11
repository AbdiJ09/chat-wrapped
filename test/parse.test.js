import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseWhatsApp, ChatFormatError } from '../src/parse/whatsapp.js'
import { demoMessages, formatExport } from '../src/demo.js'

const msgs = demoMessages({ days: 60 })
const minute = (t) => Math.floor(t / 60000)

for (const style of ['android-id', 'android-en', 'ios-id', 'ios-en']) {
  test(`round-trips a ${style} export`, () => {
    const { messages, people, format } = parseWhatsApp(formatExport(msgs, style))
    assert.equal(messages.length, msgs.length, 'every message, no system notice')
    assert.deepEqual(new Set(people), new Set(['Raka', 'Nadia']))
    assert.equal(format.ios, style.startsWith('ios'))
    for (let i = 0; i < msgs.length; i++) {
      const a = msgs[i]
      const b = messages[i]
      assert.equal(b.author, a.author, `author #${i}`)
      assert.equal(minute(b.t), minute(a.t), `time #${i} (${new Date(a.t).toString()} vs ${new Date(b.t).toString()})`)
      assert.equal(b.kind, a.kind, `kind #${i}: ${JSON.stringify(a.text)}`)
      if (a.kind === 'text') assert.equal(b.text, a.text.trim(), `text #${i}`)
    }
  })
}

test('day/month order comes from the numbers', () => {
  const us = parseWhatsApp('1/2/24, 9:00 PM - A: x\n1/13/24, 9:01 PM - B: y\n')
  assert.equal(us.format.order, 'mdy')
  assert.equal(new Date(us.messages[1].t).getDate(), 13)
  const id = parseWhatsApp('13/01/24 21.00 - A: x\n')
  assert.equal(id.format.order, 'dmy')
  assert.equal(new Date(id.messages[0].t).getMonth(), 0)
  const iso = parseWhatsApp('2024-01-13 21:00 - A: x\n')
  assert.equal(new Date(iso.messages[0].t).getDate(), 13)
})

test('12 AM / 12 PM', () => {
  const { messages } = parseWhatsApp('1/2/24, 12:05 AM - A: x\n1/2/24, 12:05 PM - A: y\n')
  assert.equal(new Date(messages[0].t).getHours(), 0)
  assert.equal(new Date(messages[1].t).getHours(), 12)
})

test('multi-line messages and lines that start with a date', () => {
  const text = '12/10/24 21.30 - A: baris satu\nbaris dua\n12/10/24 itu tanggal jadian\n12/10/24 21.31 - B: ok\n'
  const { messages } = parseWhatsApp(text)
  assert.equal(messages.length, 2)
  assert.equal(messages[0].text, 'baris satu\nbaris dua\n12/10/24 itu tanggal jadian')
})

test('group system notices are skipped, names with spaces kept', () => {
  const text = [
    '12/10/24 21.30 - Raka membuat grup "Liburan"',
    '12/10/24 21.30 - Raka menambahkan Nadia',
    '12/10/24 21.31 - Nadia Putri Aulia: halo semua',
    '12/10/24 21.32 - +62 812-3456-7890: hai',
    '[12/10/24 21.33.00] Liburan: ‎Raka menambahkan Budi',
  ].join('\n')
  const { messages, people } = parseWhatsApp(text)
  assert.deepEqual(messages.map((m) => m.author), ['Nadia Putri Aulia', '+62 812-3456-7890'])
  assert.equal(people.length, 2)
})

test('edited and attached media', () => {
  const text = '[12/10/24 21.30.00] A: halo <Pesan ini diedit>\n[12/10/24 21.31.00] B: ‎<lampiran: 00000012-PHOTO-2024-10-12-21-31-00.jpg>\n'
  const { messages } = parseWhatsApp(text)
  assert.equal(messages[0].text, 'halo')
  assert.equal(messages[0].edited, true)
  assert.equal(messages[1].kind, 'media')
})

test('not a chat', () => {
  assert.throws(() => parseWhatsApp('hello world\nthis is a note'), ChatFormatError)
})

test('messages pasted into a message stay part of it', () => {
  // copied in WhatsApp and pasted: written differently from the export's own lines
  const android = parseWhatsApp([
    '10/10/24 21.30 - Hari: liat deh',
    '[09/10/24 20.11] Dinda: ini portopolionya',
    '[09/10/24 20.12] Dinda: tolong ya',
    '10/10/24 21.31 - Uraaatu: oke',
    '10/10/24 21.32 - Hari: makasih',
  ].join('\n'))
  assert.deepEqual(android.people, ['Hari', 'Uraaatu'])
  assert.equal(android.messages.length, 3)
  assert.match(android.messages[0].text, /Dinda: tolong ya$/)
  // pasted from another export, the same way of writing, but from before
  const ios = parseWhatsApp([
    '[10/10/24 21.30.05] Hari: liat deh',
    '[09/10/24 20.11.40] Dinda: ini portopolionya',
    '[10/10/24 21.31.10] Uraaatu: oke',
    '[10/10/24 21.32.00] Hari: makasih',
  ].join('\n'))
  assert.deepEqual(ios.people, ['Hari', 'Uraaatu'])
  assert.equal(ios.messages.length, 3)
})
