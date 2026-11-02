/**
 * PROTOTYPE (#1197 / #1108, throwaway branch `prototype/1197-models-items`, never merged).
 * Synthetic in-component fixture for the 모델 탐색 · 모델 공통 프로파일 · 전체 기술 Item · Item 상세 variants.
 * No mock server, no backend: one deterministic world built at module load, local writes through `store.ts`.
 * Names are synthetic only (Vendor A, ETCH, MX-200, v3.2.1, KI-101).
 */

export type Vendor = { id: string; name: string };
export type Process = { id: string; name: string };
export type Model = {
  id: string; code: string; name: string; vendorId: string; processIds: string[]; active: boolean;
  updatedAt: string; summary: string; source: string;
};
export type SpecStatus = 'approved' | 'reviewing' | 'none';
export type Software = { id: string; modelId: string; version: string; specStatus: SpecStatus; active: boolean; updatedAt: string };

export type ItemType = 'anomaly' | 'check' | 'behavior' | 'standard';
export type Publication = 'draft' | 'published' | 'archived';
export type Verification = 'not_checked' | 'observed' | 'verified' | 'disputed';
export type Processing = 'open' | 'under_investigation' | 'resolved';
export type Axis = 'verification' | 'processing' | 'publication';
export type Evidence = { id: string; kind: 'log' | 'spec' | 'run' | 'image'; label: string; location: string; detail: string; access: 'ok' | 'restricted' };
export type Assessment = { id: string; at: string; actor: string; axis: Axis; from: string | null; to: string; reason: string; evidenceId?: string };
export type Revision = { rev: number; at: string; by: string; note: string };
export type ItemLinkRef = { kind: 'derived_from' | 'similar' | 'related'; itemId: string; rev?: number };
export type Item = {
  id: string; title: string; ownerKind: 'model' | 'software'; ownerId: string; type: ItemType; category: string; tags: string[];
  author: string; createdAt: string; updatedAt: string; publication: Publication; verification: Verification; processing: Processing;
  body: { observed: string; expected: string; analysis: string; improvement: string };
  evidence: Evidence[]; revisions: Revision[]; history: Assessment[]; links: ItemLinkRef[];
};

export const TYPE_LABEL: Record<ItemType, string> = { anomaly: '이상 사례', check: '확인 필요', behavior: '동작 설명', standard: '작업 기준' };
export const PUBLICATION_LABEL: Record<Publication, string> = { draft: '초안', published: '게시됨', archived: '보관됨' };
export const VERIFICATION_LABEL: Record<Verification, string> = { not_checked: '미확인', observed: '관찰됨', verified: '검증됨', disputed: '이견 있음' };
export const PROCESSING_LABEL: Record<Processing, string> = { open: '열림', under_investigation: '조사 중', resolved: '해결됨' };
export const AXIS_LABEL: Record<Axis, string> = { verification: '기술 검증', processing: '처리', publication: '게시' };
export const SPEC_LABEL: Record<SpecStatus, string> = { approved: '명세 승인', reviewing: '명세 검토 중', none: '명세 없음' };
export const EVIDENCE_KIND_LABEL: Record<Evidence['kind'], string> = { log: '로그 발췌', spec: 'Spec 문서', run: '검증 Run', image: '이미지' };

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(1197);
const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
const day = (offset: number) => new Date(Date.UTC(2026, 9, 31) - offset * 86_400_000).toISOString().slice(0, 10);
const at = (offset: number, hour: number) => `${day(offset)} ${String(hour).padStart(2, '0')}:${String((offset * 7) % 60).padStart(2, '0')}`;

export const VENDORS: Vendor[] = 'ABCDEFGH'.split('').map(l => ({ id: `v-${l.toLowerCase()}`, name: `Vendor ${l}` }));
export const PROCESSES: Process[] = ['ETCH', 'CLEAN', 'DEPO', 'CMP', 'PHOTO', 'IMPLANT', 'DIFF', 'METAL', 'TEST', 'INSPECT', 'ANNEAL', 'STRIP'].map(n => ({ id: `p-${n.toLowerCase()}`, name: n }));
const PREFIX = ['MX', 'TX', 'PX', 'CX', 'DX', 'EX', 'LX', 'RX'];
const PEOPLE = ['김하늘', '이도윤', '박서연', '최지훈', '정유나', '한민재'];

