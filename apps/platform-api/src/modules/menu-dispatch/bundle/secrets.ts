import { readFile } from 'node:fs/promises';

import { DeclarationBundleError } from '../declarations-file.js';
import type { Target } from './targets.js';

/** Deliberately opaque to JSON/log inspection. Only a connector may explicitly reveal its credential. */
export class TargetSecret {
  #value: string;
  constructor(value: string) { this.#value = value; }
  reveal(): string { return this.#value; }
}
export type TargetSecrets =
  | { kind: 'sql'; connection: TargetSecret }
  | { kind: 'http'; headers: Readonly<Record<string, TargetSecret>> };

async function readSecret(path: string): Promise<TargetSecret> {
  try {
    const value = await readFile(path, 'utf8');
    if (!value.trim()) throw new Error('empty');
    return new TargetSecret(value);
  } catch {
    throw new DeclarationBundleError([`target secret file at ${path} cannot be read or is empty`]);
  }
}

/** Called only after the complete bundle passes schema and cross-validation. */
export async function readTargetSecrets(targets: Readonly<Record<string, Target>>): Promise<Readonly<Record<string, TargetSecrets>>> {
  const entries: [string, TargetSecrets][] = [];
  for (const [id, target] of Object.entries(targets)) {
    if (target.kind === 'sql') entries.push([id, { kind: 'sql', connection: await readSecret(target.connectionFile) }]);
    else {
      const headers: [string, TargetSecret][] = [];
      for (const [name, source] of Object.entries(target.headers ?? {})) headers.push([name, await readSecret(source.file)]);
      entries.push([id, { kind: 'http', headers: Object.fromEntries(headers) }]);
    }
  }
  return Object.fromEntries(entries);
}
