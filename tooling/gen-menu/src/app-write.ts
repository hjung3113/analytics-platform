import fs from 'node:fs';

export type AppFileWriter = (path: string, data: string) => void;

let writer: AppFileWriter = (path, data) => fs.writeFileSync(path, data);

/**
 * R1 test seam: redirects the transactional app-file writes so tests can inject a partial-write
 * fault. Production always keeps the default fs.writeFileSync. Call with a writer that throws to
 * simulate ENOSPC mid-write; restore the default by calling setAppFileWriter again afterwards.
 */
export function setAppFileWriter(next: AppFileWriter): void {
  writer = next;
}

/** The single write primitive the generate/remove transactions use for app files. */
export function writeAppFile(path: string, data: string): void {
  writer(path, data);
}
