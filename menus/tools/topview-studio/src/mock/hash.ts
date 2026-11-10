/** Deterministic, synchronous stand-in for the server's `layoutRevision`: `sha256:` plus 64 hex digits of the key-sorted JSON. Not a real SHA-256 and never compared with one. */
const sorted = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(sorted).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${JSON.stringify(k)}:${sorted(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

export function fakeRevision(document: unknown): string {
  const text = sorted(document);
  let hex = '';
  // Eight independent 32-bit FNV-1a style lanes, each seeded differently, give 64 hex digits.
  for (let lane = 0; lane < 8; lane += 1) {
    let h = (0x811c9dc5 ^ (lane * 0x9e3779b1)) >>> 0;
    for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
    hex += h.toString(16).padStart(8, '0');
  }
  return `sha256:${hex}`;
}
