/*
 * Framework-free behaviour for the kit. It flips the same data-* / aria attributes the React components (Base UI) set, so the
 * styles in kit.css need nothing extra. Hand-edited source; scripts/build-kit.mjs copies it to dist/behaviour.js.
 * Covers: tabs. (React only: springs, canvas, WebGL, beams.)
 */
;(() => {
  const tabsInit = (list) => {
    const tabs = [...list.querySelectorAll('[role=tab]')]
    const indicator = list.querySelector('[data-slot=tabs-indicator]')
    const panel = (t) => document.getElementById(t.getAttribute('aria-controls'))
    const hidden = (p) => Math.abs(parseFloat(p?.style.getPropertyValue('--hidden-x')) || 16)

    const place = (t) => {
      if (!indicator) return
      const l = t.offsetLeft, top = t.offsetTop, w = t.offsetWidth, h = t.offsetHeight
      const set = (k, v) => indicator.style.setProperty(k, `${v}px`)
      set('--active-tab-left', l); set('--active-tab-top', top); set('--active-tab-width', w); set('--active-tab-height', h)
      set('--active-tab-right', list.clientWidth - l - w); set('--active-tab-bottom', list.clientHeight - top - h)
    }
    const select = (next, focus) => {
      const from = tabs.findIndex((t) => t.hasAttribute('data-active')), to = tabs.indexOf(next)
      if (to === from || next.getAttribute('aria-disabled') === 'true') return
      const dir = to > from ? 'right' : 'left'
      for (const el of [list, ...tabs, indicator, ...tabs.map(panel)].filter(Boolean)) el.setAttribute('data-activation-direction', dir)
      tabs.forEach((t, i) => {
        const on = i === to, p = panel(t)
        t.toggleAttribute('data-active', on); t.toggleAttribute('data-composite-item-active', on)
        t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1
        if (p) {
          p.toggleAttribute('data-hidden', !on); p.toggleAttribute('inert', !on)
          p.style.setProperty('--hidden-x', `${i < to ? -hidden(p) : hidden(p)}px`)
        }
      })
      place(next)
      if (focus) next.focus()
      list.dispatchEvent(new CustomEvent('kit:tabs-change', { bubbles: true, detail: { index: to } }))
    }
    tabs.forEach((t) => t.addEventListener('click', () => select(t)))
    list.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement); if (i < 0) return
      const n = tabs.length, key = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: n - 1 }[e.key]
      if (key === undefined) return
      e.preventDefault(); select(tabs[(key + n) % n], true)
    })
    const current = tabs.find((t) => t.hasAttribute('data-active')); if (current) place(current)
    addEventListener('resize', () => { const c = tabs.find((t) => t.hasAttribute('data-active')); if (c) place(c) })
  }
  const init = () => document.querySelectorAll('[role=tablist][data-slot=tabs-list]').forEach(tabsInit)
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init()
})()
