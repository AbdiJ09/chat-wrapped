import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  NoToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { rng } from './shapes.js'

// The 3D stage behind the story. One cloud of particles flies from shape to shape: at each slide
// every particle leaves where the last slide put it and swirls to its new place, staggered, so the
// change reads as one living thing rebuilding itself. Everything is a pure function of
// (slide, time), so a video can be rendered frame by frame and look exactly like playback.

export const MORPH = 1.6 // seconds a change of shape takes (plus up to 0.5 s of stagger)

const vert = /* glsl */ `
attribute vec3 aFrom;
attribute vec3 aTo;
attribute vec3 aColFrom;
attribute vec3 aColTo;
attribute vec2 aSpin;     // turning speed in the old shape, in the new one
attribute vec4 aSeed;
uniform float uT;         // seconds into this slide
uniform float uFromT;     // how long the old shape had been turning when this slide began
uniform float uTime;      // seconds since the story began
uniform float uSize;
uniform float uMorph;
varying vec3 vColor;
varying float vAlpha;

vec3 rotY(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}
float ease(float x) { return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) / 2.0; }

void main() {
  vec3 a = rotY(aFrom, aSpin.x * (uFromT + uT));
  vec3 b = rotY(aTo, aSpin.y * uT);
  float m = ease(clamp((uT - aSeed.x * 0.5) / uMorph, 0.0, 1.0));
  float fly = sin(3.14159 * m);
  vec3 p = mix(a, b, m);
  // in flight: swing out and around, as if caught in a current
  p = rotY(p, fly * (1.2 + aSeed.y * 1.4) * (aSeed.z > 0.5 ? 1.0 : -1.0));
  p += normalize(vec3(aSeed.y - 0.5, aSeed.z - 0.5, aSeed.w - 0.5) + 1e-4) * fly * (0.4 + aSeed.w * 0.9);
  // always alive: a slow shimmer in place
  p += vec3(sin(uTime * 0.7 + aSeed.x * 40.0), cos(uTime * 0.6 + aSeed.y * 40.0), sin(uTime * 0.5 + aSeed.z * 40.0)) * 0.012;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float twinkle = 0.8 + 0.2 * sin(uTime * 2.3 + aSeed.w * 60.0);
  vColor = mix(aColFrom, aColTo, m) * twinkle * (1.0 - fly * 0.35); // spread out mid-flight: dimmer, so the cloud isn't a white-out
  vAlpha = 1.0;
  gl_PointSize = uSize * (0.55 + 0.9 * aSeed.w) * (1.0 + fly * 0.5) / -mv.z;
}
`

const frag = /* glsl */ `
uniform float uGain;
varying vec3 vColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = exp(-dot(d, d) * 22.0);
  gl_FragColor = vec4(vColor * a * uGain, 1.0);
}
`

// the backdrop: a deep colour with a soft light behind the middle (drawn in the scene, so it goes
// through the same colour pipeline as the particles)
const bgVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`
const bgFrag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uGlow;
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - vec2(0.5, 0.52)) * vec2(uAspect, 1.0);
  float g = exp(-dot(p, p) * 3.5);
  gl_FragColor = vec4(uColor + uGlow * g, 1.0);
}
`

const lin = (hex) => new Color(hex) // three converts sRGB hex to its linear working space

export class Engine {
  constructor({ count = 30000 } = {}) {
    this.N = count
    this.canvas = document.createElement('canvas')
    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
    this.renderer.toneMapping = NoToneMapping
    this.scene = new Scene()
    this.camera = new PerspectiveCamera(32, 9 / 16, 0.1, 100)

    // backdrop
    this.bg = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({ vertexShader: bgVert, fragmentShader: bgFrag, depthWrite: false, depthTest: false, uniforms: { uColor: { value: new Color() }, uGlow: { value: new Color() }, uAspect: { value: 9 / 16 } } }),
    )
    this.bg.frustumCulled = false
    this.bg.renderOrder = -1
    this.scene.add(this.bg)

