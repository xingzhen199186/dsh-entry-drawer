# dsh-entry-drawer

Turns the first row of DSH's left sidebar entry list into a switch: click it and every other entry folds away, giving the session history room to move up; click again and they come back.

Version 0.1.0 · MIT · a client-side plugin for the DSH 0.2.x web and desktop app

## Why it exists

The upper half of the DSH sidebar is an entry list: plugins, the plugin market, scheduled tasks, remote windows, the task board, memory. Every installed plugin adds a row there. The longer the list grows, the further down the session history gets pushed.

The only place the platform offers third parties is `sidebar.panellist`, the sidebar's panel-list seat. A slot is a fixed position in the interface that a plugin may put its own content into, but nothing else's. The shell (the interface framework the plugin runs inside) owns those rows' boxes, their height, and their click behaviour, and there is no built-in way to group them.

So this plugin adds no feature of its own. It borrows a seat to do one thing: put a row at the very top of the list that folds the other rows away.

## What you see and how to use it

Expanded (the default):

- Position: the first row of the sidebar entry list.
- Content: a pair of upward chevrons and the label "Entry drawer".
- Below it, every existing entry, unchanged.

Click the row:

- The other entries are hidden as one block — they stop taking up space, they don't just grey out.
- The session history moves up.
- The chevrons flip to point down, and the row stays where it is.

Click again: everything returns and the chevrons point up.

The preference lives in two places: `localStorage` (small browser-side storage for a site; it outlives the page) under `dsh-entry-drawer:collapsed`, and a cookie of the same name. The cookie exists because the desktop app picks a new local port on `127.0.0.1` at every launch, and browsers partition `localStorage` by scheme, host and port; cookies ignore the port, so they are what keeps the state across restarts. Reloading the page or restarting the desktop app keeps your last choice. It is stored per browser, not per DSH profile.

## Installation

Requires DSH 0.2.x with Node.js and pnpm available (`dsh plugin` is a thin pnpm wrapper).

**Option 1: install from GitHub**

```sh
dsh plugin --profile <name> add github:xingzhen199186/dsh-entry-drawer
```

Replace `<name>` with your profile, for example `web` or `desktop`.

**Option 2: install from a local directory**

```sh
dsh plugin --profile <name> add ./dsh-entry-drawer
```

The plugin manager's "install from directory" does the same thing if you prefer pointing at the folder there.

Afterwards, reload the window. On the desktop app, restart it instead. The client half (`client.js`, the part that runs in the browser) only mounts when the window loads again, and the desktop app has no client-side hot reload by default.

The package is not published to npm (`package.json` sets `private: true`), so it cannot be installed by package name.

To remove it:

```sh
dsh plugin --profile <name> remove dsh-entry-drawer
```

## How it works

Three moving parts — a seat, a click interceptor, and one stylesheet rule — plus a safety-net panel.

**1. The seat**

On load, the client half registers twice:

```js
ctx.slots.register({ name: 'sidebar.panellist', id: 'entry-drawer', order: -1000, label })
ctx.slots.register({ name: 'main', key: 'entry-drawer' })
```

`order: -1000` puts it ahead of every other entry. What it draws inside that row is the switch itself: a `span.dsh-entry-drawer-mark` wrapping the chevron icon. The label "Entry drawer" comes from the plugin's own zh/en dictionaries.

**2. The click interceptor**

