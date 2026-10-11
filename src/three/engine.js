import {
  CanvasTexture,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  RingGeometry,
  MeshBasicMaterial,
  AdditiveBlending,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SpotLight,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { bubbleGeometry } from './bubble.js'
import { rng } from './shapes.js'

// The 3D stage behind the story: a dark studio with a glossy floor and a spotlight, and in it a
// few thousand real chat bubbles, one per slice of the chat. At each slide every bubble lifts off
// from the last sculpture and flies, tumbling, into its place in the next one, staggered, so the
// change reads as the chat rebuilding itself. The camera glides between the slides' viewpoints.
// Everything is a pure function of (slide, time), so a video can be rendered frame by frame and
// look exactly like playback.

export const MORPH = 1.7 // seconds a bubble's flight takes (plus up to 0.6 s of stagger)

// the backdrop: a deep colour with a soft light behind the middle (drawn in the scene, so it goes
// through the same colour pipeline as everything else)
const bgVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }
`
const bgFrag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uGlow;
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - vec2(0.5, 0.62)) * vec2(uAspect, 1.0);
  float g = exp(-dot(p, p) * 3.0);
  gl_FragColor = vec4(uColor + uGlow * g, 1.0);
}
`

// a soft vignette, and on a change of slide a light zoom blur
const LensShader = {
  uniforms: { tDiffuse: { value: null }, uKick: { value: 0 }, uAspect: { value: 9 / 16 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uKick;
    uniform float uAspect;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      vec3 col;
      if (uKick < 0.002) col = texture2D(tDiffuse, vUv).rgb;
      else {
        col = vec3(0.0);
        for (int i = 0; i < 8; i++) col += texture2D(tDiffuse, 0.5 + c * (1.0 - uKick * 0.04 * float(i) / 7.0)).rgb;
        col /= 8.0;
      }
      float v = smoothstep(1.0, 0.3, length(c * vec2(uAspect, 1.0)));
      gl_FragColor = vec4(col * mix(0.62, 1.0, v), 1.0);
    }
  `,
}

const lin = (c) => (c.isColor ? c : new Color(c)) // three converts sRGB hex to its linear working space
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
const clamp01 = (x) => Math.min(1, Math.max(0, x))
const UP = new Vector3(0, 1, 0)
const MIDDLE = 1.5 // the height things gather round and blast out from

// the floor's fade: see-through (so the reflection shows) under the sculpture, solid far away
function fadeTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  grad.addColorStop(0, '#9a9a9a')
  grad.addColorStop(0.12, '#b4b4b4')
  grad.addColorStop(0.32, '#ffffff')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  return new CanvasTexture(c)
}

export class Engine {
  constructor({ count = 2400, quality = 1, canvas = document.createElement('canvas') } = {}) {
    this.N = count
    this.quality = quality
    this.canvas = canvas
    const renderer = (this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' }))
    renderer.toneMapping = NeutralToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = PCFSoftShadowMap
    const scene = (this.scene = new Scene())
    this.camera = new PerspectiveCamera(30, 9 / 16, 0.1, 80)
    const pmrem = new PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 0.55
    this.fog = scene.fog = new Fog(0x000000, 9, 26)

    // backdrop
    this.bg = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({ vertexShader: bgVert, fragmentShader: bgFrag, depthWrite: false, uniforms: { uColor: { value: new Color() }, uGlow: { value: new Color() }, uAspect: { value: 9 / 16 } } }),
    )
    this.bg.frustumCulled = false
    this.bg.renderOrder = -1
    scene.add(this.bg)

    // lights: a spot from above in front (it pools on the floor and casts the shadows), a cool
    // fill, and a rim from behind in the slide's own tint
    this.key = new SpotLight(0xfff4ea, 48, 30, 0.36, 1, 1.6)
    this.key.position.set(2.2, 8.5, 5.5)
    this.key.target.position.set(0, 0.6, 0)
    this.key.castShadow = true
    this.key.shadow.mapSize.set(quality > 0.6 ? 2048 : 1024, quality > 0.6 ? 2048 : 1024)
    this.key.shadow.bias = -0.0004
    this.key.shadow.normalBias = 0.02
    this.key.shadow.radius = 4
    scene.add(this.key, this.key.target)
    this.rim = new DirectionalLight(0xffffff, 2.2)
    this.rim.position.set(-3, 4, -6)
    scene.add(this.rim)
    this.hemi = new HemisphereLight(0xffffff, 0x000000, 0.12)
    scene.add(this.hemi)

    // the floor: a mirror, under a dark glaze that thickens away from the middle
    const res = quality > 0.6 ? 1024 : 512
    this.mirror = new Reflector(new PlaneGeometry(60, 60), { textureWidth: res, textureHeight: res, color: 0x8a8a8a, clipBias: 0.002, multisample: quality > 0.6 ? 4 : 0 })
    this.mirror.rotation.x = -Math.PI / 2
    scene.add(this.mirror)
    this.glaze = new Mesh(
      new PlaneGeometry(60, 60),
      new MeshStandardMaterial({ color: 0x000000, roughness: 0.7, metalness: 0, envMapIntensity: 0, transparent: true, alphaMap: fadeTexture(), opacity: 1 }),
    )
    this.glaze.rotation.x = -Math.PI / 2
    this.glaze.position.y = 0.002
    this.glaze.receiveShadow = true
    scene.add(this.glaze)

    // the bubbles
    this.mesh = new InstancedMesh(
      bubbleGeometry({ detail: quality }),
      new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.12, iridescence: 0.25, iridescenceIOR: 1.35, envMapIntensity: 1 }),
      this.N,
    )
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.ring = new Mesh(new RingGeometry(0.94, 1, 128), new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false }))
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.01
    this.ring.visible = false
    scene.add(this.ring)
    this.mesh.frustumCulled = false
    this.mesh.setColorAt(0, new Color())
    scene.add(this.mesh)
    const r = rng(99)
    this.seed = Float32Array.from({ length: this.N * 4 }, r)
    this.dummy = new Object3D()
    this.tint = new Color()
    // where every bubble is right now, for snapshot()
    this.cur = { pos: new Float32Array(this.N * 3), rot: new Float32Array(this.N * 3), scl: new Float32Array(this.N * 3), col: new Float32Array(this.N * 3) }
    this.offset = [0, 0] // shifts the picture, as fractions of the width and height (the landing moves it aside)
    this.zoom = 1 // > 1 pulls the camera back
    // how big a change of sculpture is (the landing makes more of it than the film):
    this.burst = 1 // how far the bubbles scatter in flight
    this.swing = 0 // the camera swings round the middle by this much (radians) on the way…
    this.pull = 0 // …and pulls back by this fraction
    this.shock = false // a ring of light runs across the floor when the bubbles land
    this.flip = null // set by flipTo()
    this.stagger = 0.6 // seconds between the first bubble leaving and the last
    this.curve = 'inout' // 'out': the flight starts at full speed (a bang)
    this.radial = 0 // in flight, thrown this far outwards from the middle
    this.squeeze = 1 // everything drawn in towards (or out from) the middle by this factor
    this.pulse = 0 // 0…1: the music's beat, a kick outwards and a flare of light
    this.lean = null // { x, y } in −1…1: the camera leans with the cursor

    this.composer = new EffectComposer(renderer)
    this.composer.addPass(new RenderPass(scene, this.camera))
    if (quality > 0.6) {
      this.bokeh = new BokehPass(scene, this.camera, { focus: 10, aperture: 0.0016, maxblur: 0.006 })
      this.composer.addPass(this.bokeh)
    }
    this.bloom = new UnrealBloomPass(new Vector2(256, 256), 0.32, 0.5, 0.82)
    this.composer.addPass(this.bloom)
    this.lens = new ShaderPass(LensShader)
    this.composer.addPass(this.lens)
    this.composer.addPass(new OutputPass())

    this.slides = []
    this.size = { w: 0, h: 0 }
  }

  /**
   * slides: [{ shape, cam: {pos:[x,y,z], look:[x,y,z], orbit, speed, dolly}, bg, glow, rim, duration }]
   * start: what the first slide comes out of — a slide of its own (a snapshot()), or just a shape
   */
  setStory(slides, start) {
    this.slides = slides
    this.start = start.shape ? start : { shape: start, duration: 0 }
    this.flip = null
  }

  /**
   * Swap the slide showing now for one with the same sculpture in other colours: instead of
   * flying, the bubbles spin round one after another, left to right, like a stadium wave, and
   * come back round in the new colour.
   */
  flipTo(slide) {
    const u = this.bg.material.uniforms
    this.flip = { col: this.cur.col.slice(), bg: u.uColor.value.clone(), glow: u.uGlow.value.clone(), rim: this.rim.color.clone(), at: this.lastClock }
    // one slide (the one showing), or the whole set of them
    if (Array.isArray(slide)) this.slides = slide
    else this.slides[this.lastI] = slide
  }

  /** Everything as it is right now, as a slide: the next story can fly out of it. */
  snapshot() {
    if (!this.look) {
      // nothing drawn yet (a hidden tab doesn't animate): take the first slide's opening pose
      this.#bubbles(0, 0, 0)
      const c = this.#cam(this.slides[0], 0)
      this.camera.position.copy(c.p)
      this.look = c.look
    }
    const u = this.bg.material.uniforms
    const c = this.cur
    return {
      shape: { pos: c.pos.slice(), rot: c.rot.slice(), scl: c.scl.slice(), col: c.col.slice(), spin: new Float32Array(this.N) },
      cam: { pos: this.camera.position.toArray(), look: this.look.toArray(), orbit: 0, dolly: 0 },
      bg: u.uColor.value.clone(),
      glow: u.uGlow.value.clone(),
      rim: this.rim.color.clone(),
      duration: 0,
    }
  }

  resize(w, h, pixelRatio = 1) {
    if (w === this.size.w && h === this.size.h && pixelRatio === this.size.pr) return
    this.size = { w, h, pr: pixelRatio }
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.setSize(w, h, false)
    this.composer.setPixelRatio(pixelRatio)
    this.composer.setSize(w, h)
    this.bloom.resolution.set((w * pixelRatio) / 2, (h * pixelRatio) / 2)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.bg.material.uniforms.uAspect.value = w / h
    this.lens.uniforms.uAspect.value = w / h
  }

  // every bubble, t seconds into slide i, mt seconds into its flight, at `clock` (for flipTo's wave)
  #bubbles(i, t, mt, clock = t) {
    const to = this.slides[i].shape
    const prev = this.#prev(i)
    const from = prev.shape
    const fromT = prev.duration + t
    const cur = this.cur
    const d = this.dummy
    const c = this.tint
    const S = this.seed
    const flip = this.flip
    const burst = this.burst
    const stagger = this.stagger
    const out = this.curve === 'out'
    const radial = this.radial
    const sq = this.squeeze * (1 + 0.035 * this.pulse)
    for (let k = 0; k < this.N; k++) {
      const k3 = k * 3
      const s0 = S[k * 4]
      const s1 = S[k * 4 + 1]
      const s2 = S[k * 4 + 2]
      const s3 = S[k * 4 + 3]
      const u = clamp01((mt - s0 * stagger) / MORPH)
      const m = out ? 1 - (1 - u) ** 4 : ease(u)
      const fly = Math.sin(Math.PI * m)
      // where it was (still turning with the old sculpture) and where it's going
      const a0 = from.spin[k] * fromT
      const a1 = to.spin[k] * t
      const ax = from.pos[k3]
      const az = from.pos[k3 + 2]
      const bx = to.pos[k3]
      const bz = to.pos[k3 + 2]
      let x = (Math.cos(a0) * ax + Math.sin(a0) * az) * (1 - m) + (Math.cos(a1) * bx + Math.sin(a1) * bz) * m
      let z = (-Math.sin(a0) * ax + Math.cos(a0) * az) * (1 - m) + (-Math.sin(a1) * bx + Math.cos(a1) * bz) * m
      let y = from.pos[k3 + 1] * (1 - m) + to.pos[k3 + 1] * m
      // in flight: swing round and up, as if caught in a current
      const swirl = fly * (0.8 + s1 * 1.2) * (s2 > 0.5 ? 1 : -1)
      const cs = Math.cos(swirl)
      const sn = Math.sin(swirl)
      ;[x, z] = [cs * x + sn * z, -sn * x + cs * z]
      y += fly * (0.4 + s3 * 1.3) * burst
      x += (s1 - 0.5) * fly * 1.2 * burst
      z += (s3 - 0.5) * fly * 1.2 * burst
      if (radial) {
        // thrown out from the middle, as from a blast
        const dy = y - MIDDLE
        const l = Math.hypot(x, dy, z) || 1
        const f = fly * radial * (0.6 + s1 * 0.8)
        x += (x / l) * f
        y += (dy / l) * f
        z += (z / l) * f
      }
      if (sq !== 1) {
        x *= sq
        y = MIDDLE + (y - MIDDLE) * sq
        z *= sq
      }
      // the stadium wave of flipTo()
      let fm = 1
      if (flip) {
        fm = ease(clamp01((clock - flip.at - clamp01((x + 2.4) / 4.8) * 0.9) / 0.85))
        y += Math.sin(Math.PI * fm) * 0.22
      }
      d.position.set(x, y, z)
      // tumbling on the way
      d.rotation.set(
        from.rot[k3] * (1 - m) + to.rot[k3] * m + fly * (s1 - 0.5) * 5,
        (from.rot[k3 + 1] + a0) * (1 - m) + (to.rot[k3 + 1] + a1) * m + fly * (s2 - 0.5) * 5 + (flip ? fm * Math.PI * 2 : 0),
        from.rot[k3 + 2] * (1 - m) + to.rot[k3 + 2] * m + fly * (s3 - 0.5) * 3,
      )
      // small in flight would vanish; keep at least a flying size
      const grow = fly * 0.06
      d.scale.set(
        from.scl[k3] * (1 - m) + to.scl[k3] * m + grow,
        from.scl[k3 + 1] * (1 - m) + to.scl[k3 + 1] * m + grow,
        from.scl[k3 + 2] * (1 - m) + to.scl[k3 + 2] * m + grow,
      )
      d.updateMatrix()
      this.mesh.setMatrixAt(k, d.matrix)
      cur.pos.set([x, y, z], k3)
      cur.rot.set([d.rotation.x, d.rotation.y, d.rotation.z], k3)
      cur.scl.set([d.scale.x, d.scale.y, d.scale.z], k3)
      c.setRGB(from.col[k3] * (1 - m) + to.col[k3] * m, from.col[k3 + 1] * (1 - m) + to.col[k3 + 1] * m, from.col[k3 + 2] * (1 - m) + to.col[k3 + 2] * m)
      if (flip && fm < 1) {
        // the new colour comes in while the bubble is edge-on
        const w = clamp01((fm - 0.4) / 0.2)
        c.setRGB(flip.col[k3] * (1 - w) + c.r * w, flip.col[k3 + 1] * (1 - w) + c.g * w, flip.col[k3 + 2] * (1 - w) + c.b * w)
      }
      this.mesh.setColorAt(k, c)
      cur.col.set([c.r, c.g, c.b], k3)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.instanceColor.needsUpdate = true
  }

  #prev(i) {
    return i > 0 ? this.slides[i - 1] : this.start
  }

  #cam(slide, t) {
    const c = slide.cam
    const orbit = Math.sin(t * (c.speed ?? 0.25)) * (c.orbit ?? 0.25)
    const look = new Vector3(...c.look)
    // a slow push in (or out) through the slide
    const p = new Vector3(...c.pos).sub(look).multiplyScalar(1 - (c.dolly ?? 0.012) * t).applyAxisAngle(new Vector3(0, 1, 0), orbit).add(look)
    return { p, look }
  }

  /**
   * Draw slide i at t seconds into it. mt: how far into the change from the last slide (seconds;
   * normally the same as t — the landing drives it with the scroll instead). clock: a time that
   * only ever moves forward, for flipTo()'s wave (the landing's t swings back and forth).
   */
  render(i, t, mt = t, clock = t) {
    this.lastI = i
    this.lastT = t
    this.lastClock = clock
    const s = this.slides[i]
    this.#bubbles(i, t, mt, clock)
    // the camera glides from where the last slide left it, rising a little on the way
    const k = ease(Math.min(1, mt / (MORPH + 0.5)))
    const now = this.#cam(s, t)
    const pb = this.#prev(i)
    if (pb.cam) {
      const prev = this.#cam(pb, pb.duration + t)
      now.p.lerpVectors(prev.p, now.p, k)
      now.look.lerpVectors(prev.look, now.look, k)
      const arc = Math.sin(Math.PI * k)
      now.p.y += arc * 0.8
      if (this.swing || this.pull) now.p.sub(now.look).applyAxisAngle(UP, arc * this.swing).multiplyScalar(1 + arc * this.pull).add(now.look)
    }
    now.p.sub(now.look).multiplyScalar(this.zoom).add(now.look)
    if (this.lean) {
      now.p.x += this.lean.x * 0.7
      now.p.y += this.lean.y * 0.35
    }
    this.camera.position.copy(now.p)
    this.camera.lookAt(now.look)
    this.look = now.look
    const { w, h } = this.size
    const [ox, oy] = this.offset
    if (ox || oy) this.camera.setViewOffset(w, h, -ox * w, oy * h, w, h)
    else if (this.camera.view) this.camera.clearViewOffset()
    if (this.bokeh) this.bokeh.uniforms.focus.value = now.p.distanceTo(now.look)
    this.bloom.strength = 0.32 * (1 + 0.8 * this.pulse)
    this.lens.uniforms.uKick.value = pb.cam ? Math.sin(Math.PI * Math.min(1, mt / 1.2)) ** 2 * 0.6 * Math.min(1.6, this.burst) : 0
    // the room's colours drift to the new slide's
    if (!pb.bg) Object.assign(pb, { bg: s.bg, glow: s.glow, rim: s.rim })
    const kb = Math.min(1, mt / 1.4)
    const b = this.bg.material.uniforms
    b.uColor.value.copy(lin(pb.bg)).lerp(lin(s.bg), kb)
    b.uGlow.value.copy(lin(pb.glow)).lerp(lin(s.glow), kb)
    this.fog.color.copy(b.uColor.value)
    this.glaze.material.color.copy(b.uColor.value)
    this.rim.color.copy(lin(pb.rim ?? pb.glow)).lerp(lin(s.rim ?? s.glow), kb)
    if (this.flip) {
      const kf = clamp01((clock - this.flip.at) / 1.4)
      b.uColor.value.copy(this.flip.bg).lerp(lin(s.bg), kf)
      b.uGlow.value.copy(this.flip.glow).lerp(lin(s.glow), kf)
      this.fog.color.copy(b.uColor.value)
      this.glaze.material.color.copy(b.uColor.value)
      this.rim.color.copy(this.flip.rim).lerp(lin(s.rim ?? s.glow), kf)
    }
    // the landing: a ring of light runs out across the floor
    const ts = this.shock && pb.cam ? mt - MORPH * 0.95 : -1
    this.ring.visible = ts > 0 && ts < 1.6
    if (this.ring.visible) {
      const r = 0.4 + ts * 4.2
      this.ring.scale.set(r, r, r)
      this.ring.material.opacity = (1 - ts / 1.6) ** 2
      this.ring.material.color.copy(this.rim.color).multiplyScalar(1.6)
    }
    this.composer.render()
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.mirror.dispose()
    this.composer.dispose()
    this.renderer.dispose()
  }
}