export const MODELS: Model[] = [];
for (let i = 0; i < 300; i++) {
  const vendor = VENDORS[i % 8]!;
  const code = i === 0 ? 'MX-200' : i === 8 ? 'MX-210' : `${PREFIX[i % 8]}-${100 + Math.floor(i / 8) * 10 + (i % 3)}`;
  const n = 1 + Math.floor(rand() * 2);
  const processIds = i === 0 ? ['p-etch', 'p-clean', 'p-depo'] : i === 16 ? [] : [...new Set(Array.from({ length: n }, () => pick(PROCESSES).id))];
  MODELS.push({
    id: `m-${String(i + 1).padStart(3, '0')}`, code, name: `${code} ${pick(['Etcher', 'Cleaner', 'Coater', 'Polisher', 'Scanner', 'Furnace', 'Prober'])}`,
    vendorId: vendor.id, processIds, active: i === 0 || i === 8 ? true : rand() > 0.07, updatedAt: day(Math.floor(rand() * 120)),
    summary: i === 0
      ? '3개 공정(ETCH·CLEAN·DEPO)에 쓰이는 공용 플랫폼 모델입니다. 챔버 2개 구성이 기본이며 SW 버전마다 이벤트 명세가 따로 관리됩니다. 공정별 레시피 차이는 SW 명세에서 확인합니다.'
      : '합성 데이터 모델입니다. 공정·SW 구성은 카탈로그 관리에서 바뀝니다.',
    source: i % 3 === 0 ? '카탈로그 관리 · 수동 등록' : '외부 기준정보 연동 (합성)',
  });
}

export const SOFTWARE: Software[] = [];
const SW_PER_MODEL = MODELS.map((m, i) => (i === 0 ? 5 : i === 8 ? 0 : 1 + Math.floor(rand() * 2.98)));
MODELS.forEach((m, i) => {
  for (let k = 0; k < SW_PER_MODEL[i]!; k++) {
    const major = 1 + Math.floor(k / 2) + (i === 0 ? 2 : 0);
    const version = i === 0 ? ['v3.0.4', 'v3.1.0', 'v3.2.1', 'v3.3.0', 'v4.0.0-rc1'][k]! : `v${major}.${(k * 3 + i) % 6}.${(i + k) % 4}`;
    SOFTWARE.push({
      id: `s-${m.id.slice(2)}-${k + 1}`, modelId: m.id, version,
      specStatus: k === SW_PER_MODEL[i]! - 1 && i === 0 ? 'reviewing' : pick<SpecStatus>(['approved', 'approved', 'reviewing', 'none']),
      active: !(i === 0 && k === 0) && rand() > 0.05, updatedAt: day(Math.floor(rand() * 200)),
    });
  }
});

const TITLES = [
  'STEP_PROCESS 선행 발생 확인 필요', 'PM1 START_END 순서 역전', 'ALARM_SET 직후 RECOVERY 누락', 'LOT_END 이벤트 중복 기록', '챔버 대기 시간 기준 정의',
  'STEP_ID 필드 빈 값', 'WAFER_IN 시각 역행', '레시피 교체 후 첫 이벤트 지연', 'DOOR_OPEN 없이 LOAD_DONE 발생', 'PM 종료 후 IDLE 전환 기준',
];
const CATEGORIES = ['이벤트 순서', '필드 값', '시각 정합', '상태 전이', '작업 절차'];
const TYPES: ItemType[] = ['anomaly', 'check', 'behavior', 'standard'];
const VERIFS: Verification[] = ['not_checked', 'observed', 'verified', 'disputed'];
const PROCS: Processing[] = ['open', 'under_investigation', 'resolved'];

function evidenceFor(n: number, seed: number): Evidence[] {
  return Array.from({ length: n }, (_, k) => {
    const kind = (['log', 'spec', 'run', 'image'] as const)[(seed + k) % 4]!;
    return {
      id: `e-${seed}-${k}`, kind, access: k === 2 ? 'restricted' : 'ok',
      label: kind === 'log' ? `SRC-${4100 + seed}-${k} 로그 발췌` : kind === 'spec' ? `이벤트 명세 §${3 + k}.${seed % 5}` : kind === 'run' ? `검증 Run R-${880 + seed}` : `챔버 상태 캡처 ${k + 1}`,
      location: kind === 'log' ? `행 ${1200 + k * 40}–${1240 + k * 40} · 2026-10-${String(10 + (seed % 18)).padStart(2, '0')} 09:1${k}` : kind === 'spec' ? `Spec r${2 + k} · p.${12 + k}` : kind === 'run' ? `Rule ORDER-${k + 1} · 위반 ${3 + k}건` : `IMG-${seed}-${k}.png`,
      detail: kind === 'log' ? 'sha256 7f3a…c91e · 허용 발췌 12행' : kind === 'run' ? 'Validator 실측 2026-10-21 · 별도 시스템 결과' : '출처 확인됨',
    };
  });
}

