import { inflateSync } from 'fflate'

// Reads a .zip by its table of contents (the central directory at the end), so an export "with media"
// of a few GB never has to sit in memory: only the files we ask for are sliced out of the Blob.
// Handles zip64 (huge exports, more than 65,535 files).

const EOCD = 0x06054b50
const EOCD64 = 0x06064b50
const LOCATOR64 = 0x07064b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50
const MAX32 = 0xffffffff

export class ZipError extends Error {}

const bytes = async (blob, from, to) => new DataView(await blob.slice(from, to).arrayBuffer())
const u64 = (v, at) => Number(v.getBigUint64(at, true))

/**
 * @param {Blob} blob
 * @returns {Promise<{ entries: { name: string, size: number, csize: number, method: number, offset: number }[],
 *                     read: (entry) => Promise<Uint8Array> }>}
 */
export async function openZip(blob) {
  // the end record sits in the last 22 bytes, plus a comment of up to 64 KB
  const tailFrom = Math.max(0, blob.size - 22 - 0xffff)
  const tail = await bytes(blob, tailFrom, blob.size)
  let end = -1
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD) {
      end = i
      break
    }
  }
  if (end < 0) throw new ZipError('not a zip')

  let count = tail.getUint16(end + 10, true)
  let cdSize = tail.getUint32(end + 12, true)
  let cdOffset = tail.getUint32(end + 16, true)

  if (count === 0xffff || cdSize === MAX32 || cdOffset === MAX32) {
    const at = end - 20
    if (at < 0 || tail.getUint32(at, true) !== LOCATOR64) throw new ZipError('broken zip64')
    const recAt = u64(tail, at + 8)
    const rec = await bytes(blob, recAt, recAt + 56)
    if (rec.getUint32(0, true) !== EOCD64) throw new ZipError('broken zip64')
    count = u64(rec, 32)
    cdSize = u64(rec, 40)
    cdOffset = u64(rec, 48)
  }

  const cd = await bytes(blob, cdOffset, cdOffset + cdSize)
  const utf8 = new TextDecoder()
  const entries = []
  let p = 0
  for (let k = 0; k < count && p + 46 <= cd.byteLength; k++) {
    if (cd.getUint32(p, true) !== CENTRAL) throw new ZipError('broken directory')
    const method = cd.getUint16(p + 10, true)
    let csize = cd.getUint32(p + 20, true)
    let size = cd.getUint32(p + 24, true)
    const nameLen = cd.getUint16(p + 28, true)
    const extraLen = cd.getUint16(p + 30, true)
    const commentLen = cd.getUint16(p + 32, true)
    let offset = cd.getUint32(p + 42, true)
    const name = utf8.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen))

    // zip64 extra field: only the values that overflowed are there, in this order
    if (size === MAX32 || csize === MAX32 || offset === MAX32) {
      let e = p + 46 + nameLen
      const stop = e + extraLen
      while (e + 4 <= stop) {
        const id = cd.getUint16(e, true)
        const len = cd.getUint16(e + 2, true)
        if (id === 0x0001) {
          let q = e + 4
          if (size === MAX32) (size = u64(cd, q)), (q += 8)
          if (csize === MAX32) (csize = u64(cd, q)), (q += 8)
          if (offset === MAX32) offset = u64(cd, q)
          break
        }
        e += 4 + len
      }
    }

    if (!name.endsWith('/')) entries.push({ name, size, csize, method, offset })
    p += 46 + nameLen + extraLen + commentLen
  }

  async function read(entry) {
    const head = await bytes(blob, entry.offset, entry.offset + 30)
    if (head.getUint32(0, true) !== LOCAL) throw new ZipError('broken entry')
    const from = entry.offset + 30 + head.getUint16(26, true) + head.getUint16(28, true)
    const data = new Uint8Array(await blob.slice(from, from + entry.csize).arrayBuffer())
    if (entry.method === 0) return data
    if (entry.method === 8) return inflateSync(data, { out: new Uint8Array(entry.size) })
    throw new ZipError(`unsupported compression ${entry.method}`)
  }

  // just a part of a file — without reading the rest when it's stored as is (media always is)
  async function slice(entry, from, to) {
    if (entry.method !== 0) return (await read(entry)).subarray(from, to)
    const head = await bytes(blob, entry.offset, entry.offset + 30)
    const at = entry.offset + 30 + head.getUint16(26, true) + head.getUint16(28, true)
    return new Uint8Array(await blob.slice(at + from, at + Math.min(to, entry.csize)).arrayBuffer())
  }

  return { entries, read, slice }
}
