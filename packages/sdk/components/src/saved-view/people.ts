import { useEffect, useState } from 'react';
import type { GroupMember } from '@ap/contracts';

/** Async people lookup injected by the host (SavedViewStore.searchPeople shape). */
export type PeopleSearch = (query: string, signal: AbortSignal) => Promise<readonly GroupMember[]>;

/**
 * Name with the affiliation that tells same-named people apart. When name and affiliation are both shared with
 * someone else in `among`, the user id is the last resort.
 */
export function personLabel(member: GroupMember, among: readonly GroupMember[] = []): string {
  const same = among.filter(other => other.userId !== member.userId && other.displayName === member.displayName && other.affiliation === member.affiliation);
  const base = member.affiliation ? `${member.displayName} (${member.affiliation})` : member.displayName;
  return same.length > 0 ? `${base} · ${member.userId}` : base;
}

/** Adds or removes one person by id; the list keeps its order and never holds a person twice. */
export function toggleMember(list: readonly GroupMember[], member: GroupMember): GroupMember[] {
  return list.some(item => item.userId === member.userId) ? list.filter(item => item.userId !== member.userId) : [...list, member];
}

export type PeopleSearchState = { status: 'idle' | 'loading' | 'error' | 'ready'; results: readonly GroupMember[]; retry: () => void };

/** Searches as the query changes; an older request is aborted so a slow answer never replaces a newer one. */
export function usePeopleSearch(search: PeopleSearch, query: string): PeopleSearchState {
  const [state, setState] = useState<{ status: PeopleSearchState['status']; results: readonly GroupMember[] }>({ status: 'idle', results: [] });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === '') { setState({ status: 'idle', results: [] }); return; }
    const controller = new AbortController();
    setState(prev => ({ status: 'loading', results: prev.results }));
    search(trimmed, controller.signal).then(
      results => { if (!controller.signal.aborted) setState({ status: 'ready', results }); },
      () => { if (!controller.signal.aborted) setState({ status: 'error', results: [] }); },
    );
    return () => controller.abort();
  }, [search, query, attempt]);
  return { ...state, retry: () => setAttempt(n => n + 1) };
}