function historyFor(n: number, seed: number, final: Verification): Assessment[] {
  const steps: Verification[] = ['not_checked', 'observed', 'disputed', 'observed', final];
  const reasons = ['최초 등록: 현상 보고만 있음', '로그 3건에서 같은 순서 관찰', '제조사 설명과 관찰이 다름 — 이견 제기', '재현 조건에서 다시 관찰', '정상 조건 확인으로 판단 갱신'];
  const out: Assessment[] = [];
  for (let k = 1; k < n; k++) {
    out.push({ id: `a-${seed}-${k}`, at: at(60 - k * 11 - (seed % 5), 9 + k), actor: PEOPLE[(seed + k) % PEOPLE.length]!, axis: k === 2 && n > 3 ? 'processing' : 'verification',
      from: k === 2 && n > 3 ? 'open' : steps[k - 1]!, to: k === 2 && n > 3 ? 'under_investigation' : steps[k]!, reason: reasons[k]!, evidenceId: k % 2 ? `e-${seed}-0` : undefined });
  }
  out.unshift({ id: `a-${seed}-0`, at: at(70 - (seed % 5), 9), actor: PEOPLE[seed % PEOPLE.length]!, axis: 'publication', from: 'draft', to: 'published', reason: '검토 승인 후 게시 (검증과 별개)' });
  return out;
}

const mx200 = MODELS[0]!;
const mx200sw = SOFTWARE.filter(s => s.modelId === mx200.id);

