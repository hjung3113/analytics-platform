# Black-box UI test rounds (read when planning one)

## How a round is run

- **Scenarios:** the conductor and a review-tier worker (role from `routing.tsv`) write them together, corner cases included.
- **Execution:** an `impl`-role worker, through the UI only. Give the executor the purpose only: never code locations,
  routes, component names or expected behavior. Reason: the value comes from the executor not knowing the product; hints
  invalidate the round.
- **Blocked:** do not investigate first. File an issue (label `area:feedbackops`), ask the conductor for a workaround and
  move to the next test. A complex blocker gets a temporary workaround; a simple one is fixed at once. The conductor
  records the decision in the issue comment. Reason: getting stuck on one mission burns the whole round.
- **Check UX and function.** "Works but cannot be discovered" is the dominant failure mode.
- Start the round early in the session. Workers cannot verify or commit, so the conductor judges, fixes and commits.
- Boot the app and its throwaway DB as in PROFILE §Browser evidence (never the owner's dev data on :3010/:3011).

## N reported issues are fewer root causes: pin the root before dispatching

Reported issues routinely share one cause (deep links authored in three places with no check against the router; 403s
rendered as load failures), and the issue's own diagnosis is often wrong (blamed on the backend when the cache was
stale on the frontend; "absent" but present with no callers; "UX" but a missing API; not a defect at all).

1. Read the code and call the API directly (login via `curl`, check status and envelope) before dispatching; use the
   browser only for render state.
2. Take the symptom as fact; rebuild root cause, scope and classification from code. `[UX]`/`[BUG]` labels and "there is
   no X" claims are the least reliable.
3. The chunk's deliverable is a contract test (for example every deep link matched against the real router), not string fixes.
4. Fix unfiled sibling defects in the same chunk but file them separately, and record the confirmed root cause as an
   issue comment.

## Harness limits (carried over from earlier rounds; not re-verified against the current harness)

- For "save does not work", first check that a POST reached the backend log: past rounds' "defects" were harness artifacts.
- Rich text (TipTap) took input only through `orca fill --element <ref> --value …`; `orca inserttext` and `orca type`
  returned success without typing. Never use a success return as an oracle. After typing, re-snapshot and click with a
  fresh ref.
- Attachment missions cannot be verified: the dropzone's file input is `className="hidden"`
  (`apps/feature-screens/src/features/voc/components/detail/ComposerAttachmentDropzone.tsx`), so there is no ref to upload
  to. Drop them or mark them excluded.
- `orca click` missed some buttons; the workaround was a real DOM `.click()` found by visible label via `orca eval`.
- Integration global setup truncates and reseeds its DB: never run it against the round's DB mid-round.
- Closing as a misclassification needs the full diagnosis in the comment, or the next round files it again.
- Dropped as unverifiable here: the old dev-DB container name and ports (BE 3011 / FE 5173, DB 5434), which now belong to the owner's dev data.
