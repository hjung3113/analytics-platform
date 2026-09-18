# Dashboard / Home — Design Spec

Target artboard: `Home.dc.html`, same canvas, same frame size as `Main.dc.html` (1440×900 viewport idiom).
Reuses the exact token block and component classes already in `Main.dc.html` (`.topbar`, `.navpill`, `.panel`, `.badge-*`, `.chip`, `.btn`, `.kv`, `.mono`, `.icon`). **No new tokens, no new radii, no new colors.** Two new component classes only: `.funnel` and `.cov` (specified in §9).

---

## 0. Decisions up front

| Question | Decision | Why |
|---|---|---|
| Is Home a 6th nav item? | **No.** Home is the app root (`/`), the post-login default view, reached by clicking the brand lockup (brand-mark + "Standard Log Lifecycle") in the topbar. On Home the brand lockup gets `color: var(--accent)` on the wordmark; all 5 nav pills are inactive. | `INFORMATION_ARCHITECTURE.md` §1 states 기본 업무 Navigation은 5개로 제한한다. Adding a pill breaks a documented constraint. Brand-as-home is the standard dense-enterprise pattern and costs zero nav width. |
| Process breakdown chart type | **Horizontal stacked/progress bars inside a compact table**, not a pie. | A pie can encode only one quantity per slice. The metric here is two quantities per process (onboarded vs. external total) — i.e. a *completion against a denominator*, which is a bar/progress form, not a part-of-whole form. A pie would also need a legend, can't carry the "N of M" mono numbers, and can't be row-clicked to filter. Bars sit in a 320px rail and read at a glance in both themes. |
| Pipeline funnel shape | **4 fixed-width equal columns with a blocked branch under Alpha and Beta**, not a width-proportional funnel. | Complete (42) is 14× Kickoff (3). A proportional funnel would collapse Kickoff/Alpha to a sliver. Equal columns + large mono counts preserve comparability and match the ASCII sketch already in `UI_WIREFRAMES.md` §8. |
| KPI tiles | **One 40px inline attention strip, three numbers, all of them links to filtered lists.** No KPI card row. | `UI_RESEARCH.md` §9.5 "Avoid Dashboard Overload" — 첫 화면을 KPI 카드로 채우지 않는다. |

---

## 1. Page structure

```text
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ A  Topbar                                                                  52px       │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ B  Page header  "Home"                       [내 모델 ▾] [Period ▾]        32px       │
│ C  Attention strip  Blocked 5 · Overdue 2 · 승인 대기 2                    40px       │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ D  Models requiring attention                     full width, 4 rows × 42px           │
├──────────────────────────────────────────────────┬────────────────────────────────────┤
│ E  Development Pipeline            flex:1        │ G  Onboarding Coverage   320px     │
│                                                  ├────────────────────────────────────┤
│ F  Stage Milestones                flex:1        │ H  Coverage by Process   320px     │
│                                    6 rows × 42px │                                    │
└──────────────────────────────────────────────────┴────────────────────────────────────┘
```

Container: `padding: 20px 28px`, `max-width: 1440px`, main row is `display:flex; gap:22px; align-items:flex-start` (identical idiom to `ModelDetail.dc.html`, which uses a 300px rail — Home uses 320px because the coverage bars need it). Vertical gap between panels `16px`.

Reading order is deliberate: **blockers → pipeline → per-model dates → coverage**. Coverage (the requested "N of M" numbers) is real but is *reference*, so it lives in the rail, not at the top. Putting it at the top would make this a vanity dashboard and violate the core principle.

---

## 2. Region A — Topbar (52px)

Identical markup to `Main.dc.html` topbar. Two changes:

- Brand lockup is a link to `/`. On Home the wordmark is `color: var(--accent); font-weight:600`; brand-mark unchanged.
- All 5 pills render in the default (inactive) state — no pill carries `.active`.
- Right side: existing `.avatar`, unchanged.

---

## 3. Region B — Page header (32px)

```text
Home                                              [담당자: 전체 ▾]  [기준일 2026-09-13]
```

