import { defined } from '../../../../test-support/defined.js';

// Evaluation corpus of the knowledge search (#1508 S-e, design log-knowledge-search §6). Pure and DB-free; every value is SYNTHETIC.
// `buildCorpus` is deterministic: the same options give the same items, queries and ground truth. The ground truth is stated by
// INTENT (which Items a person would expect for the query) and never derived by calling the search code; for direction queries it is
// computed from the Event relation records of each Item, not from text.

export type QueryType = 'exact_token' | 'snake_camel' | 'alias' | 'typo' | 'korean' | 'direction_forward' | 'direction_reverse' | 'observed_expected' | 'same_event_other_sw';
export const QUERY_TYPES: readonly QueryType[] = ['exact_token', 'snake_camel', 'alias', 'typo', 'korean', 'direction_forward', 'direction_reverse', 'observed_expected', 'same_event_other_sw'];

export type OwnerRef = { model: string } | { software: string };
export interface RelationSpec {
  kind: 'observed' | 'expected';
  source: string;
  target: string;
}
export interface CorpusItem {
  /** Corpus-local key (`i0007`); the loader maps it to the database id. */
  key: string;
  owner: OwnerRef;
  title: string;
  observation: string;
  relations: RelationSpec[];
}
export interface ConceptSpec {
  label: string;
  members: { model: string; key: string; state: 'confirmed' | 'proposed' | 'rejected' }[];
}
export interface EvalQuery {
  id: string;
  type: QueryType;
  /** What the person typed. */
  q: string;
  /** Relation kind filter of a direction query. */
  kind?: 'observed' | 'expected' | 'all';
  /** Restricts the search to one owner (a Model with its SW versions, or one SW version). */
  owner?: { model: string; includeSoftware: boolean } | { software: string };
  includeOpposite?: boolean;
  /** Item keys the main result should hold. */
  relevant: string[];
  /** Direction queries: Item keys that carry the OTHER direction only. A hit here is a direction counter-example. */
  otherDirection?: string[];
  /** observed/expected queries: Item keys whose matching records are of the OTHER kind only. A hit here is a kind violation. */
  otherKind?: string[];
}
export interface Corpus {
  models: string[];
  software: { code: string; model: string }[];
  items: CorpusItem[];
  concepts: ConceptSpec[];
  queries: EvalQuery[];
  /** Query types the corpus cannot test, with the reason (printed in the report). */
  skipped: { type: QueryType; reason: string }[];
}
export interface CorpusOptions {
  /** Noise Items on top of the probe Items. */
  fillerItems: number;
  seed?: number;
}

export const MODELS = ['M1', 'M2', 'M3', 'M4', 'M5'] as const;
export const SOFTWARE = [
  { code: 'SW1', model: 'M1' },
  { code: 'SW2', model: 'M1' },
] as const;

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const eventPart = (key: string): string => key.slice(key.lastIndexOf('/') + 1).toLowerCase();
/** A record `kind` matches an Event token pair when source and target carry those Events (whole key or its Event part). */
const hasDirection = (item: CorpusItem, a: string, b: string, kind: 'observed' | 'expected' | 'all'): boolean =>
  item.relations.some((r) => (kind === 'all' || r.kind === kind) && eventPart(r.source) === a.toLowerCase() && eventPart(r.target) === b.toLowerCase());

const toSnake = (camel: string): string => camel.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const SYLLABLES = ['ka', 'vo', 'mi', 'ze', 'tu', 'ra', 'ni', 'so', 'be', 'lu', 'qua', 'fi', 'do', 'xa', 'pe', 'gro'];
/** Filler vocabulary: made-up words that share no probe word, built from syllables, ~300 distinct words. */
function fillerWords(random: () => number, reserved: ReadonlySet<string>): string[] {
  const words = new Set<string>();
  while (words.size < 300) {
    const n = 2 + Math.floor(random() * 3);
    let w = '';
    for (let i = 0; i < n; i++) w += SYLLABLES[Math.floor(random() * SYLLABLES.length)];
    if (!reserved.has(w)) words.add(w);
  }
  return [...words];
}

