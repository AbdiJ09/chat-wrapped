import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zipSync, strToU8 } from 'fflate'
import { openZip } from '../src/parse/zip.js'

test('reads only the entries asked for, stored or deflated', async () => {
  const chat = 'x'.repeat(5000)
  const zip = zipSync({
    '_chat.txt': strToU8(chat),
    '00000001-PHOTO-2026-09-15-09-06-00.jpg': [new Uint8Array([1, 2, 3]), { level: 0 }],
    'folder/': new Uint8Array(0),
  })
  const { entries, read } = await openZip(new Blob([zip]))
  assert.deepEqual(entries.map((e) => e.name).sort(), ['00000001-PHOTO-2026-09-15-09-06-00.jpg', '_chat.txt'])
  const txt = entries.find((e) => e.name === '_chat.txt')
  assert.equal(new TextDecoder().decode(await read(txt)), chat)
  assert.deepEqual([...(await read(entries.find((e) => e.method === 0)))], [1, 2, 3])
})

test('not a zip', async () => {
  await assert.rejects(openZip(new Blob(['hello'])))
})

test('a part of a stored file, without reading the rest', async () => {
  const data = new Uint8Array(1000).map((_, i) => i % 256)
  const zip = zipSync({ 'a.opus': [data, { level: 0 }], 'b.txt': strToU8('y'.repeat(3000)) })
  const { entries, slice } = await openZip(new Blob([zip]))
  const a = entries.find((e) => e.name === 'a.opus')
  assert.deepEqual([...(await slice(a, 990, 1000))], [...data.subarray(990)])
  const b = entries.find((e) => e.name === 'b.txt')
  assert.equal(new TextDecoder().decode(await slice(b, 0, 3)), 'yyy')
})
