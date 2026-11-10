/** Status of the open document and the publish baseline, derived from server reads only (no Revision hash is computed in the browser). */
import { canonicalJson, type LayoutDocument } from '@eqv/core';
import type { LayoutJson, RevisionRead, RevisionRow } from '../endpoints';
import { layoutChanges, type LayoutChanges } from './layout-changes';

export type StatusLabel = '초안' | '저장 안 됨' | '게시 후 변경됨' | '게시됨' | '읽기 전용';
export const STATUS_TONES = { '초안': 'neutral', '저장 안 됨': 'warning', '게시 후 변경됨': 'warning', '게시됨': 'success', '읽기 전용': 'neutral' } as const;

/** Key-order-insensitive equality of two JSON documents. */
export const sameDocument = (a: unknown, b: unknown): boolean => canonicalJson(a) === canonicalJson(b);

/**
 * `저장 안 됨` while dirty; otherwise nothing until the Revision list has resolved (`revisions` null) — `초안` would claim
 * "never published" before that is known. With no Revisions `초안`; the latest Revision's document decides between `게시됨` and
 * `게시 후 변경됨`, and that read resolving (`latest` non-null) is awaited too.
 */
export function draftStatus(input: { dirty: boolean; savedDraft: LayoutJson | null; revisions: readonly RevisionRow[] | null; latest: RevisionRead | null }): StatusLabel | null {
  if (input.dirty) return '저장 안 됨';
  if (input.revisions === null) return null;
  if (input.revisions.length === 0) return '초안';
  if (input.latest === null || input.savedDraft === null) return null;
  return sameDocument(input.savedDraft, input.latest.document) ? '게시됨' : '게시 후 변경됨';
}

export type PublishBaseline =
  | { kind: 'identical'; revision: string }
  | { kind: 'compared'; revision: string; pinned: false; changes: LayoutChanges; skipped: readonly string[] }
  | { kind: 'first'; skipped: readonly string[] }
  | { kind: 'unpinned'; count: number; skipped: readonly string[] };

/**
 * What publishing the saved draft would add. Bindings have no server endpoint until step 8, so no Revision is pinned and `skipped`
 * stays empty: one Revision is the comparison base, two or more leave the `unpinned` case (no other rule is invented). A draft equal
 * to the latest Revision is `identical` (publishing it answers `created: false`).
 */
export function publishBaseline(input: { draft: LayoutDocument; revisions: readonly RevisionRow[]; latest: { revision: string; document: LayoutDocument } | null }): PublishBaseline {
  const { revisions, latest, draft } = input;
  if (revisions.length === 0) return { kind: 'first', skipped: [] };
  if (latest !== null && sameDocument(latest.document, draft)) return { kind: 'identical', revision: latest.revision };
  if (revisions.length === 1 && latest !== null) return { kind: 'compared', revision: latest.revision, pinned: false, changes: layoutChanges(latest.document, draft), skipped: [] };
  return { kind: 'unpinned', count: revisions.length, skipped: [] };
}

export const shortHash = (revision: string): string => revision.replace(/^sha256:/, '').slice(0, 12);
