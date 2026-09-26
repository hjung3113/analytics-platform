# Equipment master consumer report

## Built / platform contracts

Only owned files changed: EquipmentMaster.tsx, EquipmentDetail.tsx, data.ts and this report.

- Management archetype: header → Page filters → PlatformDataTable → selection actions → linkable DetailDrawer → validity/Audit.
- All requested columns, semantic StatusBadge labels (retired = 유효 종료), server-envelope pagination/sorting, column preferences/pinning, URL q/status/maker/focus, reset, selected or all-filtered CSV with scope toast.
- List uses serve-resolved Scope/grants/room/Condition/Selection. QueryView wraps source and individual detail panels; PlatformDataTable owns its response boundary. Drawer focus preserves list filters/selection.
- Destination IDs are separate from inherited Selection. Request-only destination constraint revalidates Scope/room grants; no global URL mutation. Full-page tab persists; returnTo restores exact URL through navigate().
- Explicit Context Links: checked rows → productivity overview; related-analysis tab → cycle time replacing Selection with this ID only upon explicit navigation.
- Korean/English UI preserves master values/IDs; token styles, Field/AuditTimeline/DataTrustIndicator reused. Deterministic synthetic attribute segments and separate who/when/before→after audit events; retired records retain validity end.

## Candidate / Open

- Existing wireframe and dispatch authorize prototype URL keys, tabs, page Maker refinement and explicit analysis action. Read-only Candidate is labelled.
- Synthetic versions are labelled; current StGroup/team is not projected into history. Those two fields are identified as externally supplied; other ownership stays Open.
- Registration transition, editing, retirement/restoration, production volume and export limits remain Open; mutation UI is omitted.
- Synthetic chamber versions split within the actual validFrom/validTo interval; no real historical accuracy claimed.

## Platform gaps

- serve() trust source is fixed to mart.productivity_hourly, with generic coverage/data-through, even for master data; needs source-specific metadata API.
- No destination-ID request API or capability-aware filter resolution. Consumer passes a request-only Context copy using destination Selection and null room/Condition, preserving the inherited URL while retaining Scope/room-grant enforcement. Unknown IDs currently receive generic outside-scope/grants forbidden.
- Table sort/page are local because registry supplies no URL keys; drawer tab is local because master has no tab key. Full-page tab is URL-owned.
- Mock export/filter options load the resolved equipment set alongside paged table requests; production needs permission-checked export/facet endpoints for large data.
- Shared drawer/column popover contain shadows despite no-shadow guidance; consumer adds none and shared files were not changed.

## Verification evidence

- Final npx tsc --noEmit: exit 0 (whole project).
- Final npx vite build: succeeded; existing dependency use-client warnings.
- Live ego-browser at existing port 5190: engineer/ICH returned 38 rows, 2 pages; search 0103 reduced to one row; View opened drawer; validity showed two segments; Audit showed before→after.
- Full page then Back restored exactly /equipment?v=1&scopeId=ICH&q=0103&focus=ICH-PHOTO-0103. Related analysis tab persisted tab=analysis; cycle-time link carried this ID. Checked-row productivity link carried selected ID.
- Clicked selected Export; observed CSV: exported 1 selected rows toast. Downloaded file content not independently inspected.
- Status=maintenance returned four Maintenance rows; Maker=TEL persisted; Equipment ID sort exposed aria-sort=ascending; clear filters restored 38 rows. Switched Korean → English → Korean with master values unchanged.
- Flask Timeout showed timeout state; unknown-status scenario showed unknown assessment indicator. URL roomNames=DIF-202 returned server refusal with correlation ID.
- Direct detail ICH-PHOTO-0103 with inherited Selection ICH-PHOTO-0105 displayed destination name and retained the other ID in URL/reference chip.
- Not exercised: all remaining scenarios, Viewer role switch, column resize/pin, keyboard-only flow, pagination click, filtered CSV content, destination analytics rendering (links inspected only), screenshot/contrast audit, real backend.
- Ego-browser update notice observed; no upgrade attempted; TaskSpace finished.
