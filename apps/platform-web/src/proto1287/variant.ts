/**
 * #1287–#1291 THROWAWAY PROTOTYPE — read `?variant=A|B|C` once at module load (in-app links drop the param, the
 * module value stays for the session). Without the param every prototype branch is skipped and the app renders as main.
 * Never merged: lives only on branch `prototype/1287-1291-ia-ui`.
 */
export type Proto1287 = 'A' | 'B' | 'C' | null;
function read(): Proto1287 {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('variant');
  if (value === 'A' || value === 'B' || value === 'C') {
    try { sessionStorage.setItem('proto1287', value); } catch { /* prototype */ }
    return value;
  }
  try {
    const kept = sessionStorage.getItem('proto1287');
    if (value === 'now') { sessionStorage.removeItem('proto1287'); return null; }
    return kept === 'A' || kept === 'B' || kept === 'C' ? kept : null;
  } catch { return null; }
}
export const PROTO_1287: Proto1287 = read();
