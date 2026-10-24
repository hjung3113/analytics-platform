// THROWAWAY #595 — never merge.
// Variant (A | B), persona (staff | reporter) and the capture flag, read once at module load from the URL and kept for the tab in
// sessionStorage. Toggling reloads the page, so the Registry (built at load) can include the FeedbackOps space only when a variant is on.
// The entry state (preselected Managed System + the return line) is a tiny store shared by sidebar, block and screens.
import { useSyncExternalStore } from 'react';

export type Variant = 'A' | 'B';
export type Persona = 'staff' | 'reporter';
const K = { variant: 'platform:proto-595:variant', persona: 'platform:proto-595:persona', bar: 'platform:proto-595:bar', entry: 'platform:proto-595:entry' };

function read(key: string): string | null { try { return sessionStorage.getItem(key); } catch { return null; } }
function write(key: string, value: string | null) { try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value); } catch { /* ignore */ } }

function boot() {
  const q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
  const v = q.get('variant');
  if (v === 'none') write(K.variant, null);
  else if (v === 'A' || v === 'B') write(K.variant, v);
  const p = q.get('persona');
  if (p === 'staff' || p === 'reporter') write(K.persona, p);
  if (q.has('protoBar')) write(K.bar, q.get('protoBar') === '0' ? '0' : '1');
  const variant = read(K.variant);
  return {
    variant: (variant === 'A' || variant === 'B' ? variant : null) as Variant | null,
    persona: (read(K.persona) === 'reporter' ? 'reporter' : 'staff') as Persona,
    hideBar: read(K.bar) === '0',
  };
}

export const PROTO = boot();

/** Switch variant / persona: store and reload so the Registry is rebuilt. */
export function applyProto(next: { variant?: Variant | 'none'; persona?: Persona }) {
  if (next.variant !== undefined) write(K.variant, next.variant === 'none' ? null : next.variant);
  if (next.persona !== undefined) write(K.persona, next.persona);
  write(K.entry, null);
  const url = new URL(location.href);
  url.search = '';
  if (next.variant === 'none') url.pathname = '/';
  location.href = url.toString();
}

export const MANAGED_SYSTEMS = ['MARS', 'BRAVO', 'CLAS', '표준 로그 개발'] as const;
export const ALL_SYSTEMS = '전체 시스템';
export type Back = { url: string; label: string; system: string };
type Entry = { ms: string; back: Back | null };

function loadEntry(): Entry {
  try { const raw = read(K.entry); if (raw) return JSON.parse(raw) as Entry; } catch { /* ignore */ }
  return { ms: ALL_SYSTEMS, back: null };
}
let entry = loadEntry();
const listeners = new Set<() => void>();
export function setEntry(patch: Partial<Entry>) {
  entry = { ...entry, ...patch };
  write(K.entry, JSON.stringify(entry));
  listeners.forEach(l => l());
}
export function useEntry(): Entry {
  return useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => entry);
}
