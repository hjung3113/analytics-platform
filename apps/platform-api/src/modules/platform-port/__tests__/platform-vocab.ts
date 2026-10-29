import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * The platform's closed vocabularies, read from the JSON artifact `@ap/contracts` generates from its
 * own `as const` lists (`@ap/contracts/vocab.json`, #674) — never by parsing TypeScript source.
 * Test-only: feature src depends on no `@ap/*` package but `@ap/ui` (check-boundaries rule 11).
 */
export interface PlatformVocab {
  kernelPermissions: string[];
  usageVias: string[];
  auditActions: string[];
  outcomes: string[];
}

export function platformVocab(): PlatformVocab {
  const path = createRequire(import.meta.url).resolve('@ap/contracts/vocab.json');
  return JSON.parse(readFileSync(path, 'utf8')) as PlatformVocab;
}
