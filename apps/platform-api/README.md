# Platform API

Runtime source is `src/index.ts`; operating tools and deployment instructions live in
[ops/platform-api](../../ops/platform-api/README.md).

## Optional Source window provider (#1817)

Disabled by default. To read an on-premises Linux read-only mount, set:

```sh
LOG_EXPLORER_SOURCE_PROVIDER=directory
LOG_EXPLORER_SOURCE_ROOTS='{"fixture-owner":"/mnt/source-fixture"}'
LOG_EXPLORER_SOURCE_GRANTS_FILE=/run/secrets/source-grants.json
```

`source-grants.json` is a secret JSON array of exact grants, for example
`[{"workspaceId":"<workspace UUID>","actorId":"<actor UUID>","sourceOwner":"fixture-owner"}]`.
An empty, absent, unreadable or malformed grant file denies all reads. It is read on
every ACL judgment, including immediately before returning text; replace it atomically
to revoke a grant. Session actors and service-token actors use the same exact tuple;
`explorer.source.read` and token scope checks still apply independently.

Register a Round sample manifest through the existing lifecycle flow with
`sourceOwner` and `files[{fileRef,order,sha256}]`. A linked `logExplorer.window` request
includes the Round's `roundId`, owner, fileRef and line. The server resolves that
Round under the caller's workspace and visibility before passing its manifest in
an internal call context. Client sample sets and hashes are never trusted by this provider.

The directory provider interprets opaque refs only within its own configured root:
relative slash-separated names, no absolute paths, `.`/`..`, URI schemes or backslashes.
It checks realpath containment of the opened descriptor via `/proc/self/fd`; Linux
procfs is required and unavailable descriptor checks fail closed. Symlinks escaping
the root are refused. Only regular files up to 64 MiB are read, in 64 KiB chunks.
The provider decodes UTF-8 lines (LF or CRLF) without parsing CSV/TSV; it retains at
most 200 rows × 8,000 UTF-16 units plus one bounded chunk. SHA-256 covers all bytes
on every read before any retained row leaves. No digest/body cache or source-body
persistence is used. Missing files and digest mismatch both answer `source_missing`.

Only `getWindow` is supported. Search, Parser, periods and Top View answer
`unsupported`; an unbound window also answers `unsupported`. Round-origin handoff
checks use the same trusted manifest and ACL. Dataset availability shares the port
and ACL but has no trusted Round binding, so it remains unsupported/unverified;
export shares the port and ACL but cannot search yet. A new provider implements
`SourceProvider.open`, owning resolution and a bounded cancellable byte stream;
HTTP/S3 resolution and in-house ACL integration are not implemented.

Public tests use synthetic files and identifiers. Before declaring an operational
integration complete, verify the actual mount, owner policy, actor identities,
file digests, revoke-during-read and EvidenceRef links inside the private deployment.
