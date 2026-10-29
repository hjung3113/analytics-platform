## analytics-platform addendum (AP addendum)

- Base ref: `origin/main` (`git diff origin/main...HEAD`).
- Coordinator-run checks (package and root checks, E2E, mutation checks) and screen evidence are in `.review/W-<n>-VERIFY.md`.
- If the task file includes a performance (`perf`) perspective, inspect query counts, unnecessary refetches, rerenders, and bundle-size changes.
- **Contract and test perspective**: Follow the touched section 06 contracts (URL, Context, permissions, Scope, query lifecycle, cross-menu links) and related ADRs.
- **Architecture perspective**: Check dependency direction (`contracts → ui/kernel → components → shell → apps`), that Kernel and shared components do not know about menus or mock, the commonization threshold (06 §24 — 2–3 consumers), and that feature primitives use only `@ap/ui`.
- **Measurement and observation code**: Check that DOM reads are outside `setState` updaters and that `MutationObserver` and `ResizeObserver` cover only the necessary area, excluding their own row's area, to avoid unnecessary triggers during virtual-row scrolling.
- UI (only when there is no UX review): Check layout, hierarchy, Korean UI copy, accessibility (names, focus, keyboard), and consistency with `DESIGN.md` and neighboring screens.
- AP report notation: `fix size: <file>, ≈<lines>` and `owner decision needed: yes/no`.
- Report: State explicitly when there are no findings. Include `proposal` in the findings column.
