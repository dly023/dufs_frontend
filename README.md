# dufs-solid

A media-first frontend for [dufs](https://github.com/sigoden/dufs), built as a static SPA for `dufs --assets`.
Svelte 5 (runes) + Vite + TypeScript. No CSS framework, no web fonts, no runtime UI library.

## Run

```bash
npm install
npm run dev:dufs   # dufs ./dev-data on :5001
npm run dev        # http://127.0.0.1:5180 → proxies dufs
```

Protected server: `DUFS_ORIGIN=http://127.0.0.1:5002 npm run dev`.

## Deploy

```bash
npm run build      # → dist/ (assets/index.js + assets/index.css, dufs naming)
dufs /data --allow-all --assets ./dist
```

dufs injects `__ASSETS_PREFIX__` / `__INDEX_DATA__`; `after-build.js` prepares the placeholders.

## Configuration

Branding without a rebuild: edit the deployed `dist/index.html` and define `window.__DUFS_CONFIG__`
in a `<script>` before the app bundle (a commented example ships in `index.html`). Every key is optional;
invalid values are ignored with one console warning.

```html
<script>
  window.__DUFS_CONFIG__ = {
    title: "我的网盘",          // replaces the host at the end of the tab title: "photos — 我的网盘"
    accentHue: 215,             // 0–360, OKLCH hue; the whole accent family follows (buttons, selection, focus)
    footer: "[京ICP备XXXXXXXX号-X](https://beian.miit.gov.cn/)", // Markdown, quiet footer under every listing
    defaultView: "gallery",     // "gallery" | "grid" | "list" — until the visitor picks one
    defaultTheme: "system",     // "system" | "light" | "dark" | "oled" — until the visitor picks one
  };
</script>
```

Defaults never override a visitor's saved choice and are not persisted, so changing them later still reaches
visitors who never chose. The site title stays in the tab title only — the UI itself names the root 根目录, so a
long brand never competes with the path. The favicon keeps the dufs wordmark.

## Layout

```
src/
  styles/        tokens · base · controls · overlays · markdown (global only)
  shell/         TopBar · Sidebar · DirHeader (also the selection bar)
  views/         Gallery / Grid / List + shared Tile and delegated itemEvents
  readers/       PreviewPane · FullPreview + ImageStage · ComicReader
  components/    dialogs, menus, palette, toasts, uploads, Icon
  lib/           dufs client, models, icons, motion (View Transitions)
  stores/        runes stores (directory, selection, prefs, auth, …)
  actions/       file operations + URL navigation
```

Component styles live in each component's `<style>`; `styles/` holds only tokens and shared controls.

## Design rules

- **Tokens only.** Colors (OKLCH), type scale, spacing (4px grid), radii, shadows and durations come from
  `styles/tokens.css`. The accent is one knob: `--accent-h`.
- **Two button families.** `.btn` (+ `-primary` / `-ghost` / `-danger` / `-sm`) and `.icon-btn`. One `.check`,
  one `.seg`, one `.menu`.
- **Resident over hover.** Checkboxes and list-row tools stay visible for alignment and discoverability; only the
  tools floating over thumbnails wait for hover, so pictures stay clean.
- **Motion is compositor-only** (transform / opacity / View Transitions) and disabled under
  `prefers-reduced-motion`. `lib/motion.ts` degrades to instant updates where unsupported.

## Small things worth knowing

- Thumbnails morph into the viewer and back (shared-element View Transition).
- Theme changes reveal from the button you pressed.
- Going up a level briefly highlights the folder you came from.
- The tab title follows context: file + position, selection count, search, upload progress (`↑ 42%`).
- Comic reader remembers your page per folder; Space pages a screen at a time.
- `/` focuses search, `⌘K` jumps to recent places or commands, `?` lists shortcuts, Esc peels one layer at a time.
- Touch: long-press starts a selection; while selecting, taps add or remove items.

## Credits

The `dufs` wordmark in the favicon is drawn from **Comfortaa** (Johan Aakerlund), SIL Open Font License 1.1,
converted to outlines and emboldened; the dots over `u` and `s` follow the original dufs logo.
