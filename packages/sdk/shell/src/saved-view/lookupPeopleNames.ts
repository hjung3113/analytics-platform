import { PEOPLE_LOOKUP_MAX, type PlatformAdapter } from '@ap/contracts';

export async function lookupPeopleNames(adapter: PlatformAdapter, ids: readonly string[], signal: AbortSignal): Promise<Map<string, string>> {
  const chunks: string[][] = [];
  for (let at = 0; at < ids.length; at += PEOPLE_LOOKUP_MAX) {
    chunks.push(ids.slice(at, at + PEOPLE_LOOKUP_MAX));
  }
  // Keep names from healthy chunks. Callers fall back to the id when a name is missing.
  const results = await Promise.allSettled(chunks.map(async chunk => adapter.lookupPeople(chunk, signal)));
  const names = new Map<string, string>();
  for (const result of results) {
    if (result.status === 'rejected') continue;
    for (const { userId, displayName } of result.value) {
      if (displayName !== '') names.set(userId, displayName);
    }
  }
  return names;
}