    // particles
    const N = this.N
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(N * 3), 3))
    for (const [name, size] of [['aFrom', 3], ['aTo', 3], ['aColFrom', 3], ['aColTo', 3], ['aSpin', 2]]) {
      geo.setAttribute(name, new BufferAttribute(new Float32Array(N * size), size))
    }
    const r = rng(99)
    const seed = new Float32Array(N * 4)
    for (let i = 0; i < seed.length; i++) seed[i] = r()
    geo.setAttribute('aSeed', new BufferAttribute(seed, 4))
    this.geo = geo
    // thousands of particles add up where they crowd: keep each one faint, the same total light whatever N
    this.uniforms = { uT: { value: 0 }, uFromT: { value: 0 }, uTime: { value: 0 }, uSize: { value: 30 }, uMorph: { value: MORPH }, uGain: { value: 0.3 * Math.sqrt(30000 / count) } }
    this.points = new Points(geo, new ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms, blending: AdditiveBlending, transparent: true, depthWrite: false, depthTest: false }))
    this.points.frustumCulled = false
    this.scene.add(this.points)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new Vector2(256, 256), 0.55, 0.35, 0.3)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())

    this.slides = []
    this.current = -2
    this.shiftX = 0
    this.zoom = 1 // > 1 pulls the camera back
    this.size = { w: 0, h: 0 }
  }

  /**
   * slides: [{ shape: {pos, col, spin}, cam: {pos:[x,y,z], look:[x,y,z], orbit, speed}, bg, glow, duration }]
   * start: the shape everything comes out of
   */
  setStory(slides, start) {
    this.slides = slides
    this.start = start
    this.current = -2
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
    // particles keep the same size relative to the frame height
    this.uniforms.uSize.value = 60 * (h * pixelRatio) / 1920
  }

  #load(i) {
    const to = this.slides[i]
    const from = i > 0 ? this.slides[i - 1].shape : this.start
    const g = this.geo.attributes
    g.aFrom.array.set(from.pos)
    g.aColFrom.array.set(from.col)
    g.aTo.array.set(to.shape.pos)
    g.aColTo.array.set(to.shape.col)
    const spin = g.aSpin.array
    for (let k = 0; k < this.N; k++) {
      spin[k * 2] = from.spin[k]
      spin[k * 2 + 1] = to.shape.spin[k]
    }
    for (const a of ['aFrom', 'aColFrom', 'aTo', 'aColTo', 'aSpin']) g[a].needsUpdate = true
    this.current = i
  }

  #cam(i, t) {
    const c = this.slides[i].cam
    const orbit = Math.sin(t * (c.speed ?? 0.25)) * (c.orbit ?? 0.25)
    const p = new Vector3(...c.pos).applyAxisAngle(new Vector3(0, 1, 0), orbit)
    return { p, look: new Vector3(...c.look) }
  }

  /** Draw slide i at t seconds into it. time: seconds since the story began (for the shimmer). */
  render(i, t, time = t) {
    if (i !== this.current) this.#load(i)
    const s = this.slides[i]
    const u = this.uniforms
    u.uT.value = t
    u.uFromT.value = i > 0 ? this.slides[i - 1].duration : 0
    u.uTime.value = time
    // the camera eases from where the last slide left it
    const k = easeInOut(Math.min(1, t / (MORPH + 0.4)))
    const now = this.#cam(i, t)
    if (i > 0) {
      const prev = this.#cam(i - 1, this.slides[i - 1].duration + t)
      now.p.lerpVectors(prev.p, now.p, k)
      now.look.lerpVectors(prev.look, now.look, k)
    }
    this.camera.position.copy(now.p).sub(now.look).multiplyScalar(this.zoom).add(now.look)
    this.camera.position.x -= this.shiftX
    now.look.x -= this.shiftX
    this.camera.lookAt(now.look)
    // the backdrop's colour drifts to the new slide's
    const b = this.bg.material.uniforms
    const pb = i > 0 ? this.slides[i - 1] : s
    const kb = Math.min(1, t / 1.2)
    b.uColor.value.copy(lin(pb.bg)).lerp(lin(s.bg), kb)
    b.uGlow.value.copy(lin(pb.glow)).lerp(lin(s.glow), kb)
    this.composer.render()
  }

  dispose() {
    this.geo.dispose()
    this.points.material.dispose()
    this.composer.dispose()
    this.renderer.dispose()
  }
}

const easeInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
