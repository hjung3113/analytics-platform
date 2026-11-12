/** Body-free state projection. Stored erasure reasons are free text, so they cannot prove provenance. */
interface EvidenceRef { fileRef: string; line: number; fileSha256: string }
interface Evidence extends EvidenceRef { hasExcerpt: boolean }
export interface ExcerptMetadata { evidenceIndex: number; deletedAt: Date | null }
export interface EvidenceStateRow {
  ruleResultId: string;
  evidenceIndex: number;
  evidenceRef: EvidenceRef;
  excerptState: 'not_submitted' | 'not_loaded' | 'no_permission' | 'unknown';
  sourceState: 'not_checked' | 'no_permission' | 'hash_mismatch';
}

export function evidenceStateRows(
  ruleResultId: string,
  evidence: readonly Evidence[],
  files: readonly { fileRef: string; sha256: string }[],
  allowed: boolean,
  metadata: readonly ExcerptMetadata[],
): EvidenceStateRow[] {
  return evidence.map((entry, evidenceIndex) => {
    const stored = allowed ? metadata.find((m) => m.evidenceIndex === evidenceIndex) : undefined;
    const sample = allowed ? files.find((f) => f.fileRef === entry.fileRef) : undefined;
    return {
      ruleResultId,
      evidenceIndex,
      evidenceRef: { fileRef: entry.fileRef, line: entry.line, fileSha256: entry.fileSha256 },
      excerptState: !entry.hasExcerpt ? 'not_submitted' : !allowed ? 'no_permission' : stored && !stored.deletedAt ? 'not_loaded' : 'unknown',
      sourceState: !allowed ? 'no_permission' : sample && sample.sha256 !== entry.fileSha256 ? 'hash_mismatch' : 'not_checked',
    };
  });
}
