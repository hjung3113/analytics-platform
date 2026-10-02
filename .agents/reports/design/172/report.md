# #172 prototype report — table toolbar copy + XLSX export, 3 variants

Branch `hjung3113/prototype-table-export` (this worktree, not committed — coordinator commits).

172-PROTO-DONE

## Files changed

| File | Change |
|---|---|
| `packages/components/package.json` | + `write-excel-file@^4.1.1` (pnpm-lock.yaml updated) |
| `packages/components/src/prototypeTableExport.tsx` | **new** — THROWAWAY: variant resolution (URL → sessionStorage fallback), serializer (CSV RFC 4180/BOM/CRLF, TSV, XLSX), download/clipboard helpers, variant toolbar pieces A/B/C |
| `packages/components/src/PlatformDataTable.tsx` | new optional prop `exportRows`; when `?variant=` present + `exportRows` given, toolbar/selection strip render variant A/B/C; `Ctrl/⌘+C` copy handler on the table section; toasts |
| `packages/components/src/index.ts` | re-export prototype module (switcher chrome reads it) |
| `packages/ui/src/index.ts` | re-export `isProductionEnv` (existing gate in `Button.tsx`, used by the switcher) |
| `menus/equipment/src/pages/EquipmentMaster.tsx` | passes `exportRows={signal => list.fetch({ q, status, maker }, signal)}` |
| `apps/platform-web/src/dev/TableExportVariantSwitcher.tsx` | **new** — THROWAWAY dev-only switcher pill (←/→ keys + buttons, × drops `?variant` and clears sessionStorage) |
| `apps/platform-web/src/main.tsx` | mounts `<TableExportVariantSwitcher />` inside `PlatformProvider` after `AppShell` |

Every prototype file carries the top comment `THROWAWAY prototype for #172 — do not merge`.

## How to run

```sh
pnpm install
pnpm --filter @ap/platform-web exec vite --host 127.0.0.1 --port 5190 --strictPort
# open http://127.0.0.1:5190/equipment?v=1&scopeId=ICH&variant=A   (B, C, or no ?variant)
```

Driver scripts (throwaway, kept as measurement record): `.review/172-shots.mjs` (screenshots + downloads + clipboard), `.review/172-followup.mjs` (timing probe). Playwright chromium from `apps/platform-e2e`, `platform:role`=`"engineer"` via addInitScript, 1440×900, `clipboard-read`/`clipboard-write` granted.

Variant URLs: `…&variant=A`, `…&variant=B`, `…&variant=C`, none = `…/equipment?v=1&scopeId=ICH`.

## Screenshots (`.review/shots-172/`, 1440×900)

- `none.png` — no `?variant`: today's toolbar (컬럼 + 내보내기 plain button, no menu, no strip) — unchanged, plus the dev-only switcher pill showing "변형 없음".
- `A-1-noselection.png`, `A-2-selected.png`, `A-3-menu-open.png` — one export menu; header "선택 3행" / "필터 결과 전체 38행"; items Excel (.xlsx) / CSV / 클립보드에 복사 (엑셀 붙여넣기용).
- `B-1-noselection.png` (split button [Excel|▾]), `B-2-selected.png` (strip gains [복사][Excel][CSV]; toolbar split hidden), + `B-3` covered by `B-1` menu interaction (▾ opens CSV item; download measured).
- `C-1-noselection.png` ([복사] disabled + [내보내기 ▾], strip "내보내기 대상: 필터 결과 38행"), `C-2-selected.png` (strip "내보내기 대상: 선택 3행 (필터 결과 38행 중)", 복사 enabled), `C-3-menu-open.png`.

## Results (measured via `page.waitForEvent('download')` + clipboard reads)

