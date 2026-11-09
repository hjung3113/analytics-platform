# AGENTS.md — site

The in-house adoption intro page. Not product code. Use only static HTML/CSS/classic JS outside the pnpm workspace; add no workspace package imports, external CDN, fetch or analytics scripts.

## Content rules

- Every fact and number maps to a row in SOURCES.md. Add the ledger row before a new claim. Mark synthetic values as examples.
- Titles, cards, diagrams and summaries are noun phrases with the key term first (#1057). Behaviour, accuracy and constraint explanations are short `~합니다` fact sentences. A title is a feature name (GLOSSARY term) or what the user can do, not a technology name. Things that do not work yet read «아직 안 됨 → 예정 #n». No advertising or contrast rhetoric (#607).
- Describe what the platform supports as features; write «예정 #n» only for menus not yet declared. Never state «현재 X 메뉴만» as the representative fact (owner decision).
- On-screen words use `GLOSSARY.md` names (`공간`→업무 시스템, `조회 범위`→Scope, `실어댑터`→서버 어댑터, `레일`→시스템 레일, …). Code names (`Space`) appear only in the developer appendix.
- `glossary.html` follows the term names and meanings of `GLOSSARY.md` in the site voice (`~합니다`, no ADR or section numbers, one or two sentences per term).
- Colors, fonts and radii consume the product tokens. Do not duplicate values; `site.css` holds no color literal.
- Publishing before the maintenance issue is resolved needs `--assumption`. Keep executed pass counts and declared test counts apart.
- The demo links D1–D10 are checked one by one in a browser on the deployed demo before publishing. Render no link when there is no demo.
- The D1–D10 instruction sentences exist only in `<template id="demo-step-copy">` at the end of `index.html`; assembly plants them into each `demo-link`'s empty `<p data-demo-step="D#">`. Never edit the copies by hand.
- AI-tell check: before copy or decks go to the owner, a worker who did not write them reviews them. Sentences: `korean-humanizer` (detect only; fix every S1) and `copy-plain-ko`. Screen/slide shape: `design-deslop`. The report keeps the evidence lines and fixes. Reason: a decision maker who reads the material as AI-made stops trusting the content.
- `presentation/intro.html` is the owner's offline standalone HTML from Claude Design (no external requests), inserted as is. Do not rewrite or edit it; replace the whole file at the same path for a new version. Ledger, glossary, voice rules and the assembled check do not apply to it. Reason: it is the owner's own deck and the intro page only links to it.

## Build and check

- Assemble: `node site/scripts/assemble.mjs --out "$TMPDIR/ap-site" --site-base / --assumption`. Preview: `python3 -m http.server -d "$TMPDIR/ap-site" 8080` → `http://127.0.0.1:8080/`.
- Assemble arguments:
  - `--out` (required, a new empty folder)
  - `--site-base` (deploy path starting and ending with `/`, default `/analytics-platform/`)
  - `--demo <dist>` (copies the mock demo build to `demo/`)
  - `--shots <capture folder>` (`shots.mjs` output; without it the capture slots are removed)
  - `--ref`, `--commit` (source link and footer)
  - `--assumption`
  - Static images `assets/**` are copied whole.
- `assemble.mjs` stops when `--shots` is given but a capture the body requires is missing.
- Assembled check: `node site/scripts/check-assembled.mjs --site <assembled folder> --captures <shots.mjs output folder> --browser`. It checks that every required capture is in both the capture folder and the assembly, duplicate ids and anchors, forbidden terms (code characters included; allowed code names are printed), and horizontal scroll at 1440/390.

## Captures

- Only `scripts/shots.mjs` and `scripts/shots-real.mjs` borrow the e2e package's Playwright runtime (not a site runtime dependency).
- Pages CI shoots only the mock demo with `shots.mjs` (no server). The PR CI job `Intro site captures` (`ci.yml`, not a required check) runs build → capture → assemble → `check-assembled.mjs --browser` on every main push and every PR touching what captures depend on, to catch broken captures before deploy (#608). Depended paths: menus, packages, `apps/platform-web`, `site`, `tooling`, `patches`, feature sources (`apps/{platform-api,feature-screens}`), root manifests and lockfile, `GLOSSARY.md`; the source is `ci.yml` `changes`.
- Screens that need the core server (platform-menu notifications, surveys, my VOC; the VOC registration drawer's compose view) are shot by hand with `scripts/shots-real.mjs` and committed as JPEG under `assets/real/`:
  1. `AP_BACKEND_ORIGIN=<core server> pnpm --filter @ap/platform-web exec vite --mode real --host 127.0.0.1 --port <port> --strictPort`
  2. `node site/scripts/shots-real.mjs --url http://127.0.0.1:<port> --out site/assets/real`
  - Shoot at scale 2 on a throwaway DB holding the seed persona (`mock-user-2`) and Korean example data, cropped to the topic box. The script enforces the 1.5 MB total cap and the test-marker check (`[preview]`, `[seed]`).
  - Caption `실서버 모드 · 예시 데이터` and add a ledger row.
