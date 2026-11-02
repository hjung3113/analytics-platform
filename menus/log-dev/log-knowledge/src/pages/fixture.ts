/** PROTOTYPE fixture (#1194): synthetic, non-confidential catalog. Writes stay in local React state. */

export type Status = 'active' | 'inactive';
export type Maker = { id: string; code: string; name: string; status: Status; updatedAt: string };
export type Process = { id: string; code: string; name: string; status: Status; updatedAt: string };
export type Model = { id: string; makerId: string; code: string; name: string; processIds: string[]; status: Status; updatedAt: string };
export type SwVersion = { id: string; modelId: string; version: string; specState: 'none' | 'draft' | 'published'; status: Status; updatedAt: string };
export type Catalog = { makers: Maker[]; processes: Process[]; models: Model[]; versions: SwVersion[] };
export type EntityKind = 'maker' | 'process' | 'model' | 'version';

const day = (n: number) => `2026-10-${String(1 + (n % 30)).padStart(2, '0')}`;

const MAKER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const PROCESS_CODES = ['ETCH', 'CLEAN', 'DEPO', 'PHOTO', 'CMP', 'IMPLANT', 'DIFF', 'METAL', 'INSPECT', 'TEST', 'PACK', 'ANNEAL'];
const PROCESS_NAMES = ['식각', '세정', '증착', '노광', '연마', '이온 주입', '확산', '금속 배선', '검사', '테스트', '패키징', '열처리'];

export function buildCatalog(): Catalog {
  const makers: Maker[] = MAKER_LETTERS.map((l, i) => ({
    id: `mk-${l}`, code: `V${l}`, name: `Vendor ${l}`, status: l === 'H' ? 'inactive' : 'active', updatedAt: day(i * 3),
  }));
  const processes: Process[] = PROCESS_CODES.map((code, i) => ({
    id: `pr-${code}`, code, name: PROCESS_NAMES[i]!, status: code === 'ANNEAL' ? 'inactive' : 'active', updatedAt: day(i * 2 + 1),
  }));
  const models: Model[] = [];
  for (let i = 0; i < 60; i++) {
    const maker = makers[i % 7]!; // Vendor H (inactive) gets its own two models below
    const series = 100 + Math.floor(i / 7) * 100;
    const code = `${maker.code.slice(1)}X-${series}`;
    const p1 = PROCESS_CODES[(i * 5) % 11]!;
    const p2 = PROCESS_CODES[(i * 3 + 2) % 11]!;
    const processIds = i % 3 === 0 ? [`pr-${p1}`, `pr-${p2}`].filter((v, k, a) => a.indexOf(v) === k) : [`pr-${p1}`];
    models.push({ id: `md-${i}`, makerId: maker.id, code, name: `Demo ${code}`, processIds, status: 'active', updatedAt: day(i) });
  }
  // Named cases the variants reach for.
  models[0] = { ...models[0]!, code: 'AX-100', name: 'Demo AX-100', processIds: ['pr-ETCH', 'pr-CLEAN', 'pr-INSPECT'] }; // three processes
  models[1] = { ...models[1]!, processIds: [] }; // unclassified
  models[9] = { ...models[9]!, status: 'inactive' };
  models[23] = { ...models[23]!, status: 'inactive' };
  models[58] = { ...models[58]!, makerId: 'mk-H', code: 'HX-100', name: 'Demo HX-100', status: 'inactive' };
  models[59] = { ...models[59]!, makerId: 'mk-H', code: 'HX-200', name: 'Demo HX-200', status: 'inactive' };
  const versions: SwVersion[] = [];
  models.forEach((m, i) => {
    const count = i === 2 ? 0 : 1 + ((i * 7) % 4); // model index 2 has no SW
    for (let k = 0; k < count; k++) {
      const major = 1 + (k > 1 ? 1 : 0) + (i % 3 === 0 ? 1 : 0);
      versions.push({
        id: `sw-${i}-${k}`, modelId: m.id, version: `v${major}.${k}.${(i + k) % 5}`,
        specState: k === count - 1 ? 'draft' : k % 2 === 0 ? 'published' : 'none',
        status: m.status === 'inactive' || (k === 0 && count > 2 && i % 4 === 0) ? 'inactive' : 'active', updatedAt: day(i + k * 4),
      });
    }
  });
  return { makers, processes, models, versions };
}

export const ko = {
  maker: '제조사', process: '공정', model: '모델', version: 'SW 버전',
} as const satisfies Record<EntityKind, string>;

export const statusLabel: Record<Status, string> = { active: '활성', inactive: '비활성' };
export const specLabel: Record<SwVersion['specState'], string> = { none: '명세 없음', draft: '명세 작성 중', published: '명세 게시' };

export type StatusFilter = 'active' | 'inactive' | 'all';
export const matchesStatus = (s: Status, f: StatusFilter) => f === 'all' || s === f;