Filtered total in the default context: **38 rows** (matches the table's "38건"). Selected = 3 checked rows. XLSX rows counted from `xl/worksheets/sheet1.xml` `<row>` elements minus header; CSV from CRLF lines minus header. All variants share one code path, counts identical across A/B/C:

| Scope | XLSX data rows | CSV data rows |
|---|---|---|
| selected (3행) | 3 | 3 |
| all filtered | 38 | 38 |

CSV check: UTF-8 BOM (`EF BB BF`) + CRLF + RFC 4180 quoting (only when needed). Clipboard TSV first 2 lines (identical for A ⌘C, A menu copy, B 복사, C 복사):

```
설비 ID	설비명	room_name	라인	StGroup	분임조	Maker	Model	챔버 유형	상태	유효 시작	유효 종료	변경 시각	변경자
ICH-PHOTO-0103	PHOTO Lithius-Pro #1	PH-101	L2	STG-PHOTO-A	분임조 A1	TEL	Lithius-Pro	PH-C	active	2025-12-24T00:00:00		2026-09-14T10:32:00	lee.s
```

Toasts observed: `복사: 선택 행 3건 클립보드에 복사했습니다.`, `CSV: 필터된 전체 결과 38건 내보내기`, `Excel(.xlsx): 필터된 전체 결과 38건 내보내기` (count + scope in ko/en).

## Behaviour checks

- `?variant` absent: legacy `내보내기` button unchanged (`aria-haspopup` absent — verified), no strip, no keyboard handler (section `onKeyDown` gated on variant).
- Variant survives navigation: after 상태 filter change and 페이지 2, URL kept `variant=A` (`…&status=active&page=2&variant=A`) — the kernel keeps unknown keys as `extras`. sessionStorage fallback exists for navigations that drop it; × clears both (verified `sessionStorage` key `platform:prototype:172:variant` = null after ×).
- Switcher: `→` A→B, `←` B→A (replace navigation), pill label per variant, dev-only via the `isProductionEnv` gate (repo's bundler-neutral pattern from `@ap/ui` Button; equivalent to `import.meta.env.DEV`, no vite/client types in this app).
- Keyboard/a11y: Radix menus are keyboard reachable with visible focus; icon-only split arrow has `aria-label="CSV로 내보내기"`; C strip is `aria-live="polite"`; ⌘C verified with focus inside the table and ignored in inputs (guard).

## What did not work / notes

- Driver-side only: the first clipboard reads raced the mock server's per-request `sleep(350ms)` (`validateScope`) — an instrumented re-probe shows the menu copy completes with the full 4-line TSV (498 chars) + correct toast, no console errors. The fixed 400 ms waits in the driver were the problem, not the prototype.
- The switcher pill is visible in dev even without `?variant` (it is the required prototype chrome; the page UI itself is unchanged — see `none.png`). The × button is the way back from a variant.
- `grep -c $'\r'` undercounts a CRLF file by one (last line carries `\r` but `grep -c` counts lines) — first count printout was off by one; corrected above (verified against XLSX sheet rows and the UI total).
- Not done (by design, prototype budget): no tests, minimal error handling, file names fixed (`equipment-master.csv/.xlsx`), export UI not gated by `features.export` registry flag when a variant is active (host menu declares export anyway). Real implementations land in #173/#174.

## Variant D — 고정 툴바 + 메뉴에서 대상 선택 (user decision 2026-10-02, per `.review/spec-172d.md`, UX review 추천 반영)

D was added to the same THROWAWAY prototype (branch `hjung3113/prototype-table-export`, this worktree, not committed). A/B/C verified still working after the shared-runner change (see below). Dev server for this step: the already-running `http://127.0.0.1:5180` (not restarted, not stopped).

### Files changed (D step)

| File | Change |
|---|---|
| `packages/components/src/prototypeTableExport.tsx` | `TableExportVariant`/`TABLE_EXPORT_VARIANTS` + label `D — 고정 툴바 + 메뉴에서 대상 선택 (추천)`; **new `ExportToolbarD`** — [복사] (selected-only, `aria-disabled` + Tooltip) and [내보내기 ▾] (target groups inside the menu); D-only menu-item focus classes + `shadow-none border-border-strong` on the content (shared primitive untouched) |
| `packages/components/src/PlatformDataTable.tsx` | Runner is now explicit-target: `runPrototypeExport(format, 'selected' \| 'filtered')`; A/C call it with their previous inferred target, B split with `'filtered'`, B strip with `'selected'`; D passes the menu-chosen target. Completion toasts unified to "…행" units + "Excel" naming (see toasts below — this wording is shared by A/B/C/D). `Ctrl/⌘+C` no longer intercepts when `window.getSelection()?.toString()` is non-empty (UX review 필수 수정 2). `?variant=A\|B\|C\|D` |
| `apps/platform-web/src/dev/TableExportVariantSwitcher.tsx` | cycle A→B→C→D; hardcoded `1/3` → `/{TABLE_EXPORT_VARIANTS.length}` (now `4/4`) |
| `.review/172d-shots.mjs`, `.review/172d-results.json` | throwaway driver + raw measured record for this step |

`pnpm --filter @ap/components typecheck` + `lint`, `pnpm --filter @ap/platform-web typecheck` — all pass (memory budget: no tests/build/e2e).

### Screenshots (`.review/shots-172/`, 1440×900)

- `D-1-noselection.png` — toolbar [컬럼] [복사] [내보내기 ▾], no target strip, totals line "38건 · 1/2 페이지" untouched, pill "D — … (추천) 4/4".
- `D-2-selected.png` — 복사 label becomes "3행 복사", `aria-disabled` removed.
- `D-3-menu-noselection.png` — one group "필터 결과 전체 38행": Excel (.xlsx) → CSV.
- `D-4-menu-selected.png` — two groups "선택 3행" / "필터 결과 전체 38행" with a separator between; first item shows the visible focus background (keyboard ArrowDown).
- `D-5-copy-tooltip.png` — keyboard-focused (focus ring visible, NOT `disabled`) 복사 with Tooltip "행을 선택하면 복사할 수 있습니다".

### Results (measured via `.review/172d-shots.mjs` → `172d-results.json`; driver from `apps/platform-e2e` chromium, clipboard permissions granted, `platform:role="engineer"`)

| Scope (3 rows selected) | XLSX data rows | CSV data rows |
|---|---|---|
| selected — **exported without clearing selection afterwards** | 3 | 3 |
| all filtered — **selection still "3개 선택" before and after** | 38 | 38 |

Counts from `xl/worksheets/sheet1.xml` `<row>` elements / CRLF lines, minus header.

Clipboard TSV first 2 lines — identical via [3행 복사] button and via ⌘C with focus in the table (4 TSV lines incl. header):

```
설비 ID	설비명	room_name	라인	StGroup	분임조	Maker	Model	챔버 유형	상태	유효 시작	유효 종료	변경 시각	변경자
ICH-PHOTO-0103	PHOTO Lithius-Pro #1	PH-101	L2	STG-PHOTO-A	분임조 A1	TEL	Lithius-Pro	PH-C	active	2025-12-24T00:00:00		2026-09-14T10:32:00	lee.s
```

Completion toasts observed (units unified to 행/Excel — shared runner, so A/B/C now emit the same shape): `선택 3행을 복사했습니다 — 엑셀에 붙여넣을 수 있습니다` (button and ⌘C), `선택 3행을 Excel 파일로 내보냈습니다`, `선택 3행을 CSV 파일로 내보냈습니다`, `필터 결과 전체 38행을 Excel 파일로 내보냈습니다`, `필터 결과 전체 38행을 CSV 파일로 내보냈습니다`.

### Behaviour checks (measured)

- Fixed toolbar order [컬럼][복사][내보내기 ▾] (the page's own filter-reset button precedes them); no extra target strip on D.
- 복사 without selection: `aria-disabled="true"`, native `disabled=false`, Tab/focus() reachable (focus ring visible in `D-5`), click is a no-op — clipboard sentinel unchanged, zero new toasts after the click.
- Tooltip via `@ap/ui` Tooltip (TooltipProvider scoped to D): shown on hover AND keyboard focus, text "행을 선택하면 복사할 수 있습니다".
- Menu item accessible names carry the target: `선택 3행을 Excel(.xlsx)로 내보내기`, `선택 3행을 CSV로 내보내기`, `필터 결과 전체 38행을 Excel(.xlsx)로 내보내기`, `필터 결과 전체 38행을 CSV로 내보내기` (en: "Export 3 selected rows as …").
- Visible item focus measured: focused item `background-color: rgb(239, 246, 255)` (= accent-primary-soft) vs transparent on the others — D-only classes, shared primitive untouched.
- No drop shadow: menu `box-shadow` computed as transparent/none; 1px `border` in border-strong colour.
- Busy: both triggers show `Loader2 animate-spin` and are disabled while the export runs (observed within the mock's ~350 ms window).
- Escape closes the menu and returns focus to the 내보내기 trigger.
- ⌘C with a text selection inside a cell ("ICH-PHOTO-0103" selected): NOT intercepted — clipboard received exactly the selected text, no prototype copy toast; ⌘C with rows selected (no text selection) still copies the 3-row TSV.
- Switcher: D label + `4/4`; `→` wraps D→A, `←` back A→D.
- A/B/C regression after the runner change: A menu items unchanged and menu copy works (toast `선택 3행을 복사했습니다 — …`); B strip CSV downloads with selected target (`선택 3행을 CSV 파일로 내보냈습니다`); C 복사 natively disabled without selection, C export downloads selected XLSX; legacy (no `?variant`, fresh context) — plain `내보내기` button, no `aria-haspopup`, no strip.

### Notes / did not work first time

- Radix Tooltip stays open if the pointer teleports away in one hop (grace-area boundary events skipped); the driver moves in steps. App behaviour is correct with real pointer paths.
- Playwright's actionability treats `aria-disabled="true"` as not enabled, so the no-op click test uses `click({ force: true })` — a real user's click lands on the button and is ignored by the component, which is the verified behaviour.
- Spec item 5's "unify" applies to the shared runner, so A/B/C completion toasts now also use 행/Excel wording (previously "선택 행 3건", "Excel(.xlsx): … 38건"). Their triggers/flows are otherwise unchanged; B/C screenshots from the earlier step predate the wording change.
- The first D-4 screenshot carried the text-selection highlight from the ⌘C non-interception test; the driver now clears the DOM selection before that shot (regenerated).
- Driver + raw output kept as measurement record: `.review/172d-shots.mjs`, `.review/172d-results.json`.

172D-DONE
