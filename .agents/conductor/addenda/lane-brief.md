# Lane brief template

The lead writes one brief per lane at `$AP_MAIN/.review/lanes/<lane>.md`. A lane session reads its brief, plus only the sections it points to in [`LANES.md`](../LANES.md) §Lane session and [`PROFILE.md`](../PROFILE.md). It does not read either file in full: the lead owns grouping, briefs, tiers and assignment, so a lane that re-derives them gets different answers than the lead.

Keep it to one page. Copy the block below and fill every field; a field the lane cannot act on is a defect in the brief.

```markdown
# Lane brief — <lane> (<release>)

- Assignment: <issue numbers and the one-line scope; the issue body and comments are the source>. tier=<full|light> (from `tier.sh`; the lane re-checks before ship).
- Limits: <what is out of scope; new findings go to backlog or an issue unless they lose data, leak, bypass permission, or block work>.
- Verify: <commands; `tier.sh` verify= decides root checks vs lint+typecheck>.
- Review: <full: one review-final + at most one fix round; light: host reads the diff, CI decides>.
- Merge grant: <exact words from the owner>.
- Env: `AP_MAIN=<path>`, `WAVE_STATE=$AP_MAIN/.review/wave/state-<lane>`, port <port>, `LANE_NAME=<lane>`, `LANE_RUN=<run id>`.
- Run: `<run id>`; lead terminal `<handle>`.
- After the last item: `lane-send.sh 대기 - "<one sentence>"`.
```

Lane commands (all under `.agents/conductor/scripts/`):

| Need | Command |
| --- | --- |
| Message the lead | `lane-send.sh <kind> <#n\|-> "<≤3 sentences>"` |
| Rotate or not | `lane-rotate.sh` (`rotate=no\|after-issue\|now`) |
| Review, verify and merge mode | `tier.sh` |
| Pre-merge shared-path check | `merge-precheck.sh <pr> <branch> <sha>` (exit 3 = rebase) |
| Who else touches my files | `shared-overlap.sh [--paths a,b]` |
| Machine room | `capacity.sh`; locks only through `with-lock.sh` |