- Left: `font-size:18px; font-weight:600` — "Home". Matches the "Models" title in `Main.dc.html`.
- Right: one `.chip` filter — **담당자: 전체 ▾** (options: 전체 / 내 모델 / Kim / Lee / Park / Choi). Selecting a person re-scopes regions C, D, F only. E, G, H stay org-wide and show a `.badge-neutral` "전체" tag when the filter is not 전체, so no one misreads a filtered funnel.
- Far right: static text `기준일 2026-09-13` in `.mono`, `var(--text-tertiary)`, 11.5px. No period dropdown — the product has no trend chart on this page, so a period picker would be a dead control.

---

## 4. Region C — Attention strip (40px)

Not cards. One horizontal row, `display:flex; gap:0`, inside a single `.panel` with `padding:0 4px`, each item `padding:10px 16px`, divided by `border-left:1px solid var(--border)` from the second item on.

Each item: count in `.mono`, 17px, 600, colored by severity; label 12px `var(--text-secondary)`; whole item is a link.

| Item | Value | Color | Links to |
|---|---|---|---|
| Blocked | **5** | `var(--fail)` | Models list, filter `Stage: Alpha,Beta` + `Waiting: Blocked` |
| Overdue | **2** | `var(--warn)` | Models list, filter `Target Date: < today` |
| 승인 대기 (Gate: Ready for Review) | **2** | `var(--accent)` | Models list, filter `Gate: Ready for Review`, sorted by 목표일 |

Copy on the right end of the strip, `var(--text-tertiary)`, 11.5px, `margin-left:auto`:
`전체 65 모델 · 진행 23 · 완료 42`

That single line carries the totals so that no separate "total models" tile is needed.

---

## 5. Region D — Models requiring attention

Full-width `.panel`. Header row: `.panel-title` **Models requiring attention** on the left; right side a quiet text link `모델 전체 보기 →` (→ Models list, unfiltered).

Table, standard `th`/`td` (42px rows). 4 rows, no pagination — it is a triage list, not a list view. If more than 4 qualify, show the 4 worst by (blocked > overdue > days-in-stage) and append a footer row `+ 2 more →` linking to the filtered Model List.

| MODEL | STAGE / ROUND | BLOCKER | 대기 상태 | OWNER | ACTION |
|---|---|---|---|---|---|
| **X200** | Alpha · `#4` | `FAIL` Critical defects 3 | 14 days in Alpha | Lee | Defects 보기 |
| **NX-01** | Alpha · `#3` | `FAIL` Gate blocked · Pass 84.3% | Alpha Gate due `Sep 09` (D+4) | Park | Gate 근거 보기 |
| **X100** | Beta · `#2` | `FAIL` Critical defects 1 | Retest pending | Kim | Defect 보기 |
| **Z050** | Beta · `#1` | `WARN` Retest 대기 6일 | Vendor Fixing 2 | Park | Round 보기 |

Column notes:
- MODEL: 600 weight, links to **Model Detail** (`/models/X200`).
- STAGE / ROUND: stage badge (`.badge-accent` for Beta, `.badge-neutral`-on-surface-3 for Alpha, exactly as in `Main.dc.html`) + round number in `.mono`.
- BLOCKER: a `.badge-fail` / `.badge-warn` with the count, followed by plain text. Links to **Defect List filtered by model + severity Critical + status Open** for defect blockers; to **Model Detail → Gate Blocker panel** for gate blockers.
- 대기 상태: plain text, `var(--text-secondary)`. This is 대기 사유 / days-in-stage, never a stage value (per IA §4: Blocked is not a stage).
- ACTION: quiet text link, one per row, 12px `var(--accent)`. Destinations: `Defects 보기` → Defect List filtered `model=X200, severity=Critical, status=Open`; `Gate 근거 보기` → Model Detail anchored to the Gate panel; `Round 보기` → Validation Result for that model's current round.

---

## 6. Region E — Development Pipeline (left column, flex:1)

`.panel`, `padding: 16px 20px 18px`. `.panel-title` **Development Pipeline**, with `전체 65 모델` right-aligned in `var(--text-tertiary)` 11.5px.

```text
   Kickoff            Alpha               Beta              Complete
      3        →        9        →        11        →         42
                        │                  │
                  ┌─────┴─────┐      ┌─────┴─────┐
                  │ blocked 3 │      │ blocked 2 │
                  └───────────┘      └───────────┘
```

