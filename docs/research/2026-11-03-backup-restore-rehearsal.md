# Backup/restore rehearsal (2026-11-03, #1266)

Evidence record for [backup-restore-upgrade.md](../../ops/platform-api/docs/release/backup-restore-upgrade.md). The
runbook holds the procedure; this file keeps the measured run.

Rehearsal (#1266 node b6): disposable source and target projects with real images on one host,
small data set (12 VOCs, 3 attachments / 1.2 MB, 85 migrations). `backup.sh` 3 s (backend stopped 1 s); `restore.sh`
into an isolated project 18 s, all checks passed, an attachment downloaded from the restored stack was byte-identical;
`upgrade.sh` with one pending migration 11 s (backup first, journal 85 → 86, data and attachments preserved); a failing
migration left the backend stopped with the journal unchanged and printed the restore and image-rollback commands; a
divergent image history was refused before anything was stopped. Durations scale with data size; the 4-hour RTO was
not measured on production-size data — rehearse once on a copy of the real installation before relying on it.
