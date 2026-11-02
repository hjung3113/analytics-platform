/**
 * In-memory catalog of the mock server: a deterministic synthetic seed shaped like the real `knowledge.*` tables
 * (vendor, process_category, equipment_model + model_process, software_version). Module state, like the other mock
 * stores; `resetCatalog()` restores the seed (tests). Pure data and rules — handlers are in `index.ts`.
 */
export type Kind = 'vendor' | 'process' | 'model' | 'software';
export type Rec = {
  id: string; kind: Kind; code: string; key: string; name: string; active: boolean; rowVersion: number;
  /** vendor for a model, model for a software version. */
  parentId: string | null; createdAt: string; updatedAt: string;
};

/** The server's comparison key of a code (ADR-0107): NFKC, trim, inner whitespace runs to one space, upper case. */
export const toCodeKey = (value: string): string => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toUpperCase();

const KIND_NO = { vendor: 1, process: 2, model: 3, software: 4 } as const;
/** Deterministic uuid: kind in the first group, sequence in the last. */
const uuidOf = (kind: Kind, n: number): string => `${String(KIND_NO[kind]).padStart(8, '0')}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

const SEED_AT = '2026-10-01T00:00:00.000Z';
let recs: Rec[] = [];
let mappings: { modelId: string; processId: string }[] = [];
let sequence = 0;

const seed = (kind: Kind, code: string, name: string, active = true, parentId: string | null = null): Rec => {
  const rec: Rec = { id: uuidOf(kind, ++sequence), kind, code, key: toCodeKey(code), name, active, rowVersion: 1, parentId, createdAt: SEED_AT, updatedAt: SEED_AT };
  recs.push(rec);
  return rec;
};

export function resetCatalog(): void {
  recs = []; mappings = []; sequence = 0;
  const [alpha, beta, gamma] = [seed('vendor', 'ALPHA', 'Alpha Semicap'), seed('vendor', 'BETA', 'Beta Systems'), seed('vendor', 'GAMMA', 'Gamma Tech (retired)', false)];
  const [etch, dep, cmp] = [seed('process', 'ETCH', 'Etch'), seed('process', 'DEP', 'Deposition'), seed('process', 'CMP', 'Planarization')];
  seed('process', 'LITHO', 'Lithography', false);
  const models: [Rec, Rec[]][] = [
    [seed('model', 'A-100', 'Alpha 100', true, alpha!.id), [etch!, dep!]],
    [seed('model', 'A-200', 'Alpha 200', true, alpha!.id), [etch!]],
    [seed('model', 'B-10', 'Beta 10', true, beta!.id), [cmp!]],
    [seed('model', 'B-20', 'Beta 20', true, beta!.id), []],
    [seed('model', 'B-30', 'Beta 30 (retired)', false, beta!.id), [dep!]],
    [seed('model', 'G-1', 'Gamma 1', false, gamma!.id), []],
  ];
  for (const [model, processes] of models) for (const p of processes) mappings.push({ modelId: model.id, processId: p.id });
  const [a100, a200, b10] = [models[0]![0], models[1]![0], models[2]![0]];
  seed('software', 'v1.0', '', true, a100.id); seed('software', 'v2.0', 'Major', true, a100.id);
  seed('software', 'v1.0', '', true, a200.id); seed('software', 'v3.1', 'Beta channel', false, b10.id);
}
resetCatalog();

export const all = (kind: Kind): Rec[] => recs.filter(r => r.kind === kind);
export const byId = (id: unknown): Rec | undefined => (typeof id === 'string' ? recs.find(r => r.id === id.toLowerCase()) : undefined);
export const processIdsOf = (modelId: string): string[] => mappings.filter(m => m.modelId === modelId).map(m => m.processId);
export const processesOf = (modelId: string): { id: string; name: string }[] =>
  processIdsOf(modelId).map(id => byId(id)!).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).map(({ id, name }) => ({ id, name }));
/** Count of active children, like the server's counts. */
export const activeChildren = (rec: Rec): number => {
  if (rec.kind === 'vendor') return all('model').filter(m => m.parentId === rec.id && m.active).length;
  if (rec.kind === 'process') return mappings.filter(m => m.processId === rec.id && byId(m.modelId)!.active).length;
  return all('software').filter(s => s.parentId === rec.id && s.active).length;
};

/** Another row of the kind with this code key in the same scope (workspace; vendor for a model; model for a software version). */
export const keyTaken = (kind: Kind, key: string, parentId: string | null, exceptId: string | null): boolean =>
  all(kind).some(r => r.key === key && r.parentId === parentId && r.id !== exceptId);

export function insert(kind: Kind, code: string, name: string, parentId: string | null): Rec {
  const rec: Rec = { id: uuidOf(kind, ++sequence), kind, code, key: toCodeKey(code), name, active: true, rowVersion: 1, parentId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  recs.push(rec);
  return rec;
}
export function touch(rec: Rec, patch: Partial<Pick<Rec, 'code' | 'name' | 'active'>>): Rec {
  if (patch.code !== undefined) { rec.code = patch.code; rec.key = toCodeKey(patch.code); }
  if (patch.name !== undefined) rec.name = patch.name;
  if (patch.active !== undefined) rec.active = patch.active;
  rec.rowVersion += 1; rec.updatedAt = new Date().toISOString();
  return rec;
}
export function setProcesses(modelId: string, processIds: readonly string[]): void {
  mappings = mappings.filter(m => m.modelId !== modelId);
  for (const id of new Set(processIds.map(p => p.toLowerCase()))) mappings.push({ modelId, processId: id });
}

/** Label of the newest active software version of a model (highest createdAt, then later insertion); null when none. */
export const latestSoftwareLabel = (modelId: string): string | null => {
  const active = all('software').filter(s => s.parentId === modelId && s.active);
  if (active.length === 0) return null;
  return active.reduce((best, s) => (s.createdAt >= best.createdAt ? s : best)).code;
};
