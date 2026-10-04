# M2 chart / drawer prototype

THROWAWAY branch `hjung3113/proto-m2-chart-drawer`; never merge to main. Questions #203/#195 stay independent. No winner has been chosen.

This README is staged in `.review/m2-chart-drawer-README.md` because the sandbox denies writes below `.agents`. Coordinator: copy it to `.agents/reports/design/shots/m2-chart-drawer/README.md` before screenshot capture.

## Variants

- Q1: A current colours; B1 light darkening; B2 medium; B3 strong. Prototype-only stroke aliases for blue, teal and purple. Bars, area fills, point fills and category colours unchanged. Legend swatches follow line strokes. P50 stays solid/P95 dashed; previous-period series retain dashed styling. Productivity's current P95 was solid and is made dashed within the prototype (including A) to satisfy the spec. Green has no current thin-line consumer.
- Q2: A existing overlay (wide non-modal with 32rem main reservation; narrow modal). B full-height shell-owned right aside, 440px default, bounded 360–520px, pushing main. C docked at ≥1440px, existing overlay below. Content and focus/tab page-key callbacks shared.

## Run

From repository root: `pnpm dev`, then open:

- `http://127.0.0.1:5173/analytics/cycle-time?v=1&scopeId=ICH&variant=A` (also B1/B2/B3).
- `http://127.0.0.1:5173/analytics/productivity?v=1&scopeId=ICH&variant=B2` (select KPI to see each trend).
- `http://127.0.0.1:5173/equipment?v=1&scopeId=ICH&focus=ICH-PHOTO-0103&variant=A` (also B/C).

Bottom bar names the current question and variant. Buttons and ←/→ wrap through choices. Typing, modifiers and keyboard-managed tabs/menus/listboxes retain their arrows. Bar is portaled outside the inert app root so narrow overlays stay switchable. Prototype wrapper/bar disabled in production.

Entry `?variant=` is captured before Kernel canonicalization. Separate versioned localStorage keys `platform:proto-m2:v1:chart` and `platform:proto-m2:v1:detail` survive Kernel navigation; both chart routes share Q1. Switching replaces only variant in the visible URL and preserves history state and page keys. Kernel can drop variant during navigation without losing preference. Explicit `variant=A` resets a question.

## Contrast

WCAG opaque sRGB: channel c/12.92 when c≤0.04045, otherwise ((c+0.055)/1.055)^2.4; luminance 0.2126R+0.7152G+0.0722B; contrast (Llight+0.05)/(Ldark+0.05). Values rounded to three decimals; all candidate ratios pass unrounded assertions ≥3. Minimum candidate ratio 3.165:1. Baseline A is not required to pass.

| Variant | Family | Stroke | Card #fbfdff | Canvas #f3f7fe | Sunken #edf3fb |
| --- | --- | --- | --- | --- | --- |
| A | blue | `#3b9cff` | 2.789:1 | 2.647:1 | 2.547:1 |
| A | teal | `#00a3b5` | 2.982:1 | 2.830:1 | 2.724:1 |
| A | purple | `#a174f5` | 3.253:1 | 3.087:1 | 2.971:1 |
| B1 | blue | `#2f8be5` | 3.464:1 | 3.288:1 | 3.165:1 |
| B1 | teal | `#0093a3` | 3.612:1 | 3.428:1 | 3.299:1 |
| B1 | purple | `#9367e2` | 3.902:1 | 3.703:1 | 3.564:1 |
| B2 | blue | `#2577cc` | 4.488:1 | 4.259:1 | 4.100:1 |
| B2 | teal | `#008090` | 4.587:1 | 4.353:1 | 4.190:1 |
| B2 | purple | `#8154ce` | 5.032:1 | 4.776:1 | 4.597:1 |
| B3 | blue | `#1d64b3` | 5.841:1 | 5.543:1 | 5.336:1 |
| B3 | teal | `#006d7c` | 5.921:1 | 5.619:1 | 5.409:1 |
| B3 | purple | `#6e42b8` | 6.571:1 | 6.236:1 | 6.002:1 |

## Coordinator browser checklist

- Capture all Q1 variants with identical context/data on cycle-time and productivity. Inspect blue/teal/purple strokes, matching legends, P50 solid/P95 dashed; unchanged bars/histogram/area/category/point fills. Check Compare, Zoom, Brush and same-data table.
- Capture equipment A/B/C at 1280px and 1600px. Resize C across 1439/1440px; B remains docked below breakpoint. Verify full-height aside beside main, 440px default and inherited variable, 360–520 bounds, independent detail scrolling and table reflow; no old overlay padding in docked mode.
- Deep link focus/tab, change tabs, close with X/Esc, reopen via row View, reload and Back/Forward. Closing clears focus through existing consumer callback; tab retains existing semantics. Check selected tab/content on switch and resize, overlay trap, docked main access, focus relocation and return to opener.
- Switcher wrap/click/key handling and typing exclusions; usability while narrow overlay modal; share/reload URLs; independent localStorage choices across Kernel navigation and between chart routes.

Worker did not run a dev server/browser or capture screenshots, per spec. Screenshots and rendered validation remain coordinator-owned.
