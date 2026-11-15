// The default evidence summary each Task Request form seeds (#1168 C-2): one
// builder per source kind, shared by the request forms. The source card recognizes
// a default by what it can see: VOC against the builder, Finding by a summary that
// repeats the title shown above it, Cluster by its title (the payload carries no summary).

import type { FindingDto, TaskRequestDto } from '@ap/feature-shared';

/** The VOC form seeds `VOC <display_id>: <title>` (`VocDetailBody`). */
export function vocEvidenceSummaryDefault(voc: { display_id: string; title: string }): string {
  return `VOC ${voc.display_id}: ${voc.title}`;
}

/** The VOC Cluster form seeds the cluster summary, or its title when it has none (`VocClusterDetailPanel`). */
export function vocClusterEvidenceSummaryDefault(cluster: {
  summary?: string | null;
  title: string;
}): string {
  return cluster.summary ?? cluster.title;
}

/** The Finding form seeds the Finding summary (`FindingRequestTaskDraftHost`). */
export function findingEvidenceSummaryDefault(finding: { summary: string }): string {
  return finding.summary;
}

/**
 * True when the stored summary is the untouched default the request form was seeded with,
 * so the source card hides the line that would repeat the source identity. A user-written
 * summary never matches and stays. Stored values are only read, never changed.
 */
export function isDefaultEvidenceSummary(
  item: TaskRequestDto,
  sourceFinding: FindingDto | undefined,
): boolean {
  const source = item.source;
  // A host (or a test controller mock) may hand `null` where the type says `undefined`.
  const finding = sourceFinding ?? undefined;
  if (item.source_type === 'finding') {
    // The seeded Finding summary is real evidence text, not identity: the line only
    // duplicates the card when it repeats the title shown above it.
    return finding !== undefined && item.evidence_summary === finding.title;
  }
  if (source?.display_id === undefined || source.title === undefined) return false;
  if (item.source_type === 'voc') {
    return (
      item.evidence_summary ===
      vocEvidenceSummaryDefault({ display_id: source.display_id, title: source.title })
    );
  }
  // voc_cluster: the payload carries only the title, so the recognizable default is the
  // title-only one (a cluster without a summary stores its title).
  return item.evidence_summary === source.title;
}
