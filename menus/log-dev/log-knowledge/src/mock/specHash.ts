import type { Revision } from './specStore';

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const specJson = (value: unknown): string => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(specJson).join(',')}]` : `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => compare(a, b)).map(([k, v]) => `${JSON.stringify(k)}:${specJson(v)}`).join(',')}}`;
/** The server's version-1 canonical shape; local identifiers and document metadata never enter the seal. */
export function specCanonical(r: Revision): string {
  const modules = new Map(r.modules.map(m => [m.id, m.moduleKey]));
  const events = new Map(r.events.map(e => [e.id, e]));
  const ref = (id: string) => { const e = events.get(id)!; return { module: modules.get(e.moduleId)!, event: e.eventKey }; };
  return specJson({ hashVersion: 1, schemaVersion: r.revision.schemaVersion,
    modules: r.modules.map(m => ({ key: m.moduleKey, name: m.name, parentKey: m.parentModuleId ? modules.get(m.parentModuleId)! : null })).sort((a, b) => compare(a.key, b.key)),
    events: r.events.map(e => ({ moduleKey: modules.get(e.moduleId)!, key: e.eventKey, name: e.name, fields: e.fields, triggerRule: e.triggerRule, detailDocRef: e.detailDocRef })).sort((a, b) => compare(a.moduleKey, b.moduleKey) || compare(a.key, b.key)),
    relations: r.relations.map(r => ({ sourceModule: ref(r.sourceEventId).module, sourceEvent: ref(r.sourceEventId).event, predicate: r.predicate, targetModule: ref(r.targetEventId).module, targetEvent: ref(r.targetEventId).event, ruleRef: r.ruleRef })).sort((a, b) => compare(a.sourceModule, b.sourceModule) || compare(a.sourceEvent, b.sourceEvent) || compare(a.predicate, b.predicate) || compare(a.targetModule, b.targetModule) || compare(a.targetEvent, b.targetEvent)),
  });
}

/** Synchronous SHA-256 for the synchronous mock action engine; the real server owns canonical sealing. */
export function specHash(text: string): string {
  const prime = (n: number) => { for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };
  const primes: number[] = []; for (let n = 2; primes.length < 64; n++) if (prime(n)) primes.push(n);
  const fraction = (v: number) => ((v - Math.floor(v)) * 2 ** 32) >>> 0;
  const constants = primes.map(p => fraction(Math.cbrt(p))), hash = primes.slice(0, 8).map(p => fraction(Math.sqrt(p)));
  const bytes = new TextEncoder().encode(text), size = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(size); padded.set(bytes); padded[bytes.length] = 128;
  const view = new DataView(padded.buffer); view.setUint32(size - 4, bytes.length * 8); view.setUint32(size - 8, Math.floor(bytes.length / 2 ** 29));
  const rotate = (n: number, bits: number) => (n >>> bits) | (n << (32 - bits));
  for (let offset = 0; offset < size; offset += 64) {
    const words = new Uint32Array(64);
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) { const x = words[i - 15]!, y = words[i - 2]!; words[i] = (words[i - 16]! + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) + words[i - 7]! + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10))) >>> 0; }
    let [a, b, c, d, e, f, g, h] = hash as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + constants[i]! + words[i]!) >>> 0;
      const t2 = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((v, i) => { hash[i] = (hash[i]! + v) >>> 0; });
  }
  return hash.map(v => v.toString(16).padStart(8, '0')).join('');
}