Build: `display:grid; grid-template-columns: repeat(4, 1fr)`. Each cell:
- Stage label — 11px, uppercase, `letter-spacing:.04em`, `var(--text-tertiary)` (same treatment as `th`).
- Count — `.mono`, 30px, 600, `var(--text)`.
- Chevron between cells: an inline stroke SVG `›` 14px in `var(--border-strong)`, absolutely placed on the cell boundary. No arrows made of text.
- Blocked branch: only under Alpha and Beta. A 1px `var(--border)` vertical stem 14px tall, then a `.badge-fail` reading `blocked 3`. Kickoff and Complete render nothing there (do not render "blocked 0" — empty is the signal).

Below the grid, a 1px `var(--border)` top rule and a 32px footer row of 4 quiet links, left-aligned per column, 11.5px:
`Kickoff 보기` · `Alpha 보기` · `Beta 보기` · `완료 모델 보기` — each → **Model List filtered by that stage**. Clicking a `blocked N` badge → **Model List filtered `stage=Alpha` + `waiting=Blocked`**.

The count cell itself is also a link (same target as its footer link) — the footer links exist so the affordance is visible without hover.

Explicitly **not** in this panel: a stacked/proportional funnel graphic, conversion percentages between stages, average days-per-stage. Days-in-stage matters per model (region D) and is misleading as an org average across processes with different validation depth.

---

## 7. Region F — Stage Milestones (left column, flex:1, below E)

`.panel`. `.panel-title` **Stage Milestones** + right-side `.chip` toggle `진행 중 ▾` (진행 중 / 전체 / 내 모델). Default 진행 중 — Complete models are hidden by default because a milestone view is about what has not landed yet.

Milestones here are **stage boundaries and gate approvals**, never generic PM tasks: the only milestone kinds are `Alpha 시작`, `Alpha Gate 승인`, `Beta 시작`, `Beta Gate 승인 및 개발 완료`.

Table, 42px rows, 6 rows shown, footer link `Reports → Gate Readiness 보기 →`.

| MODEL | PROCESS | OWNER | STAGE | NEXT MILESTONE | DUE | 목표일 | STATUS |
|---|---|---|---|---|---|---|---|
| **X100** | TEL · Etch | Kim | `Beta` | Beta 승인 및 개발 완료 | `Sep 17` | `Sep 18` | `FAIL` Blocked · 2 blockers |
| **X200** | LAM · Etch | Lee | `Alpha 완료 · Beta 대기` | Beta 시작 | `Sep 15` | `Sep 20` | `WARN` At risk · FAB 반입 대기 |
| **NX-01** | AMAT · Deposition | Park | `Alpha` | Alpha Gate 승인 | `Sep 09` | `Sep 22` | `FAIL` Overdue D+4 |
| **Y400** | AMAT · CMP | Kim | `Alpha` | Alpha Gate 승인 | `Sep 19` | `Sep 25` | `PASS` On track |
| **Z050** | TEL · Etch | Park | `Beta` | Beta 승인 및 개발 완료 | `Sep 26` | `Sep 30` | `WARN` Retest 대기 |
| **AB120** | Hitachi · Metrology | Lee | `Kickoff` | Alpha 시작 | `Sep 30` | `Oct 04` | `PASS` On track |

Column rules:
- **MODEL** 600 weight → Model Detail.
- **PROCESS** rendered exactly as Model Detail's subtitle format, `Vendor · Process`, `var(--text-secondary)`. Vendor is included because it is the same string users already read on Model Detail; splitting them into two columns costs width for no gain.
- **STAGE** uses the same badges as `Main.dc.html`, including the two-line-safe `Alpha 완료 · Beta 대기` warn badge with the leading `.dot`.
- **DUE** = the milestone's own due date; **목표일** = the model's overall target date. Both `.mono`, 12.5px. They are different domain facts (a gate can be overdue while the model target is still ahead — NX-01 is exactly that case) and must not be merged into one column.
- **STATUS** = a single badge + short reason. Vocabulary is fixed and closed: `On track` (pass), `At risk` (warn), `Retest 대기` (warn), `Overdue D+n` (fail), `Blocked · n blockers` (fail). This is derived business state, not a Gate State value — do **not** print `Not Ready / Ready for Review / Passed` here; those belong to Model Detail's Gate panel where the evidence sits next to them.
- Row hover uses the existing `tr.row:hover` rule. Whole row is not clickable; MODEL and STATUS are the two links (STATUS → Model Detail Gate panel anchor).