export const ITEMS: Item[] = [];
ITEMS.push({
  id: 'KI-101', title: 'STEP_PROCESS 선행 발생 확인 필요', ownerKind: 'software', ownerId: mx200sw[2]!.id, type: 'check', category: '이벤트 순서', tags: ['PM1', 'START_END'],
  author: '김하늘', createdAt: day(70), updatedAt: day(3), publication: 'published', verification: 'disputed', processing: 'under_investigation',
  body: {
    observed: 'PM1에서 STEP_PROCESS가 STEP_START보다 120–300 ms 먼저 기록됩니다. 레시피 교체 직후 첫 웨이퍼에서만 재현되며 10월 로그 3건(행 범위는 근거 참조)에서 같은 순서가 보입니다.',
    expected: 'SW v3.2.1 이벤트 명세 §4.2: STEP_START → STEP_PROCESS → STEP_END 순서, 같은 STEP_ID. 기준 Spec 리비전 r3.',
    analysis: '레시피 로드 완료 신호보다 공정 시작 타이머가 먼저 도는 것으로 추정합니다. 제조사는 정상 동작이라고 설명했으나, 같은 조건의 v3.1.0 로그에서는 보이지 않아 이견이 있습니다.',
    improvement: '제조사에 레시피 교체 직후 타이머 시작 조건 확인 요청. v3.3.0에서 재현 여부를 다시 확인합니다.',
  },
  evidence: evidenceFor(3, 101), revisions: [{ rev: 1, at: at(70, 9), by: '김하늘', note: '최초 작성' }, { rev: 2, at: at(40, 14), by: '이도윤', note: '재현 조건 보강' }, { rev: 3, at: at(3, 11), by: '김하늘', note: '제조사 설명 반영, 분석 의견 수정' }],
  history: historyFor(5, 101, 'disputed'), links: [{ kind: 'similar', itemId: 'KI-117' }],
});
ITEMS.push({
  id: 'KI-102', title: 'STEP_PROCESS 선행 발생 — v3.3.0 재현 확인', ownerKind: 'software', ownerId: mx200sw[3]!.id, type: 'check', category: '이벤트 순서', tags: ['PM1'],
  author: '이도윤', createdAt: day(12), updatedAt: day(12), publication: 'published', verification: 'not_checked', processing: 'open',
  body: { observed: 'v3.3.0 로그에서 아직 관찰하지 않았습니다.', expected: 'SW v3.3.0 이벤트 명세 §4.2 (확인 전).', analysis: 'KI-101 r2의 분석을 참고 초안으로 가져왔습니다. v3.3.0에 그대로 적용되는지는 확인되지 않았습니다.', improvement: 'v3.3.0 로그 수집 후 재현 여부 기록.' },
  evidence: [], revisions: [{ rev: 1, at: at(12, 10), by: '이도윤', note: 'KI-101 r2에서 파생 작성' }],
  history: [{ id: 'a-102-0', at: at(12, 10), actor: '이도윤', axis: 'publication', from: 'draft', to: 'published', reason: '검토 승인 후 게시 (검증과 별개)' }],
  links: [{ kind: 'derived_from', itemId: 'KI-101', rev: 2 }],
});
ITEMS.push({
  id: 'KI-103', title: 'MX-200 PM 종료 후 IDLE 전환 기준', ownerKind: 'model', ownerId: mx200.id, type: 'standard', category: '작업 절차', tags: ['PM', 'IDLE'],
  author: '박서연', createdAt: day(90), updatedAt: day(30), publication: 'published', verification: 'verified', processing: 'resolved',
  body: { observed: 'PM 종료 후 IDLE 전환까지 평균 42초가 걸립니다.', expected: '모델 공통 작업 기준: PM_END 후 60초 안에 IDLE.', analysis: '모든 SW 버전에서 같은 기준을 쓰는 것으로 보이나 공통 명세로 확정되지는 않았습니다.', improvement: '없음 — 기준 유지.' },
  evidence: evidenceFor(2, 103), revisions: [{ rev: 1, at: at(90, 9), by: '박서연', note: '최초 작성' }], history: historyFor(3, 103, 'verified'), links: [],
});
for (let k = 4; k <= 80; k++) {
  const model = MODELS[(k * 7) % 60]!;
  const sws = SOFTWARE.filter(s => s.modelId === model.id);
  const swOwned = sws.length > 0 && k % 3 !== 0;
  const verification = VERIFS[k % 4]!;
  const nEvidence = k === 9 ? 0 : 1 + (k % 3);
  const nRev = k % 7 === 0 ? 3 : k % 4 === 0 ? 2 : 1;
  ITEMS.push({
    id: `KI-${100 + k}`, title: `${TITLES[k % TITLES.length]}${k > 10 ? ` (${model.code})` : ''}`, ownerKind: swOwned ? 'software' : 'model', ownerId: swOwned ? sws[k % sws.length]!.id : model.id,
    type: TYPES[k % 4]!, category: CATEGORIES[k % 5]!, tags: [pick(['PM1', 'PM2', 'LOAD', 'ALARM'])], author: PEOPLE[k % PEOPLE.length]!, createdAt: day(30 + k), updatedAt: day(k % 40),
    publication: k === 13 ? 'archived' : k % 11 === 0 ? 'draft' : 'published', verification, processing: PROCS[k % 3]!,
    body: { observed: '합성 관찰 사실입니다. 이벤트와 시각, 재현 조건을 적습니다.', expected: '합성 기대 기준입니다. 명세 출처와 버전을 적습니다.', analysis: '합성 분석 의견입니다. 추정이며 사실로 승격되지 않습니다.', improvement: '합성 개선 방향입니다.' },
    evidence: evidenceFor(nEvidence, k), revisions: Array.from({ length: nRev }, (_, r) => ({ rev: r + 1, at: at(30 + k - r * 9, 10), by: PEOPLE[(k + r) % PEOPLE.length]!, note: r === 0 ? '최초 작성' : '본문 보강' })),
    history: historyFor(2 + (k % 4), k, verification), links: [],
  });
}

export const vendorById = new Map(VENDORS.map(v => [v.id, v]));
export const processById = new Map(PROCESSES.map(p => [p.id, p]));
export const modelById = new Map(MODELS.map(m => [m.id, m]));
export const softwareById = new Map(SOFTWARE.map(s => [s.id, s]));

/** `MX-200` or `MX-200 / v3.2.1`: the single owner, never shared or inherited. */
export function ownerLabel(item: Pick<Item, 'ownerKind' | 'ownerId'>): string {
  if (item.ownerKind === 'model') return modelById.get(item.ownerId)?.code ?? item.ownerId;
  const sw = softwareById.get(item.ownerId);
  return sw ? `${modelById.get(sw.modelId)?.code ?? '?'} / ${sw.version}` : item.ownerId;
}
export function ownerModelId(item: Pick<Item, 'ownerKind' | 'ownerId'>): string | null {
  return item.ownerKind === 'model' ? item.ownerId : softwareById.get(item.ownerId)?.modelId ?? null;
}
