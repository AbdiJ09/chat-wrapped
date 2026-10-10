import { ExtrudeGeometry, Shape } from 'three'

// The one object everything is made of: a chat bubble. Its tail sits bottom right (a sent
// message); seen from the back it's mirrored, tail bottom left (a received one).

export function bubbleShape(w, h, r, tailRight) {
  const tail = w * 0.106
  const s = new Shape()
  const x0 = -w / 2
  const y0 = -h / 2
  s.moveTo(x0 + r, y0)
  if (!tailRight) {
    // the tail, bottom left
    s.lineTo(x0 - tail, y0 - tail / 3)
    s.quadraticCurveTo(x0 + tail / 9, y0 + tail / 9, x0, y0 + r * 0.6)
  } else s.quadraticCurveTo(x0, y0, x0, y0 + r)
  s.lineTo(x0, y0 + h - r)
  s.quadraticCurveTo(x0, y0 + h, x0 + r, y0 + h)
  s.lineTo(x0 + w - r, y0 + h)
  s.quadraticCurveTo(x0 + w, y0 + h, x0 + w, y0 + h - r)
  if (tailRight) {
    s.lineTo(x0 + w, y0 + r * 0.6)
    s.quadraticCurveTo(x0 + w - tail / 9, y0 + tail / 9, x0 + w + tail, y0 - tail / 3)
    s.lineTo(x0 + w - r, y0)
  } else {
    s.lineTo(x0 + w, y0 + r)
    s.quadraticCurveTo(x0 + w, y0, x0 + w - r, y0)
  }
  s.lineTo(x0 + r, y0)
  return s
}

/** A bubble 1 unit wide, BUBBLE_DEPTH thick, centred on the origin, facing +z. */
export const BUBBLE_DEPTH = 0.18
export function bubbleGeometry({ detail = 1 } = {}) {
  const g = new ExtrudeGeometry(bubbleShape(0.9, 0.56, 0.2, true), {
    depth: BUBBLE_DEPTH - 0.1,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: detail > 0.6 ? 3 : 2,
    curveSegments: Math.round(4 + 4 * detail),
  })
  g.center()
  return g
}
