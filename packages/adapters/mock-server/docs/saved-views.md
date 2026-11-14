# Saved-view mock

The browser-local store follows [ADR-0099](../../../../docs/adr/0099-server-saved-view-persistence.md): every read and write checks the saved-view object ACL. Lists omit unreachable views and contain no denied entries. A direct `get` outside the object ACL returns only `{ id, denied: true, reason: 'no-access' }`.

Menu permissions and room Scope belong to the data boundary when a view is opened. They do not prevent saving, updating, listing or choosing a default for a reachable view. Unknown menu identifiers are still invalid on save. Object sharing, ownership and approval checks remain authoritative in this simulation.
