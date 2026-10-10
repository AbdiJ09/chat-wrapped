// The vibe picker: the themes' names round a drum you see side-on, like a dial. The one facing
// you is big and in its colours; the others curve away above and below as outlines. Click one,
// drag the drum, use the arrow keys (or the wheel, where the page doesn't scroll) and it rolls
// round on a spring. On the landing it can turn by itself.

const STEP = 36 // degrees between names

export class Drum {
  /**
   * themes: the list; onChange(theme): when the one facing you changes.
   * wheel: let the mouse wheel turn it (not where it would trap the page's scroll).
   */
  constructor(el, themes, { onChange, wheel = false, guess = null } = {}) {
    this.el = el
    this.themes = themes
    this.onChange = onChange
    this.at = 0
    el.classList.add('drum')
    el.tabIndex = 0
    el.innerHTML = `<div class="drum__stage"><div class="drum__wheel">${themes
      .map((t, i) => `<button class="drum__item" style="--i:${i};--c1:${t.people[0]};--c2:${t.people[1]}" data-i="${i}"><span class="drum__emoji">${t.emoji}</span><span class="drum__name">${t.name}</span>${t.id === guess ? '<span class="drum__guess">tebakan kami</span>' : ''}</button>`)
      .join('')}</div></div><p class="drum__blurb"><span class="drum__swatches"></span><span class="drum__line"></span></p>`
    this.wheel = el.querySelector('.drum__wheel')
    this.items = [...el.querySelectorAll('.drum__item')]
    for (const b of this.items) b.addEventListener('click', () => !this.dragged && this.set(+b.dataset.i))
    el.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') this.set(this.at + 1)
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') this.set(this.at - 1)
      else return
      e.preventDefault()
    })
    // drag it round
    let y0 = null
    // (on a page that scrolls, a finger's swipe is the page's: there only a mouse drags it)
    if (wheel) el.classList.add('drum--own')
    el.addEventListener('pointerdown', (e) => {
      if (!wheel && e.pointerType !== 'mouse') return
      y0 = e.clientY
      this.dragged = false
    })
    addEventListener('pointermove', (e) => {
      if (y0 == null) return
      const dy = e.clientY - y0
      if (Math.abs(dy) > 46) {
        this.set(this.at + (dy < 0 ? 1 : -1))
        y0 = e.clientY
        this.dragged = true
      }
    })
    addEventListener('pointerup', () => (y0 = null))
    if (wheel) {
      let sum = 0
      let last = 0
      el.addEventListener('wheel', (e) => {
        e.preventDefault()
        const now = performance.now()
        if (now - last > 250) sum = 0
        sum += e.deltaY
        if (Math.abs(sum) > 40) {
          this.set(this.at + Math.sign(sum))
          sum = 0
          last = now
        }
      }, { passive: false })
    }
    // hands off while you're on it
    el.addEventListener('pointerenter', () => (this.hover = true))
    el.addEventListener('pointerleave', () => (this.hover = false))
    this.set(0, { silent: true })
  }

  /** Face theme i (wraps round). silent: don't tell onChange. */
  set(i, { silent = false } = {}) {
    const n = this.themes.length
    const target = ((i % n) + n) % n
    this.at = target
    // every name takes its place round the drum relative to the one in front (−2 … 2): it rolls
    // there; one that comes round the back (a jump of more than two places) moves unseen
    this.items.forEach((b, k) => {
      let off = k - target
      if (off > n / 2) off -= n
      if (off < -n / 2) off += n
      const was = +(b.style.getPropertyValue('--o') || off)
      if (Math.abs(off - was) > 2) {
        b.style.transition = 'none'
        b.style.setProperty('--o', off)
        void b.offsetWidth
        b.style.transition = ''
      } else b.style.setProperty('--o', off)
      b.classList.toggle('is-on', k === target)
    })
    const t = this.themes[target]
    this.el.style.setProperty('--c1', t.people[0])
    this.el.querySelector('.drum__swatches').innerHTML = t.people.slice(0, 4).map((c) => `<i style="background:${c}"></i>`).join('')
    this.el.querySelector('.drum__line').textContent = t.blurb
    const blurb = this.el.querySelector('.drum__blurb')
    blurb.classList.remove('is-new')
    void blurb.offsetWidth
    blurb.classList.add('is-new')
    if (!silent) this.onChange?.(t)
  }

  /** Mark the theme we guessed for this chat. */
  guess(id) {
    this.items.forEach((b, k) => {
      b.querySelector('.drum__guess')?.remove()
      if (this.themes[k].id === id) b.insertAdjacentHTML('beforeend', '<span class="drum__guess">tebakan kami</span>')
    })
  }

  /** Turn by itself every few seconds (unless you're on it), or stop. */
  play(on) {
    clearInterval(this.timer)
    if (on) this.timer = setInterval(() => !this.hover && this.set(this.at + 1), 2600)
  }
}