/** Counts the variants show in cells and confirmations. */
export function counts(c: Catalog) {
  const modelsByMaker = new Map<string, number>();
  const modelsByProcess = new Map<string, number>();
  const versionsByModel = new Map<string, number>();
  for (const m of c.models) {
    modelsByMaker.set(m.makerId, (modelsByMaker.get(m.makerId) ?? 0) + 1);
    for (const p of m.processIds) modelsByProcess.set(p, (modelsByProcess.get(p) ?? 0) + 1);
  }
  for (const v of c.versions) versionsByModel.set(v.modelId, (versionsByModel.get(v.modelId) ?? 0) + 1);
  return { modelsByMaker, modelsByProcess, versionsByModel };
}

/** What a deactivation touches — shown in the confirmation (no cascade: children keep their own state). */
export function impactOf(c: Catalog, kind: EntityKind, id: string): string {
  if (kind === 'maker') {
    const ms = c.models.filter(m => m.makerId === id);
    const active = ms.filter(m => m.status === 'active');
    const sw = c.versions.filter(v => ms.some(m => m.id === v.modelId));
    return `이 제조사의 모델 ${ms.length}개(활성 ${active.length}개)와 SW 버전 ${sw.length}개는 그대로 남지만, 새 모델을 이 제조사에 등록할 수 없습니다.`;
  }
  if (kind === 'process') {
    const ms = c.models.filter(m => m.processIds.includes(id));
    return `이 공정에 연결된 모델 ${ms.length}개의 연결은 남고, 새로 연결할 때 목록에 나오지 않습니다.`;
  }
  if (kind === 'model') {
    const sw = c.versions.filter(v => v.modelId === id);
    return `이 모델의 SW 버전 ${sw.length}개(활성 ${sw.filter(v => v.status === 'active').length}개)와 연결 공정은 그대로 남고, 모델 탐색 기본 목록에서 빠집니다.`;
  }
  return '이 SW 버전의 명세와 기술 항목은 그대로 남고, 새 기술 항목을 이 버전에 연결할 수 없습니다.';
}

export function nameOf(c: Catalog, kind: EntityKind, id: string): string {
  if (kind === 'maker') return c.makers.find(x => x.id === id)?.name ?? id;
  if (kind === 'process') return c.processes.find(x => x.id === id)?.code ?? id;
  if (kind === 'model') return c.models.find(x => x.id === id)?.code ?? id;
  const v = c.versions.find(x => x.id === id);
  return v ? `${c.models.find(m => m.id === v.modelId)?.code ?? ''} ${v.version}` : id;
}

export function setStatus(c: Catalog, kind: EntityKind, id: string, status: Status): Catalog {
  const at = '2026-11-02';
  if (kind === 'maker') return { ...c, makers: c.makers.map(x => x.id === id ? { ...x, status, updatedAt: at } : x) };
  if (kind === 'process') return { ...c, processes: c.processes.map(x => x.id === id ? { ...x, status, updatedAt: at } : x) };
  if (kind === 'model') return { ...c, models: c.models.map(x => x.id === id ? { ...x, status, updatedAt: at } : x) };
  return { ...c, versions: c.versions.map(x => x.id === id ? { ...x, status, updatedAt: at } : x) };
}

/** ADR-0107 key: NFKC → trim → collapse inner spaces → upper case. */
export const codeKey = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();

export type ModelDraft = { id: string | null; makerId: string; code: string; name: string; processIds: string[] };
export type SaveErrors = { code?: string; conflict?: boolean };

/** Model unique key is (maker, code_key). Returns the field error the form shows, or null. */
export function duplicateModelCode(c: Catalog, d: ModelDraft): string | null {
  const k = codeKey(d.code);
  return c.models.some(m => m.id !== d.id && m.makerId === d.makerId && codeKey(m.code) === k) ? '같은 코드가 이미 있습니다' : null;
}

export function saveModel(c: Catalog, d: ModelDraft): { catalog: Catalog; id: string } {
  const at = '2026-11-02';
  if (d.id) return { catalog: { ...c, models: c.models.map(m => m.id === d.id ? { ...m, code: d.code.trim(), name: d.name.trim(), processIds: d.processIds, updatedAt: at } : m) }, id: d.id };
  const id = `md-new-${c.models.length}`;
  return { catalog: { ...c, models: [...c.models, { id, makerId: d.makerId, code: d.code.trim(), name: d.name.trim(), processIds: d.processIds, status: 'active', updatedAt: at }] }, id };
}

/** Forced prototype states (`?state=`), so captures can reach every state without clicking. */
export type ForcedState = 'list' | 'edit' | 'inactive' | 'error' | 'deactivate';
export const FORCED_STATES: { id: ForcedState; label: string }[] = [
  { id: 'list', label: '목록' }, { id: 'edit', label: '편집' }, { id: 'inactive', label: '비활성' }, { id: 'error', label: '저장 오류' }, { id: 'deactivate', label: '비활성화 확인' },
];
/** The model the forced states open: three processes. */
export const DEMO_MODEL_ID = 'md-0';
