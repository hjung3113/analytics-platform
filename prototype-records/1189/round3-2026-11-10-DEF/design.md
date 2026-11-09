# #1189 round 2: concepts for the unified direction (2026-11-10)

Owner rejected A, B and C (2026-11-10). No implementation. New variants must differ in concept. Owner additions: keep the design system (tokens, components, type rules), UX and structure are free, including leaving the rail, switcher or tile layout; an ADR or contract change is allowed if stated.

Sources: `research-delta.md` (round 2 section), `docs/product/existing-systems.md`, `GLOSSARY.md` «i-MAP» and «업무 시스템», `.planning/backlog.md` long-term direction entry.

## The direction

Stage 1 (now): MARS, CLAS and BRAVO sit on one shell, each owning its menus. Stage 2: the platform takes over DB and servers. Stage 3: menus regroup by analysis order: 지표 분석 → 상세 분석 → 이상 동작 발굴 / 로스 발굴 → 개선·효과 확인. Today's contracts say the opposite (GLOSSARY «업무 시스템», R7.1), so stage 3 needs an ADR regardless of this screen.

Connection order is MARS → CLAS → BRAVO, and old screens run alongside during migration, so several systems will be partly present for a long time.

## What the research says

1. Units that will share pages fit a scope over one navigation, or no unit at all. Unrelated units can stay destinations. So only MARS, CLAS and BRAVO merge. 표준 로그 개발, 업무 흐름, 도구 and 운영 콘솔 stay separate destinations in every variant.
2. No surveyed product made task order its only primary navigation. Fabric's typed task flow is the closest, used as a filter over items. An origin view should stay until the new order has proven itself.
3. Old names survive in search and docs. URLs and saved views stay valid or redirect.
4. Once the boundary goes, a home stops being a directory and becomes a place to resume; the catalog moves elsewhere.
5. A scope needs the same pages at each level and must keep the user's place. Where a system lacks a page during the merge, show the gap instead of hiding it.

## Variants (`?variant=D|E|F`, and `&merged=1` for the after-merge state)

Each variant is shown twice: **today** (systems exist) and **merged** (no system boundary).

### D 분석 순서 (systems become a filter)

Analysis becomes one destination. The primary structure of the sidebar is the analysis order. MARS, CLAS and BRAVO become a source filter (`전체 · MARS · CLAS · BRAVO`) at the top of the sidebar, and each menu row carries a small origin tag. A menu the selected source lacks stays visible and inactive, per research point 5.
Home: the four stages as one horizontal flow, each with its menus, then resume and to-dos.
Moving between analysis and the other destinations is a small control at the top; the rail no longer lists systems.
Merged: the filter and origin tags disappear, nothing else moves. Relearning happens once, now. This is the stage-on-the-way variant.

### E 메뉴판 (no switching unit)

No switcher. One `메뉴` control opens a large panel with every menu the user can open, search on top, recents and favorites on the left, columns on the right, in the style of a mega menu. A `시스템별 / 분석 순서별` grouping toggle shows both maps of the same menus; the sidebar is replaced by the user's pinned menus plus the current section, or removed, whichever looks right.
Home: the same board inline as the page.
Merged: the default grouping becomes analysis order and the toggle goes away. Relearning is small because the control is unchanged.

### F 내 작업에서 시작 (resume and search first)

Home is a resume surface across systems: last screens with their conditions, favorites, to-dos, notices. No system directory on the page. Moving elsewhere is a prominent `이동` bar (search, then recents, then the list of destinations), the system list lives inside it. The sidebar shows the current section only.
Merged: the system names disappear from search paths and result tags, with old names kept as search aliases. Home does not change at all. Relearning is the least of the three.

## Stage mapping (DRAFT for the prototype only, the owner owns the real mapping)

| Stage | Menus |
| --- | --- |
| 지표 분석 | 지표 카탈로그, 생산성 개요, 공정, StGroup, 설비 |
| 상세 분석 | 사이클타임 상세, 설비 기준, 조직 기준, HW Time 단계별·비교·개요·표, MCC, RCC, WPT, CLAS |
| 이상 동작 발굴 / 로스 발굴 | 실행 상세, Wafer Journey |
| 개선·효과 확인 | 개선 아이템 |
| 기준 정보 (outside the order) | Configuration, 설비 마스터, 공정 마스터, 레시피 마스터, 차트 카탈로그 |

Hidden menus (`navHidden`, for example 지표 상세) stay hidden. The prototype changes grouping only; URLs and menu ids do not change.

## Must stay in every variant

Permission filtering, resume targets and their URLs, the `내 할 일` slot, favorites and recents logic, notices, keyboard access (no pointer-only path), focus on open and return, zero-space state, and the DESIGN.md tokens and shared components. Global Context (Scope, period) carries across moves.

## Contracts per variant (to be confirmed in the worker's report)

| Variant | Changes |
| --- | --- |
| D | ADR-0042 (switcher and system-owned rail), ADR-0102, GLOSSARY «업무 시스템» ownership, R7.1, `multi-workspace-ui.md` §3.1 §3.2, Registry: a stage grouping and a source field on menus |
| E | ADR-0042, ADR-0028, ADR-0102, `multi-workspace-ui.md` §3.1 §3.2, `kernel.md` §9, Registry: an app-declared alternate grouping |
| F | ADR-0042, ADR-0102, ADR-0070 (home order), `multi-workspace-ui.md` §3.1 §3.2, palette contract (search becomes the primary route) |
