import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { writeLocalStorage } from '@ap/ui';
import { usePlatformOptional } from '@ap/kernel';
import { browserPreferenceKey, decodeCollapse, migrateCollapseSections, readBrowserPreference } from '../preferences/browserPreference';

export type CollapsePreference = {
  collapsed: boolean;
  choice: boolean | null;
  choose: (value: boolean | null) => void;
  collapsedSections: string[];
  toggleSection: (id: string, collapsed: boolean) => void;
  /** Stores the preference and queues focus on the opposite toggle (after the layout commit). */
  toggle: (nextCollapsed: boolean) => void;
  expandRef: RefObject<HTMLButtonElement | null>;
  collapseRef: RefObject<HTMLButtonElement | null>;
  /** Text for an always-mounted polite region: only a summary change that happens while already collapsed. */
  liveText: string;
};

/**
 * A boolean collapse preference kept in `localStorage` (JSON, per key), the opposite-toggle focus move, and the collapsed-summary
 * announcement shared by `PageFilterBar` and the page head. The toggle itself is never announced; `summaryText` changes are, but only
 * while collapsed (the first collapsed render records the baseline). `expandOnMount` starts expanded without touching the stored value.
 */
export type CollapsePreferenceOptions = { defaultCollapsed?: boolean | null; expandOnMount?: boolean; sections?: readonly string[]; persist?: boolean };

type CollapseState = { key: string; choice: boolean | null; sections: string[] };

function decodeLegacyCollapse(kind: string, raw: string): boolean | null {
  if (kind === 'sidebar-collapsed' && (raw === '1' || raw === '0')) return raw === '1';
  return decodeCollapse(raw);
}

function loadBooleanPreference(key: string, storageKey: string, kind: string, { persist, defaultCollapsed }: { persist: boolean; defaultCollapsed: boolean | null }): boolean | null {
  if (!persist) return defaultCollapsed;
  return readBrowserPreference<boolean | null>(key, {
    legacyKey: storageKey, decode: decodeCollapse,
    decodeLegacy: raw => decodeLegacyCollapse(kind, raw), fallback: defaultCollapsed,
  });
}

function updateSectionSet(previous: CollapseState, key: string, id: string, { collapsed }: { collapsed: boolean }): CollapseState {
  if (previous.key !== key) return previous;
  const sections = previous.sections.filter(value => value !== id);
  if (collapsed) sections.push(id);
  return { ...previous, sections };
}

export function useCollapsePreference(storageKey: string, summaryText: string, { defaultCollapsed = false, expandOnMount = false, sections, persist = true }: CollapsePreferenceOptions = {}): CollapsePreference {
  const userId = usePlatformOptional()?.session.user.id;
  const [, kind = '', ...rest] = storageKey.split(':');
  const key = browserPreferenceKey(kind, userId, rest.join(':'));
  const load = () => {
    if (sections) {
      const ids = readBrowserPreference<string[]>(key, {
        legacyKey: storageKey,
        decode: raw => { const value: unknown = JSON.parse(raw); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : null; },
        fallback: [],
        migrate: ids => migrateCollapseSections(key, ids),
      });
      return { key, choice: defaultCollapsed, sections: sections.filter(id => readBrowserPreference(`${key}:${id}`, { legacyKey: `${key}:${id}`, decode: decodeCollapse, fallback: ids.includes(id) })) };
    }
    return { key, choice: loadBooleanPreference(key, storageKey, kind, { persist, defaultCollapsed }), sections: [] as string[] };
  };
  const initial = () => { const loaded = load(); return expandOnMount ? { ...loaded, choice: false } : loaded; };
  const [state, setState] = useState(initial);
  if (state.key !== key) setState(initial());
  const collapsed = state.choice === true;
  const choose = useCallback((choice: boolean | null) => setState(previous => previous.key === key ? { ...previous, choice } : previous), [key]);
  const toggleSection = (id: string, nextCollapsed: boolean) => {
    setState(previous => updateSectionSet(previous, key, id, { collapsed: nextCollapsed }));
    writeLocalStorage(`${key}:${id}`, JSON.stringify(nextCollapsed));
  };
  const pendingFocus = useRef<{ key: string; target: 'expand' | 'collapse' } | null>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const collapseRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (pendingFocus.current?.key === key && pendingFocus.current.target === 'expand') expandRef.current?.focus();
    else if (pendingFocus.current?.key === key && pendingFocus.current.target === 'collapse') collapseRef.current?.focus();
    pendingFocus.current = null;
  });

  const toggle = useCallback((nextCollapsed: boolean) => {
    pendingFocus.current = { key, target: nextCollapsed ? 'expand' : 'collapse' };
    choose(nextCollapsed);
    if (persist) writeLocalStorage(key, JSON.stringify(nextCollapsed)); // preference stays in memory when storage refuses
  }, [key, choose, persist]);

  const [announcement, setAnnouncement] = useState({ key, text: '' });
  const announcedSummary = useRef<{ key: string; text: string } | null>(null);

  useLayoutEffect(() => {
    if (!collapsed) {
      announcedSummary.current = null;
      setAnnouncement({ key, text: '' });
      return;
    }
    if (announcedSummary.current?.key !== key) {
      // First collapse or new account: record its baseline, with no previous account's announcement.
      setAnnouncement({ key, text: '' });
      announcedSummary.current = { key, text: summaryText };
      return;
    }
    if (announcedSummary.current.text !== summaryText) {
      announcedSummary.current = { key, text: summaryText };
      setAnnouncement({ key, text: summaryText });
    }
  }, [key, collapsed, summaryText]);

  return { collapsed, choice: state.choice, choose, collapsedSections: state.sections, toggleSection, toggle, expandRef, collapseRef, liveText: announcement.key === key ? announcement.text : '' };
}
