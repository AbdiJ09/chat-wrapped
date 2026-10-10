import {
  ACESFilmicToneMapping,
  BoxGeometry,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Fog,
  InstancedMesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Shape,
  Vector2,
  WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

// The landing page: you're flying down a tunnel of chat bubbles — glossy, iridescent, every one
// with its lines of "text" — sent ones in the theme's colour, received ones in glass. The tunnel
// bends towards the cursor, bubbles near it get pushed aside, and it can warp (speed up) on cue.

function bubbleShape(w, h, r, tailRight) {
  const s = new Shape()
  const x0 = -w / 2
  const y0 = -h / 2
  s.moveTo(x0 + r, y0)
  if (!tailRight) {
    // the tail, bottom left
    s.lineTo(x0 - 0.18, y0 - 0.06)
    s.quadraticCurveTo(x0 + 0.02, y0 + 0.02, x0, y0 + r * 0.6)
  } else s.quadraticCurveTo(x0, y0, x0, y0 + r)
  s.lineTo(x0, y0 + h - r)
  s.quadraticCurveTo(x0, y0 + h, x0 + r, y0 + h)
  s.lineTo(x0 + w - r, y0 + h)
  s.quadraticCurveTo(x0 + w, y0 + h, x0 + w, y0 + h - r)
  if (tailRight) {
    s.lineTo(x0 + w, y0 + r * 0.6)
    s.quadraticCurveTo(x0 + w - 0.02, y0 + 0.02, x0 + w + 0.18, y0 - 0.06)
    s.lineTo(x0 + w - r, y0)
  } else {
    s.lineTo(x0 + w, y0 + r)
    s.quadraticCurveTo(x0 + w, y0, x0 + w - r, y0)
  }
  s.lineTo(x0 + r, y0)
  return s
}

const LINES = 3 // text lines per bubble

export class Tunnel {
  constructor(canvas, { count = 700, theme }) {
    this.canvas = canvas
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.72
    this.scene = new Scene()
    this.camera = new PerspectiveCamera(55, 1, 0.1, 120)
    this.camera.position.set(0, 0, 8)

    const pmrem = new PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.key = new DirectionalLight(0xffffff, 1.1)
    this.key.position.set(3, 5, 6)
    this.scene.add(this.key)

    // two kinds of bubble: sent (tail right, coloured) and received (tail left, glass)
    const extrude = { depth: 0.12, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 4, curveSegments: 10 }
    const geoSent = new ExtrudeGeometry(bubbleShape(1.7, 0.86, 0.36, true), extrude)
    const geoGot = new ExtrudeGeometry(bubbleShape(1.7, 0.86, 0.36, false), extrude)
    for (const g of [geoSent, geoGot]) g.center()
    this.count = count
    const half = Math.ceil(count / 2)
    this.sent = new InstancedMesh(
      geoSent,
      new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.22, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 0.5, iridescenceIOR: 1.4, envMapIntensity: 0.55 }),
      half,
    )
    this.got = new InstancedMesh(
      geoGot,
      new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 600], envMapIntensity: 0.8, transparent: true, opacity: 0.4 }),
      count - half,
    )
    // the lines of "text" on each bubble
    this.lines = new InstancedMesh(new BoxGeometry(1, 0.085, 0.04), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0.35 }), count * LINES)
    for (const m of [this.sent, this.got, this.lines]) {
      m.frustumCulled = false
      this.scene.add(m)
    }

    // every bubble's place in the tunnel
    this.items = Array.from({ length: count }, (_, i) => ({
      sent: i < half,
      index: i < half ? i : i - half,
      angle: Math.random() * Math.PI * 2,
      radius: 3.4 + Math.random() * 5,
      z: -110 * Math.random() + 8,
      spin: (Math.random() - 0.5) * 0.6,
      tilt: (Math.random() - 0.5) * 0.5,
      scale: 0.7 + Math.random() * 0.7,
      lines: [0.82, 0.62 + Math.random() * 0.2, 0.25 + Math.random() * 0.4],
      push: new Vector2(),
    }))
    this.dummy = new Object3D()
    this.lineDummy = new Object3D()

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new Vector2(256, 256), 0.15, 0.4, 0.92)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())

    this.mouse = { x: 0, y: 0, tx: 0, ty: 0, on: false }
    this.speed = 7
    this.warp = 0 // 0 cruising … 1 hyperspace
    this.time = 0
    this.colors = { sent: [new Color(), new Color()], got: new Color(), bg: new Color(), fog: new Color() }
    this.scene.fog = new Fog(0x000000, 8, 58)
    this.setTheme(theme, true)
    this.onMove = (e) => {
      this.mouse.tx = (e.clientX / innerWidth) * 2 - 1
      this.mouse.ty = -((e.clientY / innerHeight) * 2 - 1)
      this.mouse.on = true
    }
    addEventListener('pointermove', this.onMove)
  }

  /** Recolour everything (smoothly, unless now). */
  setTheme(theme, now = false) {
    this.target = {
      a: new Color(theme.people[0]),
      b: new Color(theme.people[1]),
      bg: new Color(theme.bg),
      glow: new Color(theme.glow),
    }
    // deepen the theme colours a little: a neon hue under lights blows out
    const bg = this.target.bg
    this.target.a.lerp(bg, 0.4)
    this.target.b.lerp(bg, 0.4)
    if (now) {
      this.colors.sent[0].copy(this.target.a)
      this.colors.sent[1].copy(this.target.b)
      this.colors.bg.copy(this.target.bg)
      this.colors.fog.copy(this.target.glow)
    }
  }

  resize(w, h, pr) {
    if (w === this.w && h === this.h) return
    this.w = w
    this.h = h
    this.renderer.setPixelRatio(pr)
    this.renderer.setSize(w, h, false)
    this.composer.setPixelRatio(pr)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    // narrow screens: a wider lens so the tunnel still wraps around the words
    this.camera.fov = w / h < 0.8 ? 75 : 55
    this.camera.updateProjectionMatrix()
  }

  update(dt) {
    this.time += dt
    const m = this.mouse
    const k = 1 - Math.exp(-dt * 3)
    m.x += (m.tx - m.x) * k
    m.y += (m.ty - m.y) * k
    // colours drift to the theme
    const c = 1 - Math.exp(-dt * 4)
    this.colors.sent[0].lerp(this.target.a, c)
    this.colors.sent[1].lerp(this.target.b, c)
    this.colors.bg.lerp(this.target.bg, c)
    this.colors.fog.lerp(this.target.glow, c)
    this.scene.background = this.colors.bg
    this.scene.fog.color.copy(this.colors.bg) // far bubbles sink into the dark
    this.key.color.copy(this.colors.sent[0]).lerp(new Color(1, 1, 1), 0.6)

    const speed = this.speed * (1 + this.warp * 9)
    const d = this.dummy
    const L = this.lineDummy
    // the cursor in world units at the bubbles' usual depth
    const px = m.x * 6 * this.camera.aspect
    const py = m.y * 6
    for (const it of this.items) {
      it.z += speed * dt
      // recycled before it reaches the lens (a bubble filling the screen is just a blur)
      if (it.z > 3.5) {
        it.z -= 110
        it.angle = Math.random() * Math.PI * 2
      }
      // the tunnel bends towards where you look, more the further away
      const bend = (8 - it.z) / 100
      const a = it.angle + it.z * 0.025 + this.time * 0.05
      // a funnel, wider further away, so the middle (where the words are) stays open
      const rad = it.radius + (8 - it.z) * 0.18
      let x = Math.cos(a) * rad + m.x * 14 * bend * bend * 3
      let y = Math.sin(a) * rad * 0.8 + m.y * 9 * bend * bend * 3
      // near ones get nudged away from the cursor
      if (it.z > -6) {
        const dx = x - px
        const dy = y - py
        const dist = Math.hypot(dx, dy) || 1
        const f = m.on ? Math.max(0, 1 - dist / 3.5) : 0
        it.push.x += ((dx / dist) * f * 2.2 - it.push.x) * k
        it.push.y += ((dy / dist) * f * 2.2 - it.push.y) * k
      } else it.push.multiplyScalar(1 - k)
      x += it.push.x
      y += it.push.y
      // stretched along the flight when warping
      const s = it.scale * Math.min(1, (it.z + 110) / 20)
      d.position.set(x, y, it.z)
      d.rotation.set(it.tilt + Math.sin(this.time * 0.6 + it.angle) * 0.15, (it.sent ? -1 : 1) * 0.25 + Math.sin(this.time * 0.4 + it.radius) * it.spin, Math.sin(this.time * 0.3 + it.z * 0.1) * 0.08)
      d.scale.set(s, s, s * (1 + this.warp * 6))
      d.updateMatrix()
      const mesh = it.sent ? this.sent : this.got
      mesh.setMatrixAt(it.index, d.matrix)
      if (it.sent) mesh.setColorAt(it.index, it.index % 3 === 0 ? this.colors.sent[1] : this.colors.sent[0])
      else mesh.setColorAt(it.index, this.colors.got.setRGB(0.7, 0.72, 0.78))
      // three lines of text across the face
      const base = (it.sent ? it.index : it.index + this.sent.count) * LINES
      for (let l = 0; l < LINES; l++) {
        const w = it.lines[l] * 1.25
        L.position.set(-0.62 + w / 2, 0.22 - l * 0.22, 0.14)
        L.scale.set(w, 1, 1)
        L.rotation.set(0, 0, 0)
        L.updateMatrix()
        L.matrix.premultiply(d.matrix)
        this.lines.setMatrixAt(base + l, L.matrix)
      }
    }
    for (const mesh of [this.sent, this.got, this.lines]) mesh.instanceMatrix.needsUpdate = true
    this.sent.instanceColor.needsUpdate = true
    this.got.instanceColor.needsUpdate = true

    // the camera sways with the cursor and rolls a touch in a warp
    this.camera.position.x = m.x * 0.8
    this.camera.position.y = m.y * 0.5
    this.camera.lookAt(m.x * 2.5, m.y * 1.6, -20)
    this.camera.rotation.z += Math.sin(this.time * 0.2) * 0.02 + this.warp * 0.15
    this.composer.render()
  }

  dispose() {
    removeEventListener('pointermove', this.onMove)
    this.composer.dispose()
    this.renderer.dispose()
  }
}
