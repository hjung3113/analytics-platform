## analytics-platform addendum (AP addendum)

- Base ref: `origin/main` (`git diff origin/main...HEAD`). Coordinator-run checks and screen evidence are in `.review/W-<n>-VERIFY.md`.
- **Contract and test:** follow the touched 06 contracts (URL, Context, permissions, Scope, query lifecycle, cross-menu links) and related ADRs.
- **Architecture:** dependency direction `contracts → ui/kernel → components → shell → apps`; Kernel and shared components know nothing of menus or mock; commonization threshold 06 §24 (2–3 consumers); feature primitives only from `@ap/ui`.
- **Quality** (the classes per-PR review used to miss):
  - State: for each value the diff stores or caches, name its key and when it clears (session, Scope, generation); a missing clear is major.
  - Silence: for each new cap, default, empty `catch` or `?? fallback`, is the user told? If not, major.
  - Duplication: `rg` the member set, regex or list the diff adds; a second copy elsewhere is a finding that names the one home.
  - Permission: every read path the change opens (list, detail, replay, export), including ones outside the diff.
  - SDK: a hand-built table, picker, formatter or gate that `@ap/*` already provides is major, not a nit.
  - Readability: a line you had to read twice (nested ternary, 3+ positional literals, a null/undefined sentinel with meaning, a second spelling of an existing union or predicate) is a minor finding with the named fix; two in one file is major.
- **Perf** (only when the task names it): query counts, refetches, rerenders, bundle size.
- **Measurement code:** DOM reads stay outside `setState` updaters; `MutationObserver`/`ResizeObserver` cover only the needed area and exclude their own row, so virtual-row scrolling does not retrigger them.
- **UI, only when there is no UX review:** layout, hierarchy, Korean copy, accessibility (names, focus, keyboard), consistency with `DESIGN.md` and neighboring screens.
- Notation: `fix size: <file>, ≈<lines>` and `owner decision needed: yes/no`; the findings column includes `proposal`.