const KOREAN_TERMS = ['압력센서', '진공펌프', '웨이퍼정렬', '냉각수누수', '가스유량', '히터온도'];
const KOREAN_DOC_PARTICLES = ['는', '를', '에서', '은'];
const CAMEL_NAMES = ['purgeValveLeak', 'chuckVacuumLoss', 'lampPowerDrift', 'slitDoorStick', 'rfMatchReflect', 'gasLineClog', 'edgeRingWear', 'lifterPinJam'];
/** [word, typo]: dropped letter, swapped letters, doubled letter, wrong letter, dropped letter, swapped letters. */
const TYPOS: [string, string][] = [
  ['calibration', 'calibraton'],
  ['interlock', 'intelrock'],
  ['throttle', 'throttlle'],
  ['susceptor', 'susceptar'],
  ['electrostatic', 'electrostaic'],
  ['deposition', 'depositoin'],
];

export function buildCorpus(options: CorpusOptions): Corpus {
  const random = rng(options.seed ?? 1508);
  const items: CorpusItem[] = [];
  const queries: EvalQuery[] = [];
  const reserved = new Set<string>();
  const reserve = (...words: string[]) => {
    for (const w of words) reserved.add(w.toLowerCase());
  };
  const add = (owner: OwnerRef, title: string, observation: string, relations: RelationSpec[] = []): string => {
    const key = `i${String(items.length).padStart(6, '0')}`;
    items.push({ key, owner, title, observation, relations });
    return key;
  };
  const m1: OwnerRef = { model: 'M1' };

  // ---- exact token: a unique word in the text, and a unique Event key --------------------------------------------------
  for (let g = 0; g < 4; g++) {
    const token = `lotmismatch${g}`;
    reserve(token);
    const keys = [0, 1, 2].map((n) => add(m1, `Lot mismatch ${token} case ${n}`, `The recipe lot differs from the carrier lot ${token} on chamber ${n}.`));
    queries.push({ id: `exact-text-${g}`, type: 'exact_token', q: token, relevant: keys });
  }
  for (let g = 0; g < 4; g++) {
    const ramp = `OVEN/HEATER_RAMP_${g}`;
    const hold = `OVEN/HEATER_HOLD_${g}`;
    reserve(`heater_ramp_${g}`, `heater_hold_${g}`);
    const keys = [0, 1, 2].map((n) => add(m1, `Heater step ${n} of group ${g}`, `Zone temperature overshoots during the step, run ${n}.`, [{ kind: 'observed', source: ramp, target: hold }]));
    queries.push({ id: `exact-key-${g}`, type: 'exact_token', q: `heater_ramp_${g}`, relevant: keys });
  }

  // ---- snake / camel variants: documents in one form, the query in the other -------------------------------------------
  CAMEL_NAMES.forEach((camel, g) => {
    const snake = toSnake(camel);
    reserve(camel, snake);
    const docInCamel = g < 4;
    const written = docInCamel ? camel : snake;
    const keys = [0, 1, 2].map((n) => add(m1, `Fault ${written} observed`, `Operators noted ${written} again in shift ${n}.`));
    queries.push({ id: `snake-camel-${g}`, type: 'snake_camel', q: docInCamel ? snake : camel, relevant: keys });
  });

  // ---- typo: one wrong character in a technical word -------------------------------------------------------------------
  TYPOS.forEach(([word, typo], g) => {
    reserve(word, typo);
    const keys = [0, 1, 2].map((n) => add(m1, `${word} drift seen`, `The ${word} step reports a deviation, case ${n}.`));
    queries.push({ id: `typo-${g}`, type: 'typo', q: typo, relevant: keys });
  });

  // ---- Korean technical terms with particles ---------------------------------------------------------------------------
  KOREAN_TERMS.forEach((term, g) => {
    reserve(term);
    const keys = KOREAN_DOC_PARTICLES.map((p, n) => add(m1, `${term}${p} 불안정함 ${n}`, `${term}${p} 교대 근무 중 값이 흔들렸다. 점검 필요 ${n}.`));
    // The first three terms are queried as written, the others with a particle that no document uses.
    queries.push({ id: `korean-${g}`, type: 'korean', q: g < 3 ? term : `${term}가`, relevant: keys });
  });

  // ---- direction, observed / expected ----------------------------------------------------------------------------------
  for (let g = 0; g < 5; g++) {
    const a = `STEP_PROCESS_${g}`;
    const b = `PROCESS_START_${g}`;
    reserve(a, b);
    const A = `STEP/${a}`;
    const B = `STEP/${b}`;
    add(m1, `Forward observed ${g} a`, `${a} then ${b}, seen on the tool.`, [{ kind: 'observed', source: A, target: B }]);
    add(m1, `Forward observed ${g} b`, `Order as designed on the tool.`, [{ kind: 'observed', source: A, target: B }]);
    add(m1, `Forward expected ${g}`, `The spec says the order is fixed.`, [{ kind: 'expected', source: A, target: B }]);
    add(m1, `Reverse observed ${g} a`, `Order inverted on the tool.`, [{ kind: 'observed', source: B, target: A }]);
    add(m1, `Reverse observed ${g} b`, `Order inverted on the tool, second tool.`, [{ kind: 'observed', source: B, target: A }]);
    add(m1, `Reverse expected ${g}`, `The spec for the other model says the opposite.`, [{ kind: 'expected', source: B, target: A }]);
    add(m1, `Both directions ${g}`, `Both orders were seen in one lot.`, [
      { kind: 'observed', source: A, target: B },
      { kind: 'observed', source: B, target: A },
    ]);
    add(m1, `Text only ${g}`, `The note mentions ${a} and ${b} but records no order.`);
  }
  // Ground truth by the records of each probe Item (see the header comment).
  for (let g = 0; g < 5; g++) {
    const a = `STEP_PROCESS_${g}`;
    const b = `PROCESS_START_${g}`;
    const pool = items.filter((it) => it.relations.some((r) => eventPart(r.source) === a.toLowerCase() || eventPart(r.source) === b.toLowerCase()));
    const keysOf = (pred: (it: CorpusItem) => boolean) => pool.filter(pred).map((it) => it.key);
    const forward = keysOf((it) => hasDirection(it, a, b, 'all'));
    const reverse = keysOf((it) => hasDirection(it, b, a, 'all'));
    const reverseOnly = keysOf((it) => hasDirection(it, b, a, 'all') && !hasDirection(it, a, b, 'all'));
    const forwardOnly = keysOf((it) => hasDirection(it, a, b, 'all') && !hasDirection(it, b, a, 'all'));
    const variantsForward = [`${a} before ${b}`, `${a}→${b}`, `${b} after ${a}`];
    const variantsReverse = [`${b} before ${a}`, `${b}→${a}`, `${a} after ${b}`];
    variantsForward.forEach((q, n) => queries.push({ id: `dir-fwd-${g}-${n}`, type: 'direction_forward', q, kind: 'all', includeOpposite: n === 0, relevant: forward, otherDirection: reverseOnly }));
    variantsReverse.forEach((q, n) => queries.push({ id: `dir-rev-${g}-${n}`, type: 'direction_reverse', q, kind: 'all', includeOpposite: n === 0, relevant: reverse, otherDirection: forwardOnly }));
    // observed only: expected-only forward records are not a hit; expected only: observed-only forward records are not.
    const fwdObserved = keysOf((it) => hasDirection(it, a, b, 'observed'));
    const fwdExpected = keysOf((it) => hasDirection(it, a, b, 'expected'));
    queries.push({ id: `kind-obs-${g}`, type: 'observed_expected', q: `${a} before ${b}`, kind: 'observed', relevant: fwdObserved, otherKind: fwdExpected.filter((k) => !fwdObserved.includes(k)), otherDirection: reverseOnly });
    queries.push({ id: `kind-exp-${g}`, type: 'observed_expected', q: `${a} before ${b}`, kind: 'expected', relevant: fwdExpected, otherKind: fwdObserved.filter((k) => !fwdExpected.includes(k)), otherDirection: reverseOnly });
  }

  // ---- the same Event name in different SW versions / Models, and concept mappings -------------------------------------
  const up = 'OVEN_TEMP_UP';
  const soak = 'OVEN_TEMP_SOAK';
  reserve(up, soak, 'zone_rise', 'zone_soak');
  const rel = (kind: 'observed' | 'expected', s: string, t: string): RelationSpec[] => [{ kind, source: s, target: t }];
  const sameEvent: Record<string, string[]> = {};
  const group = (label: string): string[] => defined(sameEvent[label], label);
  const place = (label: string, owner: OwnerRef, source: string, target: string) => {
    sameEvent[label] = [0, 1].map((n) => add(owner, `${label} oven ramp ${n}`, `Ramp seen on ${label}.`, rel('observed', source, target)));
  };
  place('SW1', { software: 'SW1' }, `OVEN/${up}`, `OVEN/${soak}`);
  place('SW2', { software: 'SW2' }, `OVEN/${up}`, `OVEN/${soak}`);
  place('M2', { model: 'M2' }, `OVEN/${up}`, `OVEN/${soak}`);
  place('M4', { model: 'M4' }, 'ZONE/ZONE_RISE', 'ZONE/ZONE_SOAK'); // confirmed mapping to the OVEN pair
  place('M5', { model: 'M5' }, 'HEAT/HEAT_RISE', 'HEAT/HEAT_SOAK'); // only a proposed mapping: never a hit
  const concepts: ConceptSpec[] = [
    { label: 'Oven temp up', members: [{ model: 'M1', key: `OVEN/${up}`, state: 'confirmed' }, { model: 'M2', key: `OVEN/${up}`, state: 'confirmed' }, { model: 'M4', key: 'ZONE/ZONE_RISE', state: 'confirmed' }, { model: 'M5', key: 'HEAT/HEAT_RISE', state: 'proposed' }] },
    { label: 'Oven temp soak', members: [{ model: 'M1', key: `OVEN/${soak}`, state: 'confirmed' }, { model: 'M2', key: `OVEN/${soak}`, state: 'confirmed' }, { model: 'M4', key: 'ZONE/ZONE_SOAK', state: 'confirmed' }, { model: 'M5', key: 'HEAT/HEAT_SOAK', state: 'proposed' }] },
  ];
  // The oven pair is carried by SW1, SW2 and M2 under one key; M4 reaches it through the confirmed concept, M5 does not.
  const inclusive = [...group('SW1'), ...group('SW2'), ...group('M2'), ...group('M4')];
  queries.push({ id: 'same-event-all', type: 'same_event_other_sw', q: `${up} before ${soak}`, kind: 'all', relevant: inclusive });
  queries.push({ id: 'same-event-sw1', type: 'same_event_other_sw', q: `${up} before ${soak}`, kind: 'all', owner: { software: 'SW1' }, relevant: group('SW1') });
  queries.push({ id: 'same-event-sw2', type: 'same_event_other_sw', q: `${up} before ${soak}`, kind: 'all', owner: { software: 'SW2' }, relevant: group('SW2') });
  queries.push({ id: 'same-event-m1-with-sw', type: 'same_event_other_sw', q: `${up} before ${soak}`, kind: 'all', owner: { model: 'M1', includeSoftware: true }, relevant: [...group('SW1'), ...group('SW2')] });

  // ---- filler noise ----------------------------------------------------------------------------------------------------
  const words = fillerWords(random, reserved);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
  const owners: OwnerRef[] = [...MODELS.map((model) => ({ model })), ...SOFTWARE.map((s) => ({ software: s.code }))];
  for (let n = 0; n < options.fillerItems; n++) {
    const relations: RelationSpec[] = [];
    if (random() < 0.5) {
      const s = Math.floor(random() * 300);
      const t = (s + 1 + Math.floor(random() * 299)) % 300;
      relations.push({ kind: random() < 0.8 ? 'observed' : 'expected', source: `FILL/F_${words[s % words.length]}${s}`, target: `FILL/F_${words[t % words.length]}${t}` });
    }
    add(pick(owners), `${pick(words)} ${pick(words)} ${pick(words)}`, `${pick(words)} ${pick(words)} ${pick(words)} ${pick(words)} ${pick(words)} ${pick(words)}.`, relations);
  }

  return {
    models: [...MODELS],
    software: SOFTWARE.map((s) => ({ ...s })),
    items,
    concepts,
    queries,
    skipped: [{ type: 'alias', reason: 'No alias exists in code yet (design §3.3: alias approval/revocation is not applicable; SearchReason approved_alias has no hit stage in the PG adapter). Add alias queries when the alias node lands.' }],
  };
}
