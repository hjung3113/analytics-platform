Read .review/00-REVIEW-RULES.md first and follow it.

# Review task — #2574 second half / PR #3171 (round 1)

Issue: `.review/ISSUE-2574.md`. Body: `.review/PR-BODY.md`. Diff: `git show HEAD` (one commit, 12 files). Real-server capture (required for permission/feature work): https://claude.ai/artifact/6o6Arqd93aSYFDUaAWttFF — before/after of all four forms on a seeded verify DB (Mock Admin); you cannot open it, the PR body summarizes what each pair shows.

Scope: only the admin forms (permission-direct-grant-form, WorkspaceSettingsScreen, ManagedSystemsDialogs RegisterDialog) and notice-voc NoticeDialogs. log-dev forms belong to another lane.

Judge especially:
- permission grant: does `submitBlockedReason` give a reason for every way `canSubmit` can be false, in a sensible order, without ever showing a reason while the button is enabled? Any security-relevant behaviour change (it must not)? Is repeating the self-grant sentence under the button acceptable (see Decisions)?
- managed systems: the `useValidatedSubmit` conversion keeps every prior behaviour (required checks, first-error focus, reserved external key mapping, owner/reviewer default errors, re-register prefill), and the new `invalid_slug_format` mapping is correct and cleared on edit.
- notice dialog: local validation via `useValidatedSubmit`, server field errors separate with focus, `clearError` on edit, retry path (`onRetry` → `save`), delete dialog untouched, localized required mark.
- settings: ARIA linkage and the save reason; coverage rows untouched.
- tests: do the new tests fail without the change and pin the behaviour? Label lookups changed to regex because of the visible required text — acceptable?
- current idioms and consistency with the three #2540 consumers (survey create, task-request decision, milestone create).

Report `.review/R-3171.md`, verdict `PASS` or `CHANGES-REQUIRED` in the Summary.

Sentinel (last line of .review/R-3171.md): <!-- R-3171-DONE -->
