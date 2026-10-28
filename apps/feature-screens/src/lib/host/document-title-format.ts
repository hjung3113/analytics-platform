// Router-free home of the record title formatter detail panels use. The bridge entry graph bans `lib/router/**`, so it
// lives here and `lib/router/document-title.tsx` re-exports it.
export function formatRecordDocumentTitle(
  record: { displayId: string; title: string } | null,
): string | null {
  if (record === null || record.displayId.trim() === '' || record.title.trim() === '') {
    return null;
  }

  return `${record.displayId} · ${record.title}`;
}
