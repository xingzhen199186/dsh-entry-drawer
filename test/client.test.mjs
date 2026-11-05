/**
 * Behaviour test for the Client half without a browser.
 *
 * The module is plain ESM-in-a-loader; this harness supplies a tiny React, a
 * fake DOM, a fake module loader, and the Cordis services the plugin uses, then
 * checks the registrations, the stylesheet, the row activation, the glyph
 * state, the safety-net panel, and the persisted preference.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')

const NS = 'entry-drawer'
const PANEL_ID = 'entry-drawer'
const STORAGE_KEY = 'dsh-entry-drawer:collapsed'
const NAV_LABEL = '全局面板'

class FakeElement {}

function createDocument(seedCookie) {
  const listeners = new Map()
  const jar = new Map()
  if (seedCookie !== undefined) jar.set('dsh-entry-drawer', seedCookie)
  const head = {
    children: [],
    appendChild(node) {
      this.children.push(node)
      node.parent = this
    },
  }
  return {
    head,
    get cookie() {
      return [...jar].map(([name, value]) => name + '=' + value).join('; ')
    },
    set cookie(raw) {
      const pair = String(raw).split(';')[0]
      const at = pair.indexOf('=')
      if (at < 0) return
      jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim())
    },
    readCookie(name) {
      return jar.get(name)
    },
    createElement(tagName) {
      const node = {
        tagName: String(tagName).toUpperCase(),
        dataset: {},
        textContent: '',
        remove() {
          const at = head.children.indexOf(node)
          if (at >= 0) head.children.splice(at, 1)
        },
      }
      return node
    },
    addEventListener(type, handler, capture) {
      listeners.set(type + ':' + (capture === true), handler)
    },
    removeEventListener(type, handler, capture) {
      listeners.delete(type + ':' + (capture === true))
    },
    dispatch(type, event) {
      listeners.get(type + ':true')?.(event)
    },
    get listenerCount() {
      return listeners.size
    },
  }
}

function setup({ stored, cookie, liveLabel, throwingStorage = false, liveLocale = true } = {}) {
  const entry = { current: null }
  const writes = []
  const document = createDocument(cookie)
  const window = {
    __ModuleLoader__: {
      load(module) {
        entry.current = module
      },
    },
    localStorage: throwingStorage
      ? {
          getItem() {
            throw new Error('storage disabled')
          },
          setItem() {
            throw new Error('storage disabled')
          },
        }
      : {
          getItem(key) {
            return key === STORAGE_KEY && stored !== undefined ? stored : null
          },
          setItem(key, value) {
            writes.push([key, value])
          },
        },
  }

  // Minimal React: element objects, effects run immediately, external store reads.
  let hookIndex = 0
  const hookState = []
  const Fragment = Symbol('Fragment')
  const React = {
    Fragment,
    createElement(type, props, ...children) {
      const kids = children.flat().filter((child) => child !== null && child !== undefined && child !== false)
      if (typeof type === 'function') return type({ ...(props ?? {}), children: kids })
      return { type, props: props ?? {}, children: kids }
    },
    useState(initial) {
      const index = hookIndex++
      if (!(index in hookState)) hookState[index] = typeof initial === 'function' ? initial() : initial
      return [
        hookState[index],
        (next) => {
          hookState[index] = typeof next === 'function' ? next(hookState[index]) : next
        },
      ]
    },
    useEffect(effect) {
      effect()
    },
    useLayoutEffect(effect) {
      effect()
    },
    useSyncExternalStore(subscribe, getSnapshot) {
      const before = getSnapshot()
      subscribe(() => {})
      return before
    },
  }

  const run = new Function('window', 'require', 'document', 'Element', source)
  run(window, (name) => {
    assert.equal(name, 'react')
    return React
  }, document, FakeElement)
  assert.equal(entry.current.id, 'dsh-entry-drawer')

  const registrations = { panellist: null, main: null }
  const dictionaries = []
  const selectedPanels = []
  const ctx = {
    effect(callback) {
      const dispose = callback()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    locale: {
      register(ns, dicts) {
        dictionaries.push({ ns, dicts })
        return () => {}
      },
      bind(ns) {
        return (key) => {
          if (ns === 'sidebar') {
            if (!liveLocale) throw new Error('unknown namespace')
            if (key === 'panels.label') return liveLabel ?? NAV_LABEL
            return key
          }
          if (ns === NS) {
            const dictionary = dictionaries.find((item) => item.ns === NS)
            return dictionary?.dicts.zh[key] ?? key
          }
          return key
        }
      },
      subscribe() {
        return () => {}
      },
    },
    layout: {
      selectPanel(id) {
        selectedPanels.push(id)
      },
    },
    slots: {
      inject(name, callback) {
        assert.ok(name === 'sidebar.panellist' || name === 'main')
        callback()
      },
      register(options) {
        if (options.name === 'main') registrations.main = options
        else registrations.panellist = options
        return () => {}
      },
    },
  }

  const plugin = entry.current.factory((name) => {
    assert.equal(name, 'react')
    return React
  })
  plugin.apply(ctx)

  const styleOf = () => document.head.children[0]?.textContent ?? ''
  const clickRow = (hasMarker = true) => {
    const button = new (class extends FakeElement {
      closest(selector) {
        return selector === 'button' ? this : null
      }
      querySelector(selector) {
        return hasMarker && selector === '.dsh-entry-drawer-mark' ? {} : null
      }
    })()
    const event = {
      target: button,
      prevented: false,
      stopped: false,
      preventDefault() {
        this.prevented = true
      },
      stopPropagation() {
        this.stopped = true
      },
    }
    document.dispatch('click', event)
    return event
  }

  return { registrations, render: null, writes, dictionaries, styleOf, clickRow, selectedPanels, document }
}

// --- registrations ---------------------------------------------------------
{
  const { registrations, dictionaries } = setup()
  assert.equal(registrations.panellist.name, 'sidebar.panellist')
  assert.equal(registrations.panellist.id, PANEL_ID)
  assert.equal(registrations.panellist.order, -1000, 'the row opens the list')
  assert.equal(typeof registrations.panellist.label, 'function')
  assert.equal(registrations.panellist.label(), '入口收纳')
  assert.equal(registrations.main.name, 'main')
  assert.equal(registrations.main.key, PANEL_ID, 'the safety net shares the row id')
  assert.equal(dictionaries[0].ns, NS)
  assert.equal(dictionaries[0].dicts.zh.entry, '入口收纳')
  assert.equal(dictionaries[0].dicts.en.entry, 'Entry drawer')
}

// --- expanded (default): glyph styles only, no fold rule -------------------
{
  const { styleOf } = setup()
  const css = styleOf()
  assert.ok(css.includes('.dsh-entry-drawer-mark'), 'glyph styles are present')
  assert.ok(!css.includes('display:none'), 'nothing is hidden while expanded')
}

// --- collapsed (restored preference): entries folded, row kept -------------
{
  const { styleOf } = setup({ stored: '1' })
  const css = styleOf()
  assert.ok(css.includes('nav[aria-label="全局面板"]'), 'targets the panel navigation')
  // Regression: a comma list without the descendant part hides the whole first
  // navigation, so the fold switch itself disappears.
  assert.ok(
    css.includes('nav[aria-label="全局面板"] > *:not(:has(.dsh-entry-drawer-mark))'),
    'the Chinese navigation keeps its own child rule',
  )
  assert.ok(
    css.includes('nav[aria-label="Global panels"] > *:not(:has(.dsh-entry-drawer-mark))'),
    'the English navigation keeps its own child rule',
  )
  assert.ok(
    !css.includes('nav[aria-label="全局面板"],'),
    'no bare navigation selector that would hide the switch',
  )
  assert.ok(css.includes('{display:none !important}'), 'hides every row except the fold switch')
}

// --- the cookie carries the preference across the desktop's random ports ---
{
  const { styleOf, document } = setup({ cookie: '1' })
  assert.ok(styleOf().includes('display:none'), 'the cookie restores the folded state')
  assert.equal(document.readCookie('dsh-entry-drawer'), '1')
}

// --- a cookie saying expanded wins over an old same-origin value ----------
{
  const { styleOf } = setup({ cookie: '0', stored: '1' })
  assert.ok(!styleOf().includes('display:none'), 'the cookie is authoritative')
}

// --- row activation toggles, persists, and stops the shell's own click ----
{
  const { styleOf, clickRow, writes, document } = setup()
  const event = clickRow()
  assert.ok(event.prevented && event.stopped, 'the shell row handler never runs')
  assert.ok(styleOf().includes('display:none'), 'the entries fold immediately')
  assert.equal(document.readCookie('dsh-entry-drawer'), '1', 'the cookie is written')
  assert.deepEqual(writes, [[STORAGE_KEY, '1']])
  clickRow()
  assert.ok(!styleOf().includes('display:none'), 'the entries come back')
  assert.equal(document.readCookie('dsh-entry-drawer'), '0')
  assert.deepEqual(writes, [
    [STORAGE_KEY, '1'],
    [STORAGE_KEY, '0'],
  ])
}

// --- clicks elsewhere in the sidebar stay untouched -----------------------
{
  const { styleOf, clickRow, writes } = setup()
  clickRow(false)
  assert.ok(!styleOf().includes('display:none'))
  assert.deepEqual(writes, [])
}

// --- the live sidebar dictionary wins over the fallbacks ------------------
{
  const { styleOf } = setup({ stored: '1', liveLabel: 'Paneles' })
  const css = styleOf()
  assert.ok(css.includes('nav[aria-label="Paneles"]'))
  assert.ok(css.includes('nav[aria-label="全局面板"]'))
}

// --- hostile labels are quoted, not injected ------------------------------
{
  const { styleOf } = setup({ stored: '1', liveLabel: 'a"b\\c' })
  assert.ok(styleOf().includes('nav[aria-label="a\\"b\\\\c"]'))
}

// --- degraded environments stay safe --------------------------------------
{
  const noLocale = setup({ stored: '1', liveLocale: false })
  assert.ok(noLocale.styleOf().includes('nav[aria-label="全局面板"]'))

  const noStorage = setup({ stored: '1', throwingStorage: true })
  assert.ok(!noStorage.styleOf().includes('display:none'), 'storage failure reads as expanded')
  noStorage.clickRow()
  assert.ok(noStorage.styleOf().includes('display:none'), 'the toggle still works in memory')
}

// --- stylesheet and listener are owned effects ----------------------------
{
  const { document } = setup()
  assert.equal(document.head.children.length, 1, 'one owned stylesheet')
  assert.equal(document.listenerCount, 1, 'one capture-phase listener')
}

console.log('client.test.mjs: all checks passed')
