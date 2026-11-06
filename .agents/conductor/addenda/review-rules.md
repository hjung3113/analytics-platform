## analytics-platform addendum (AP addendum)

- Base ref: `origin/main` (`git diff origin/main...HEAD`). Coordinator-run checks and screen evidence are in `.review/W-<n>-VERIFY.md`.
- **Contract and test:** follow the touched 06 contracts (URL, Context, permissions, Scope, query lifecycle, cross-menu links) and related ADRs.
- **Architecture:** dependency direction `contracts → ui/kernel → components → shell → apps`; Kernel and shared components know nothing of menus or mock; commonization threshold 06 §24 (2–3 consumers); feature primitives only from `@ap/ui`.
- **Perf** (only when the task names it): query counts, refetches, rerenders, bundle size.
- **Measurement code:** DOM reads stay outside `setState` updaters; `MutationObserver`/`ResizeObserver` cover only the needed area and exclude their own row, so virtual-row scrolling does not retrigger them.
- **UI, only when there is no UX review:** layout, hierarchy, Korean copy, accessibility (names, focus, keyboard), consistency with `DESIGN.md` and neighboring screens.
- Notation: `fix size: <file>, ≈<lines>` and `owner decision needed: yes/no`; the findings column includes `proposal`.