Widths (of the left column): MODEL 90 · PROCESS 150 · OWNER 60 · STAGE 170 · NEXT MILESTONE flex · DUE 76 · 목표일 76 · STATUS 170.

---

## 8. Regions G + H — the rail (320px)

### G. Onboarding Coverage

`.panel`, `padding:16px 18px`. `.panel-title` **Onboarding Coverage**, with a `.badge-neutral` on the right reading **EQMS 기준** and a 13px inline "info" stroke SVG whose tooltip reads:
`설비 마스터(EQMS)의 등록 대수를 기준으로 계산합니다. 이 서비스가 관리하는 값이 아닙니다. 동기화 2026-09-13 06:00`

Two stacked metrics, separated by a 1px `var(--border)` rule, each 62px tall:

```text
설비 모델                       65 / 88            74%
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░

설비 (Equipment Units)         412 / 1,207         34%
▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░
```

- Label 12px `var(--text-secondary)`; numerator `.mono` 17px 600 `var(--text)`; `/ 88` in `.mono` 13px `var(--text-tertiary)`; percentage right-aligned `.mono` 12px `var(--text-secondary)`.
- Bar: 6px tall, `border-radius:3px`, track `var(--surface-3)`, fill `var(--accent)`. Not colored by pass/fail — coverage is neutral progress, and using `--pass` green here would imply a judgement the product does not make.
- Footer line, 11.5px `var(--text-tertiary)`: `미온보딩 모델 23 · 미온보딩 설비 795`. The "23" links to a **read-only external-reference list** — spec it as out of scope for now and render it as plain text, not a link, since this product does not own EQMS records. (Noted as an open question in §11.)

### H. Coverage by Process

`.panel`. `.panel-title` **Coverage by Process** + right-side `.badge-neutral` **EQMS 기준**.

One compact row per process, 46px tall, `padding:9px 18px`, divided by `border-bottom:1px solid var(--border)` (last row none). Rows sorted by **uncovered count descending** — the biggest gap first, because the actionable question is "which process area are we behind on", not "which is biggest".

```text
PROCESS        MODELS            진행  막힘
Etch           22 / 26   ▓▓▓▓▓▓▓▓▓▓▓▓▓░░     8    2
Deposition     18 / 24   ▓▓▓▓▓▓▓▓▓▓▓░░░░     6    2
Litho           9 / 15   ▓▓▓▓▓▓▓░░░░░░░░     4    1
CMP            11 / 14   ▓▓▓▓▓▓▓▓▓▓▓▓░░░     3    0
Metrology       5 /  9   ▓▓▓▓▓▓▓▓░░░░░░░     2    0
```

Per row:
- Process name, 12.5px `var(--text)`, 500.
- `N / M` in `.mono` 12.5px, numerator `var(--text)`, denominator `var(--text-tertiary)`.
- Bar: 5px tall, 100px wide, same track/fill as region G.
- 진행 = models of that process currently in Kickoff/Alpha/Beta (sums to 23). 막힘 = blocked (sums to 5), rendered in `var(--fail)` when > 0, `var(--text-tertiary)` `—` when 0.
- Row click → **Model List filtered `process=Etch`**. The 막힘 number click → **Model List filtered `process=Etch` + `waiting=Blocked`**.

Dataset consistency (must hold in the build): models 22+18+9+11+5 = **65**; totals 26+24+15+14+9 = **88**; 진행 8+6+4+3+2 = **23** = Kickoff 3 + Alpha 9 + Beta 11; 막힘 2+2+1 = **5** = Alpha blocked 3 + Beta blocked 2.

Equipment-unit counts are deliberately **not** broken out per process — 5 more `N / M` pairs in a 320px rail would be unreadable and no decision depends on per-process unit coverage. The org-wide unit figure in G is enough.

---

## 9. New CSS (the only additions)

