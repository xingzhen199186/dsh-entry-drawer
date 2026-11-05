/**
 * Sidebar panel drawer — Client half.
 *
 * The shell renders every global panel entry as one row inside the sidebar's
 * panel navigation and owns that row's box and click, so a third-party plugin
 * can only contribute its own row. This module uses that seat: it registers a
 * row at the top of the list that behaves as a fold switch. While folded the
 * stylesheet hides every other child of the navigation and keeps this row, so
 * the entry block collapses to a single line and the session history moves up.
 *
 * Pointer and keyboard activation of the row are intercepted with one
 * capture-phase click listener; the button itself therefore never selects a
 * panel. A zero-height `main` occupant stays registered as a safety net: if
 * anything still selects the row's panel, it toggles and returns to the
 * previous panel instead of failing on a missing key.
 */
window.__ModuleLoader__.load({
  id: 'dsh-entry-drawer',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Dictionary namespace owned by this plugin. */
    const NS = 'entry-drawer'
    /** Panel id shared by the sidebar row and the main-slot safety net. */
    const PANEL_ID = 'entry-drawer'
    /** Preference key; the folded state survives reloads and desktop restarts. */
    const STORAGE_KEY = 'dsh-entry-drawer:collapsed'
    /** Cookie name shared across the desktop app's per-launch local ports. */
    const COOKIE_NAME = 'dsh-entry-drawer'
    /** One year, in seconds. */
    const COOKIE_MAX_AGE = 31536000
    /** Accessible names the shell is known to give its panel navigation. */
    const KNOWN_NAV_LABELS = ['全局面板', 'Global panels']

    const zh = { entry: '入口收纳' }
    const en = { entry: 'Entry drawer' }

    let folded = readCollapsed()
    const listeners = new Set()
    /** Last panel the user saw, so the safety net can return there. */
    let lastPanelId

    /**
     * Read the saved preference. The desktop app opens the GUI on a new local
     * port at every launch, and web storage is partitioned by origin (port
     * included), so the cookie is the part that survives a restart; the
     * localStorage entry is a same-origin fast path.
     */
    function readCollapsed() {
      try {
        for (const part of document.cookie.split(';')) {
          const trimmed = part.trim()
          if (trimmed.startsWith(COOKIE_NAME + '=')) {
            return trimmed.slice(COOKIE_NAME.length + 1) === '1'
          }
        }
      } catch {
        /* Cookies unavailable: fall through to web storage. */
      }
      try {
        return window.localStorage.getItem(STORAGE_KEY) === '1'
      } catch {
        return false
      }
    }

    function storeCollapsed(value) {
      try {
        document.cookie =
          COOKIE_NAME + '=' + (value ? '1' : '0') +
          '; path=/; max-age=' + COOKIE_MAX_AGE + '; SameSite=Lax'
      } catch {
        /* Cookies unavailable: web storage still holds the same-origin value. */
      }
      try {
        window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
      } catch {
        /* A page that forbids storage keeps the state for this view only. */
      }
    }

    function getFolded() {
      return folded
    }

    function subscribeCollapsed(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }

    function setFolded(next) {
      if (next === folded) return
      folded = next
      storeCollapsed(next)
      for (const listener of [...listeners]) listener()
    }

    /** Serialize one accessible name as a CSS attribute selector value. */
    function quoteCssString(value) {
      return '"' + value.replace(/["\\]/g, '\\$&') + '"'
    }

    /**
     * The rule that folds the panel list. It hides every direct child of the
     * navigation except the row that carries this plugin's marker, so the fold
     * switch stays reachable while the entries are away.
     */
    function foldRule(labels) {
      const names = labels.filter(
        (label, index) =>
          typeof label === 'string' && label.length > 0 && labels.indexOf(label) === index,
      )
      if (names.length === 0) return ''
      // Each navigation name needs its own child rule: a comma list without the
      // descendant part would hide the whole first navigation, switch included.
      const hideOthers = names
        .map(
          (label) =>
            'nav[aria-label=' + quoteCssString(label) + '] > *:not(:has(.dsh-entry-drawer-mark))',
        )
        .join(', ')
      return hideOthers + '{display:none !important}'
    }

    /** The row glyph's own styles; class names are this plugin's, never the shell's. */
    const BASE_CSS = [
      '.dsh-entry-drawer-mark{display:inline-flex;align-items:center;justify-content:center}',
    ].join('')

    /** Double chevrons: up while the entries are shown, down once they are folded. */
    function FoldIcon({ size, folded: isFolded }) {
      const edge = typeof size === 'number' && size > 0 ? size : 16
      const scale = edge / 16
      const paths = isFolded
        ? ['M3.5 8.4 8 12.4l4.5-4', 'M3.5 4 8 8l4.5-4']
        : ['M3.5 7.6 8 3.6l4.5 4', 'M3.5 12 8 8l4.5 4']
      return h(
        'svg',
        {
          width: edge,
          height: edge,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.3 * scale,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          style: { display: 'block' },
        },
        paths.map((d, index) => h('path', { key: String(index), d })),
      )
    }

    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'entry-drawer: dictionaries')

        /** Names the live shell may be using for its panel navigation. */
        function navLabels() {
          const labels = []
          try {
            const live = ctx.locale.bind('sidebar')('panels.label')
            if (typeof live === 'string') labels.push(live)
          } catch {
            /* The sidebar namespace is optional; the known names still apply. */
          }
          labels.push(...KNOWN_NAV_LABELS)
          return labels
        }

        /** One owned stylesheet carries both the glyph styles and the fold rule. */
        ctx.effect(() => {
          const style = document.createElement('style')
          style.dataset.plugin = 'dsh-entry-drawer'
          document.head.appendChild(style)
          const render = () => {
            style.textContent = BASE_CSS + (getFolded() ? foldRule(navLabels()) : '')
          }
          render()
          const stopFolded = subscribeCollapsed(render)
          const stopLocale = ctx.locale.subscribe(render)
          return () => {
            stopFolded()
            stopLocale()
            style.remove()
          }
        }, 'entry-drawer: stylesheet')

        /** Turn the shell's row activation into the fold toggle. */
        ctx.effect(() => {
          const onClick = (event) => {
            const target = event.target
            if (!(target instanceof Element)) return
            const button = target.closest('button')
            if (button === null || button.querySelector('.dsh-entry-drawer-mark') === null) return
            event.preventDefault()
            event.stopPropagation()
            setFolded(!getFolded())
          }
          document.addEventListener('click', onClick, true)
          return () => document.removeEventListener('click', onClick, true)
        }, 'entry-drawer: row activation')

        /** The list row's glyph: the fold switch itself. */
        function FoldGlyph({ size, usePanelInfo }) {
          const isFolded = React.useSyncExternalStore(subscribeCollapsed, getFolded)
          const activePanelId = usePanelInfo((info) => info.activePanelId)
          React.useEffect(() => {
            if (activePanelId && activePanelId !== PANEL_ID) lastPanelId = activePanelId
          }, [activePanelId])
          return h(
            'span',
            {
              className: 'dsh-entry-drawer-mark',
              'data-dsh-panel-entry': PANEL_ID,
              'aria-hidden': 'true',
            },
            h(FoldIcon, { size, folded: isFolded }),
          )
        }

        /** Safety net: selecting this panel toggles the fold and goes back. */
        function FoldPanel() {
          React.useLayoutEffect(() => {
            setFolded(!getFolded())
            const target = lastPanelId !== undefined && lastPanelId !== 'conversation' ? lastPanelId : null
            try {
              ctx.layout.selectPanel(target)
            } catch {
              try {
                ctx.layout.selectPanel(null)
              } catch {
                /* Nothing left to return to; the fold already changed. */
              }
            }
          }, [])
          return null
        }

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: -1000,
              label: () => ctx.locale.bind(NS)('entry'),
            },
            FoldGlyph,
          ),
        )

        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, FoldPanel))
      },
    }
  },
})
