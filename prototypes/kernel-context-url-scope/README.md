# Context/URL/Scope Kernel prototype

**Candidate — local executable contract proof, not a production platform implementation.**
Python 3.9+ standard library only, no packages, network, UI, DB or SSO required. Python is a Candidate chosen for a small inspectable codec and runnable server double; it does not select the frontend framework. Verified locally with Python 3.9.6.

Work order / authority mapping: [kernel-work-order-context-url-scope-draft.md](../../.agents/reports/kernel-work-order-context-url-scope-draft.md). The source contracts were read at Git `41067ab2a4421366a42425c9cf56c8e27e0ae116`; no authoritative document was changed.

Run from repository root:

```sh
python3 -B -m unittest discover -s prototypes/kernel-context-url-scope -p 'test_*.py' -v
python3 -B prototypes/kernel-context-url-scope/demo.py
```

`verification.log` captures both commands, exit codes and their real output. Tests assert codec round trips, all three group axes, absent/empty/selected sets, Unicode code-point ordering, aliases, malformed input, unsupported-context preservation, server validation, membership change, destination separation and revalidation on return. The demo prints the actual encoded deep links and reconstructed state.

| File | Responsibility |
| --- | --- |
| `context_url.py` | Candidate shared public codec, immutable state, strict field validation, capability-only route constants, transfer and restore helpers |
| `fixture_server.py` | Synthetic request validation double: explicit room grants, Scope→Site connection, current groups, independent Lines, revalidation |
| `test_context_url.py` | Runnable contract cases via public URL/request seams |
| `demo.py` | Asserted A/B selection → C detail → original Context round trip; live group change and permission revocation |
| `verification.log` | Actual run evidence |
| `README.md` | Run instructions, boundaries and reviewer entry point |

State semantics: `None` means a set is absent; `()` means explicit empty; otherwise a sorted unique tuple of exact IDs. `scope_id` is requested Scope, never proof of authorization. The server double resolves Site before looking at EquipmentIDs. Explicit room grants deliberately do not define parent-child inheritance. Line is sample metadata and never an authorization axis. A Condition is one of StGroup, team (분임조), Maker+Model; it is independent of the fixed Selection. Group evaluation is marked `live` and `local-fixture` with a synthetic evaluation timestamp, not production freshness evidence.

Scope: `/prototype/context`, `/prototype/equipment/{id}`, `/prototype/reference` are capability-only test routes, not new menus or a Menu Registry. Reference preserves unused Context including empty markers. Unknown keys stay on the current URL but do not enter the server's validated conditions or transfer to another route. A caller retains the original URL separately for return; `restore_context` restores it and the server must validate again. There is no browser history or arbitrary redirect integration.

This is a restricted v1 **Candidate profile**, not a complete v1 platform decoder. Beyond Scope, room/Condition/Selection and destination, registered keys (`from`, `to`, `lotIds`, `ppid`, `recipeIds`, `metricId`, `metricVersion`, `savedViewToken`, `anchor`, `entityType`) are preserved as opaque `unapplied_globals`, carried across Context Links and listed by key in the server result’s `unapplied`. Their values and repeated-pair order are retained; this profile does not interpret, validate axis semantics or apply these time, metric, Lot/PPID/Recipe, occurrence or saved-view inputs. Unknown keys remain separate `extras`, preserved only on the current URL. A future supporting consumer must validate before application. No time-series query/merge is executed, so there is no implied timeDomain proof or unlimited analytics query. Real DB limits, timeout and time contracts remain future integration work. Canonical URLs explicitly emit v=1 and map the registered equivalent `equipmentIds` alias to `selectedEquipmentIds`; unsupported versions fail entirely with `unsupported_version` before route, duplicate-field or other v1 format checks.

Outcomes are request-validation evidence only. `selection_required` is a local entry state, not an addition to the platform query outcome enum. `ok/empty/error/forbidden` illustrate applicable distinctions; these are not production query responses or implementations of assessments/Data Trust. Actual SSO grants, group membership source, permission inheritance, browser/UI accessibility, App Shell, real Menu Registry and data services are unimplemented and excluded. The only remaining adoption gates relevant to this slice are authority supply, out-of-scope EquipmentID disclosure policy and public schema approval, detailed in the work order.