```html
<style>
  /* Region E */
  .funnel { display:grid; grid-template-columns:repeat(4,1fr); position:relative; }
  .funnel-cell { text-align:left; padding:4px 0 0; }
  .funnel-stage { font-size:11px; font-weight:600; text-transform:uppercase;
                  letter-spacing:.04em; color:var(--text-tertiary); }
  .funnel-n { font-family:'IBM Plex Mono',monospace; font-size:30px; font-weight:600;
              line-height:1.15; color:var(--text); }
  .funnel-branch { margin-top:8px; padding-left:2px; }
  .funnel-stem { width:1px; height:14px; background:var(--border); margin-left:9px; }

  /* Regions G + H */
  .cov-track { height:6px; border-radius:3px; background:var(--surface-3); overflow:hidden; }
  .cov-fill  { height:100%; border-radius:3px; background:var(--accent); }
  .cov-row   { display:flex; align-items:center; gap:10px; padding:9px 18px;
               border-bottom:1px solid var(--border); }
  .cov-row:last-child { border-bottom:none; }
  .cov-num   { font-family:'IBM Plex Mono',monospace; font-size:12.5px; color:var(--text); }
  .cov-den   { color:var(--text-tertiary); }
</style>
```

Region H's bar uses `.cov-track` with `height:5px; width:100px`. Both themes work unchanged: `--accent` is deep blue in light, warm amber in dark, and `--surface-3` gives the track adequate contrast in both.

---

## 10. Navigation map (every link on this page)

| Element | Destination | Context passed |
|---|---|---|
| Brand lockup (any screen) | Home | — |
| C · Blocked 5 | Model List | `stage in (Alpha,Beta)` + `waiting=Blocked` |
| C · Overdue 2 | Model List | `targetDate < today`, sort 목표일 asc |
| C · 승인 대기 2 | Model List | `gate=Ready for Review` |
| D · model name | Model Detail | model |
| D · defect blocker badge | Defect List | `model`, `severity=Critical`, `status=Open` |
| D · gate blocker badge | Model Detail | model, anchor `#gate` |
| D · `Round 보기` | Validation Result | model's current round/run |
| D · `모델 전체 보기` | Model List | no filter |
| E · stage count / footer link | Model List | `stage=<that stage>` |
| E · `blocked N` badge | Model List | `stage=<that stage>` + `waiting=Blocked` |
| F · model name | Model Detail | model |
| F · STATUS badge | Model Detail | model, anchor `#gate` |
| F · footer link | Reports → Gate Readiness | — |
| H · process row | Model List | `process=<name>` |
| H · 막힘 count | Model List | `process=<name>` + `waiting=Blocked` |

Model List must therefore accept these filter params: `stage`, `waiting`, `gate`, `process`, `owner`, `targetDate`. `process` is a new filter chip on Model List — `Main.dc.html` currently has Stage / Vendor / Owner / Target Date / Waiting. **Add a `Process` chip to Model List** so the region H links have a landing state; that is the only change this spec requires to an existing screen.

---

## 11. Explicitly out of scope (and why)

| Left out | Reason |
|---|---|
| Pass-rate / defect-count trend lines over time | `Reports → Quality Trends` owns these. On Home a trend answers "how are we doing", not "what is blocked" — the wrong question for this screen. |
| Per-model pass-rate %, open-defect totals, round counts as columns | IA §4 already ruled these out of Model List for the same reason — they belong on Model Detail where the evidence is one click away. Home must not be denser than Model List. |
| A KPI card row (total models / total runs / avg rounds / avg cycle time) | `UI_RESEARCH.md` §9.5. The three totals anyone actually needs are on one 11.5px line in region C. |
| Pie/donut for process breakdown | See §0. |
| Activity feed / recent runs list | Recency is not a blocker signal; a feed pushes the attention list below the fold and is stale within a day. Round history lives on Model Detail. |
| Vendor breakdown panel | Vendor is already visible per row in region F and is a Model List filter. A second distribution panel next to process would double the rail height for a rarely-asked question. |
| Per-process equipment-unit coverage | §8. |
| Period / date-range picker | Nothing on this page is time-windowed; every figure is "right now". A picker that changes nothing is a trap. |
| Personal to-do list / task assignment | IA §4: 별도 할 일 목록 관리 기능은 두지 않는다. Next Action is system-derived, not user-authored. |
| Any action button that mutates state (start validation, approve gate) | Approvals require evidence in view. Home never has the evidence, so it only ever routes to the screen that does. |

**Open question for implementation (Astra):** the "미온보딩 모델 23" figure in region G implies a list of EQMS models not yet in this product. This product does not own those records and there is no registration flow from a reference list in the current IA (registration is 관리자 → New Model). Rendered as plain text for now; if a browse-EQMS-and-register flow is wanted, it is a new screen under Models, not a Home feature.