The shell owns both the row box and the row click, so the plugin cannot rewrite either. Instead it attaches one capture-phase click listener on `document` (capture phase: the part of event dispatch that travels inward from the outermost element, so the listener sees the click before the shell's own handler). The match is deliberately narrow: the clicked element sits inside a `button`, and that `button` contains `.dsh-entry-drawer-mark`. On a match it calls `preventDefault()` and `stopPropagation()`, so the shell's "select this panel" logic never runs, and the plugin flips the fold state and saves it instead.

Exactly one listener is registered, and it lives and dies with the plugin's effect. Clicks anywhere else in the sidebar are untouched.

**3. The stylesheet**

Folding is not done by editing the DOM. It is expressed by a `<style>` element the plugin owns. While expanded, that stylesheet holds only the glyph's base styles. While folded, it gains one rule:

```css
nav[aria-label="Global panels"] > *:not(:has(.dsh-entry-drawer-mark)) { display:none !important }
```

Read it as: inside the navigation whose accessible name is "Global panels" (`aria-label` is the name screen readers and automation tools use; DSH labels this navigation with it), hide every direct child that does not contain this plugin's marker.

The name is taken from the live locale dictionary first (`panels.label` in the `sidebar` namespace). When that is unavailable, the plugin falls back to the two names it knows, `全局面板` and `Global panels`, emitting a separate rule for each so both Chinese and English interfaces match. Names coming from the dictionary are escaped in code, so they cannot break out into different CSS. The stylesheet is rebuilt when the interface language changes.

**4. The safety-net panel**

Besides the list row, the plugin registers an empty placeholder panel in `main` (the main content area) under the same id. The normal path never reaches it, because the click is already intercepted. But if some other route still selects that panel, it toggles the fold state on mount and then calls `ctx.layout.selectPanel(...)` to jump back to the panel you were last looking at (or to no panel, if there is nothing to return to), rather than failing because the panel has no content.

**5. Remembering the choice**

Every toggle writes both `localStorage` and a cookie of the same name. The former is the fast same-origin read; the latter survives the desktop app's changing port, as explained under "What you see and how to use it".

**The host half (`index.js`)** is empty: `apply()` does nothing. It exists so the package has a selectable, inspectable, removable entry in the plugin tree. All behaviour lives in the client.

## Compatibility and known limits

The items below are the real situation, not boilerplate.

- **It depends on the navigation's accessible name.** The rule locates the list via `nav[aria-label="全局面板"]`. If upstream renames it, or stops using a `nav` element, the plugin fails quietly: the fold simply stops working, and nothing else gets hidden by mistake. The fix is to update `KNOWN_NAV_LABELS` in the client.
- **The click interceptor sits outside React.** It keys off the structure "a `button` containing this plugin's marker". If upstream changes the row structure — the row is no longer a `button`, or the marker moves out of the button — interception degrades: the click falls through to the shell and selects that one panel. The safety-net panel catches it and jumps back, but what you experience is "the click did nothing" rather than "it folded".
- **Folding hides the whole group.** The official entries — plugins, scheduled tasks, more — disappear along with the third-party ones, because they share one list. They return on expand. Hiding only third-party entries is not possible from this seat.
- **A narrow sidebar has nothing to fold.** When the Windows desktop app collapses the sidebar into a rail, the entire entry list is already hidden, and the plugin changes nothing.
- **Local-directory installs are fragile.** With `add ./dir`, the profile records that directory's path. Move or delete the folder later and the client half fails to load. For long-term use, install from git, or leave the directory where it is.
- **Tested on web and desktop only.** `dsh.client` declares `platform: "web"` and depends on `@deepseek-ai/dsh-client-ui-sidebar`, the client package that provides the sidebar seat. Deployments without that client (headless, for example) never load it.
- **State is per browser.** Switching browsers, switching the host name (for example from `127.0.0.1` to `localhost`), or clearing site data returns you to expanded. Several windows share one storage entry, but the plugin does not listen for `storage` events, so after one window toggles, another needs a reload to catch up.

## Development and tests

There is no build step; it is plain JavaScript. The client half is a `window.__ModuleLoader__.load({ id, factory })` module, and the host half is ordinary ESM exporting an empty `apply()`.

The test needs no browser. It uses Node's built-in `assert`, a minimal fake React, and a fake DOM to drive `client.js` directly:

```sh
node test/client.test.mjs
```

On success it prints `client.test.mjs: all checks passed`.

Covered: the registration contract for both seats, the expanded and folded stylesheets, click interception (blocking the shell, flipping, persisting), clicks elsewhere staying untouched, the live dictionary taking priority, label escaping, degradation without a dictionary or without storage, and the ownership and cleanup of the stylesheet and the listener.

## Layout

```text
dsh-entry-drawer/
├── package.json         # package metadata; dsh.bundle and dsh.client declarations
├── cordis.patch.yml     # inserts the row with id entry-drawer into the plugin tree
├── index.js             # host half: empty
├── client.js            # client half: all the logic
├── icon.svg             # plugin icon
├── locale/
│   ├── zh.json          # Chinese title and description for the plugin entry
│   └── en.json          # the same in English
├── test/
│   └── client.test.mjs  # behaviour tests
├── README.md
└── README.en.md
```

## License

MIT.
