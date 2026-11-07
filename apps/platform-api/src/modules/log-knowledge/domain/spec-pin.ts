// The spec pin of a validation round (log-lifecycle, #1444 c): which effective spec a round was opened against. Pure.
// `changeSetDigest` is the SHA-256 hex of the canonical JSON of the applicable change list in apply order, each change
// as `{ id, targetKind, targetKey, changeKind, change }` (`change` = `change_json`); `[]` when no software version is
// given or no change applies.

import { createHash } from 'node:crypto';

import type { EffectiveChange } from './spec-effective.js';
import { canonicalJson } from './spec-hash.js';

export interface SpecPin {
  revisionId: string;
  changeSetDigest: string;
}

export function changeSetDigest(changes: readonly EffectiveChange[]): string {
  const list = changes.map((c) => ({
    id: c.id,
    targetKind: c.targetKind,
    targetKey: c.targetKey,
    changeKind: c.changeKind,
    change: c.change,
  }));
  return createHash('sha256').update(canonicalJson(list), 'utf8').digest('hex');
}
