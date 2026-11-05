# dsh-entry-drawer

[简体中文](README.md) · **English** · [Install](#install) · [How it works](#how-it-works) · [Known limits](#known-limits) · [License](#license)

[![License: MIT](https://img.shields.io/badge/license-MIT-2EA44F?style=flat-square)](LICENSE)
[![npm](https://img.shields.io/npm/v/dsh-entry-drawer?style=flat-square)](https://www.npmjs.com/package/dsh-entry-drawer)
[![release](https://img.shields.io/github/v/tag/xingzhen199186/dsh-entry-drawer?style=flat-square&label=release)](https://github.com/xingzhen199186/dsh-entry-drawer/releases)
[![DSH plugin](https://img.shields.io/badge/DSH%20plugin-dsh--plugin-3f8cff?style=flat-square)](https://github.com/topics/dsh-plugin)
![dsh 0.2.x](https://img.shields.io/badge/dsh-0.2.x-2f6f4f?style=flat-square)
![no build step](https://img.shields.io/badge/build%20step-none-7da1de?style=flat-square)

> The sidebar's entry list grows with every plugin you install, and the session history keeps giving up room. This plugin turns the list's first row into a switch: one click folds every other entry away, click again and everything comes back.

## Why it exists

The upper half of the DSH sidebar is a list of global panel entries: plugins, the plugin market, scheduled tasks, remote windows, the task board, memory. Every plugin you install adds a row. The longer that list gets, the further down the session history slides — and the session history is the part you use all day.

The platform offers third-party plugins exactly one place to stand: `sidebar.panellist`, the sidebar's panel-list seat. A slot is a fixed position in the interface; a plugin may put its own content there, but not anyone else's. The shell — DSH's own interface framework, the thing the plugin runs inside — owns those rows' boxes, their height, and their click behaviour. There is also no built-in way to group the entries.

So this plugin adds no feature of its own. It borrows one seat to do one thing: put a row at the head of the list that folds the other rows away.

## What you see

Expanded (the default):

- Position: the first row of the sidebar entry list, directly above the session history.
- Content: a pair of upward chevrons and the label "Entry drawer" (in the Chinese interface: 入口收纳).
- Below it: every existing entry, unchanged.

Click the row:

- The other entries are hidden as one block. They stop taking up space; they do not just grey out.
- The session history moves up by several rows.
- The chevrons flip to point down, and the row stays where it is.

Click again: everything returns, and the chevrons point up again.

The choice is remembered. Reload the page or restart the desktop app and your last setting is still in effect.

One thing was checked on a real machine rather than assumed: on 2026-11-05, on desktop 0.2.1-rc.5, folding and unfolding both worked, and a third-party entry added afterwards was folded along with the rest — no reconfiguration of this plugin needed.

<img width="283" height="330" alt="Sidebar with the entry drawer expanded" src="https://github.com/user-attachments/assets/e53c49fa-663c-497f-9ea2-55674987f9cb" />

<img width="282" height="301" alt="Sidebar with the entry drawer folded" src="https://github.com/user-attachments/assets/1c44eba4-a1b9-4c13-8b25-62e34bdb9d6c" />

## Install

Requirements: DSH 0.2.x, plus a working Node.js and pnpm (`dsh plugin` is a thin pnpm wrapper).

**Option 1: install from npm (recommended)**

```sh
dsh plugin --profile web add dsh-entry-drawer
```

Replace `web` with the profile you actually use. The package name is `dsh-entry-drawer`; npm carries 0.1.0.

**Option 2: install from GitHub**

```sh
dsh plugin --profile web add github:xingzhen199186/dsh-entry-drawer
```

Use this to follow the latest code, or while npm has not caught up with a new version.

**Option 3: install from a local directory**

```sh
dsh plugin --profile web add ./dsh-entry-drawer
```

The plugin manager's "install from directory" does the same thing if you prefer pointing at the folder there. This route suits development: the profile records that directory's path, so moving or deleting it later stops the plugin from loading.

**Reload afterwards.** On the web, refresh the page. On the desktop app, restart it. The half that runs in the browser (`client.js`) only mounts when the window loads again, and the desktop app has no client-side hot reload by default.

**On the desktop app, prefer installing from inside the app.** Its profile is managed by the application itself, so a command-line write is normally refused (it reports that the profile is managed by the desktop app); that is not a permissions problem. Use the Plugins page there and enter the package name, the repository address, or the local folder.

## Uninstall

```sh
dsh plugin --profile web remove dsh-entry-drawer
```

Then reload the window. The folded preference stays behind, because it lives in the browser — see "Frequently asked" to clear it too.

## Compatibility

| Item | Detail |
| --- | --- |
| Targets | DSH 0.2.x, web and desktop |
| Tested on | Desktop 0.2.1-rc.5, 2026-11-05 |
| Shape | Client plugin (`dsh.client` declares `platform: "web"`), depends on `@deepseek-ai/dsh-client-ui-sidebar` |
| Deployments without a sidebar | Not loaded at all, headless for example |
| Where state lives | In the browser (cookie and localStorage); never in the profile, never in a config file |

## How it works

Three moving parts — a seat, a click interceptor, and one stylesheet rule — plus a safety net and one place to keep the preference.

### 1. The seat

The client half registers one row in the sidebar seat. `order: -1000` puts it at the head of the list:

```js
ctx.slots.inject('sidebar.panellist', () =>
  ctx.slots.register(
    { name: 'sidebar.panellist', id: 'entry-drawer', order: -1000, label },
    FoldGlyph,
  ),
)
```

What it draws inside that row is the switch itself: a `span` carrying the `.dsh-entry-drawer-mark` marker, wrapping the chevron icon. The label "Entry drawer" comes from the plugin's own zh/en dictionaries.

### 2. The click interceptor

The shell owns both the row box and the row click, so the plugin can rewrite neither. Instead it attaches one capture-phase click listener on `document` (capture phase: the part of event dispatch that travels inward from the outermost element, so the listener sees the click before the shell's own handler).

The match is deliberately narrow: the clicked element sits inside a `button`, and that `button` contains this plugin's marker. On a match it calls `preventDefault()` and `stopPropagation()`, so the shell's "select this panel" logic never runs; the plugin flips the fold state and saves it instead.

Exactly one listener is registered, and it lives and dies with the plugin. Clicks anywhere else in the sidebar are untouched.

### 3. The stylesheet

Folding is not done by editing the DOM (the tree of interface elements in the browser). It is expressed by a `<style>` element the plugin owns. While expanded, that stylesheet holds only the glyph's base styles. While folded, it gains one rule:

```css
nav[aria-label="Global panels"] > *:not(:has(.dsh-entry-drawer-mark)) { display: none !important }
```

Read it as: inside the `nav` whose accessible name is "Global panels" (`aria-label` is the name screen readers and automation tools use; DSH labels this navigation with it), hide every direct child that does not carry this plugin's marker. `:has()` is the browser's native "contains this element" test, and DSH runs in Chromium, so it is available.

The name is taken from the live locale dictionary first (`panels.label` in the `sidebar` namespace). When that is unavailable, the plugin falls back to the two names it knows, `全局面板` and `Global panels`, emitting a separate rule for each so both Chinese and English interfaces match. Names coming from the dictionary are escaped in code before they reach the selector, so they cannot break out into different CSS. The stylesheet is rebuilt when the interface language changes.

Each name needs its own rule, with the child selector spelled out for each one; combining them into a single comma list would hide the whole first navigation, switch included.

### 4. The safety-net panel

Besides the list row, the plugin registers an empty placeholder panel in `main` (the main content area) under the same id. The normal path never reaches it, because the click is already intercepted. But if some other route still selects that panel, it toggles the fold state on mount and then jumps back to the panel you were last looking at (or to no panel, if there is nothing to return to), rather than failing because the panel has no content.

### 5. Remembering the choice

Every toggle writes two places:

| Where | Key | What it is for |
| --- | --- | --- |
| cookie | `dsh-entry-drawer` | Across ports and restarts. The desktop app picks a new port on `127.0.0.1` at every launch, and browsers partition localStorage by scheme, host and port; cookies ignore the port |
| localStorage | `dsh-entry-drawer:collapsed` | The fast same-origin read |

The cookie (a small piece of text a browser stores for one site) lasts a year. Reading checks the cookie first and only falls back to localStorage, so an older same-origin value cannot override a newer choice made on a different port.

**The host half (`index.js`)** is empty: `apply()` does nothing. It exists so the package has a selectable, inspectable, removable entry in the plugin tree. All behaviour lives in the client.

## Known limits

The items below are the real situation, not boilerplate.

- **It depends on the navigation's accessible name.** The rule locates the list via `nav[aria-label=...]`. If upstream renames it, or stops using a `nav` element, the plugin fails quietly: folding simply stops working, and nothing else gets hidden by mistake. The fix is to update `KNOWN_NAV_LABELS` in `client.js`.
- **The click interceptor sits outside React.** It keys off the structure "a `button` containing this plugin's marker" (React is the interface library DSH uses, and it manages its own updates). If upstream changes the row structure, interception degrades: the click falls through to the shell and selects that one panel. The safety-net panel returns you to the previous panel, but what you experience is "the click did nothing" rather than "it folded".
- **Folding hides the whole group.** The official entries — plugins, scheduled tasks, more — disappear along with the third-party ones, because they share one list. They return on expand. Hiding only third-party entries is not possible from this seat.
- **A narrow sidebar has nothing to fold.** When the Windows desktop app collapses the sidebar into a rail, the entire entry list is already hidden, and the plugin changes nothing.
- **Local-directory installs are fragile.** With `add ./dir`, the profile records that directory's path. Move or delete the folder later and the client half fails to load. For long-term use, install from git, or leave the directory where it is.
- **State is per browser.** Switching browsers, switching the host name (for example from `127.0.0.1` to `localhost`), or clearing site data returns you to expanded. Several windows share one storage entry, but the plugin does not listen for `storage` events, so after one window toggles, another needs a reload to catch up.

## Frequently asked

**I clicked the row and all the entries vanished. How do I get them back?**
Click the same row again. It never goes away; it is the switch.

**Folding worked, but clicking no longer brings the entries back.**
Usually upstream changed the row structure and that one click fell through to the shell. The folded state lives in the cookie, so reloading does not undo it — run `document.cookie = 'dsh-entry-drawer=0; path=/'` in the console and reload, or clear this site's data.

**Why does the desktop app remember after a restart, while a different browser does not?**
A desktop restart only changes the port, and the cookie ignores the port, so the choice survives. A different browser, a different host name, or cleared site data is a different storage box, empty on both sides, so you start expanded.

**Will it interfere with other sidebar plugins?**
It changes neither their code nor their state. Rows that live in the same list are folded along with the rest and come back on expand; the rest of the sidebar and the main content area are untouched.

**Can it fold only third-party entries and keep the official ones?**
No. They live in the same list, and from this seat the group can only be hidden as a whole.

## Development and tests

There is no build step; it is plain JavaScript. The client half is a `window.__ModuleLoader__.load({ id, factory })` module, and the host half is ordinary ESM exporting an empty `apply()`.

The test needs no browser and no dependencies: Node's built-in `assert`, a minimal fake React, and a fake DOM drive `client.js` directly.

```sh
node test/client.test.mjs
```

On success it prints `client.test.mjs: all checks passed`.

Covered: the registration contract for both seats, the expanded and folded stylesheets, click interception (blocking the shell, flipping, persisting), clicks elsewhere staying untouched, the live dictionary taking priority, label escaping, degradation without a dictionary or without storage, and the ownership and cleanup of the stylesheet and the listener.

After editing `client.js`, reload the window; on the desktop app, restart it — the desktop build does not follow source changes by default.

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
├── LICENSE
├── README.md
└── README.en.md
```

## License

MIT, see [LICENSE](LICENSE).
