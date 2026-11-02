# #1194 카탈로그 관리 — prototype captures

Route: `/log-dev/log-knowledge-catalog?variant=A|B|C` (`&state=list|edit|inactive|error|deactivate` forces a state). Real app shell, mock app, synthetic fixture (8 makers, 12 processes, 60 models, 147 SW versions). Desktop 1440×900 unless noted; captured with ego-browser.

## Captures

- `now-logdev.png` — the 표준 로그 개발 space today (before any edit): four groups in the rail, 내 검증 대기 planned-menu page.
- `A-list.png` — A: tabs 제조사 8 / 공정 12 / 모델 60 / SW 버전 147; the 모델 table with pinned 상태 filter (활성), process chips, a 미분류 model (BX-100) and a model with 0 SW (CX-100).
- `A-edit.png` — A: docked drawer `모델 수정 AX-100` with three processes as chips (ETCH·CLEAN·INSPECT), maker fixed, tabs 정보 / SW 버전.
- `A-edit-1280.png` — same as A-edit at 1280×800 (sidebar folds to the rail; drawer keeps its width).
- `A-inactive.png` — A: 제조사 tab with 상태 filter cleared; Vendor H row with 비활성 badge and row action 다시 활성화; drawer shows the 비활성 제조사 notice with 다시 활성화.
- `A-error.png` — A: model drawer after a failed save: conflict banner `다른 사람이 먼저 고쳤습니다 — 새로 불러오기` and field error `같은 코드가 이미 있습니다` on 모델 코드 (AX-200 already exists under Vendor A).
- `A-deactivate.png` — A: confirmation `제조사 Vendor A 비활성화` with impact counts (모델 9개, SW 버전 21개), primary verb 비활성화.
- `B-list.png` — B: one 모델 table; 제조사·공정·상태 as pinned column filters in one row (ADR-0105); SW 버전 column shows latest version + count; `제조사·공정 관리` entry above the table.
- `B-edit.png` — B: model drawer on AX-100, tab 모델 정보·공정 with three process chips (default tab when opened from a row is SW 버전).
- `B-inactive.png` — B: 상태 filter = 비활성 (4 models), drawer on HX-100 with 비활성 모델 notice; its 3 SW versions each with 다시 활성화.
- `B-error.png` — B: the same conflict banner and duplicate-code field error inside the B drawer.
- `B-deactivate.png` — B: confirmation `모델 AX-100 비활성화` with SW count impact.
- `B-manage.png` — B: the secondary `제조사·공정 관리` dialog (two lists with model counts, 상태, 비활성화/다시 활성화).
- `C-list.png` — C: three columns 제조사 → 모델 → SW 버전 with counts, Vendor A selected, detail pane shows Vendor A's form.
- `C-edit.png` — C: AX-100 selected in the model column (chips + count), its SW column filled, pane `AX-100 수정` with three process chips.
- `C-inactive.png` — C: 상태 = 전체; Vendor H selected with 비활성 badges on it and its two models; pane shows 비활성 제조사 + 다시 활성화.
- `C-error.png` — C: the conflict banner and duplicate-code error in the narrower right pane.
- `C-deactivate.png` — C: confirmation for Vendor A with impact counts.
- `C-process.png` — C: `공정 → 모델` mode — processes in column 1 (+ a 미분류 entry), mapped models with their maker in column 2.

## Variants

### A — 탭 + 오른쪽 서랍
- Strength: one flat `PlatformDataTable` per entity, so search, filters, counts, paging and import land in standard places and scale to thousands of rows; count cells link to the child tab with a filter (제조사 → 모델).
- Weakness: the hierarchy is hidden behind tabs; with the drawer docked the table loses columns to horizontal scroll (1280 shows the squeeze); `가져오기` sits in the page ⋯ menu, not visible.
- Research: PatternFly primary-detail (https://www.patternfly.org/patterns/primary-detail/design-guidelines) and Carbon side-panel create flow; research top-3 #1.

### B — 모델 중심 표
- Strength: Model is the pivot entity, so 제조사 and 공정 become filters and SW versions sit in the model's drawer — the per-model task needs one screen.
- Weakness: makers and processes are second-class (a dialog); the reverse view "which models use process X" is only a filter, and the dialog does not scale past a few dozen rows.
- Research: MUI master-detail / AG Grid master-detail idea (https://mui.com/x/react-data-grid/master-detail/); research top-3 #2.

### C — 3열 드릴
- Strength: the whole path 제조사 → 모델 → SW 버전 and its counts are visible at once; good for people who think in the hierarchy; Process gets its own mode instead of a fake tree edge.
- Weakness: narrow columns carry little data (no sort, no 수정일, no paging); searching models across makers needs the process mode or another entry; the pane is narrow for the model form.
- Research: SAP Fiori Flexible Column Layout (https://ui5.github.io/webcomponents/components/fiori/FlexibleColumnLayout/); research top-3 #3.
