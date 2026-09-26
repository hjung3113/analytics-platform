import { describe, expect, it } from 'vitest';
import { evaluateTimeDomainMerge, serve, setScenario } from './server';
import { emptyGlobal, type GlobalContext } from '@ap/contracts';
import {
  DEFAULT_RANGE_TO, EQUIPMENT, LATE_TIME_DOMAIN_EQUIPMENT_IDS, TIME_DOMAIN_ASSERTIONS,
  TIME_DOMAIN_LATE_FROM, TIME_DOMAIN_OPEN_END, TIME_DOMAIN_SEEDED_FROM, type TimeDomainAssertion,
} from './world';

const DAY_FROM = '2026-09-25T09:00:00';
const WEEK_FROM = '2026-09-19T09:00:00';
const WEEK_TO = DEFAULT_RANGE_TO;

function ctx(over: Partial<GlobalContext> = {}): GlobalContext {
  return { ...emptyGlobal, scopeId: 'ICH', from: DAY_FROM, to: DEFAULT_RANGE_TO, ...over };
}

const coveredIch = EQUIPMENT
  .filter(e => e.site === 'ICH' && e.room === 'PH-101' && !LATE_TIME_DOMAIN_EQUIPMENT_IDS.includes(e.equipmentId))
  .map(e => e.equipmentId)
  .sort();

const row = (equipmentId: string, timeDomainId: string, validFrom: string, validTo: string): TimeDomainAssertion =>
  ({ equipmentId, timeDomainId, validFrom, validTo });

describe('time-domain assertions (world)', () => {
  it('pins two late ICH PH-101 tools and maps sites without using master validity', () => {
    expect(LATE_TIME_DOMAIN_EQUIPMENT_IDS).toEqual(['ICH-PHOTO-0103', 'ICH-PHOTO-0105']);
    expect(TIME_DOMAIN_LATE_FROM >= WEEK_FROM && TIME_DOMAIN_LATE_FROM < DEFAULT_RANGE_TO).toBe(true);
    expect(TIME_DOMAIN_LATE_FROM <= DAY_FROM).toBe(true);
    expect(TIME_DOMAIN_ASSERTIONS).toHaveLength(EQUIPMENT.length);
    for (const e of EQUIPMENT) {
      const a = TIME_DOMAIN_ASSERTIONS.filter(x => x.equipmentId === e.equipmentId);
      expect(a).toHaveLength(1);
      expect(a[0].validTo).toBe(TIME_DOMAIN_OPEN_END);
      expect(a[0].validFrom).not.toBe(e.validFrom);
      const late = LATE_TIME_DOMAIN_EQUIPMENT_IDS.includes(e.equipmentId);
      expect(a[0].validFrom).toBe(late ? TIME_DOMAIN_LATE_FROM : TIME_DOMAIN_SEEDED_FROM);
      expect(a[0].timeDomainId).toBe(e.site === 'XIA' ? 'CN-XIA' : 'KR-WALL');
    }
  });
});

describe('evaluateTimeDomainMerge', () => {
  const open = TIME_DOMAIN_OPEN_END;
  const full = TIME_DOMAIN_SEEDED_FROM;

  it('rejects a gap and does not backfill a later assertion', () => {
    const assertions = [
      row('A', 'KR-WALL', TIME_DOMAIN_LATE_FROM, open),
      row('B', 'CN-XIA', full, open),
    ];
    expect(evaluateTimeDomainMerge(['B', 'A'], WEEK_FROM, WEEK_TO, assertions)).toEqual({
      ok: false,
      code: 'time_domain_unverified',
      message: 'time_domain_unverified: A',
    });
  });

  it('rejects two domains when both equipment are fully covered', () => {
    const assertions = [row('A', 'KR-WALL', full, open), row('B', 'CN-XIA', full, open)];
    expect(evaluateTimeDomainMerge(['A', 'B'], DAY_FROM, DEFAULT_RANGE_TO, assertions)).toEqual({
      ok: false,
      code: 'time_domain_mismatch',
      message: 'time_domain_mismatch: CN-XIA, KR-WALL',
    });
  });

  it('rejects a mid-request domain change even when the two segments abut', () => {
    const assertions = [
      row('A', 'KR-WALL', full, '2026-09-20T00:00:00'),
      row('A', 'CN-XIA', '2026-09-20T00:00:00', open),
      row('B', 'KR-WALL', full, open),
    ];
    expect(evaluateTimeDomainMerge(['A', 'B'], WEEK_FROM, WEEK_TO, assertions)).toEqual({
      ok: false,
      code: 'time_domain_mismatch',
      message: 'time_domain_mismatch: CN-XIA, KR-WALL',
    });
  });

  it('accepts abutting segments of the same domain', () => {
    const assertions = [
      row('A', 'KR-WALL', full, '2026-09-20T00:00:00'),
      row('A', 'KR-WALL', '2026-09-20T00:00:00', open),
      row('B', 'KR-WALL', full, open),
    ];
    expect(evaluateTimeDomainMerge(['A', 'B'], WEEK_FROM, WEEK_TO, assertions)).toEqual({ ok: true, timeDomainId: 'KR-WALL' });
  });

  it('treats a one-second hole as unverified', () => {
    const assertions = [
      row('A', 'KR-WALL', full, '2026-09-20T00:00:00'),
      row('A', 'KR-WALL', '2026-09-20T00:00:01', open),
      row('B', 'KR-WALL', full, open),
    ];
    const hole = evaluateTimeDomainMerge(['A', 'B'], WEEK_FROM, WEEK_TO, assertions);
    expect(hole).toEqual({ ok: false, code: 'time_domain_unverified', message: 'time_domain_unverified: A' });
  });

  it('does not treat a missing assertion as proof', () => {
    expect(evaluateTimeDomainMerge(['B', 'A'], DAY_FROM, DEFAULT_RANGE_TO, [])).toEqual({
      ok: false,
      code: 'time_domain_unverified',
      message: 'time_domain_unverified: A, B',
    });
  });
});

describe('serve time-domain guard', () => {
  const kinds = ['collection', 'time_domain'] as const;

  it('errors a 7-day ICH merge and does not compute', async () => {
    const res = await serve({
      role: 'engineer',
      global: ctx({ from: WEEK_FROM, to: WEEK_TO }),
      latency: 0,
      kinds: [...kinds],
      compute: () => { throw new Error('must not merge'); },
    });
    expect(res.outcome).toBe('error');
    expect(res.message).toBe('time_domain_unverified: ICH-PHOTO-0103, ICH-PHOTO-0105');
    expect(res.data).toBeNull();
    expect(res.assessments).toEqual([]);
    expect(res.trust).toBeNull();
    expect(res.correlationId).toMatch(/^corr-/);
  });

  it('passes the default 24h ICH merge with a registry clear', async () => {
    const res = await serve({
      role: 'engineer',
      global: ctx(),
      latency: 0,
      kinds: [...kinds],
      compute: ({ equipment }) => equipment.length,
    });
    expect(res.outcome).toBe('ok');
    expect(res.data).toBeGreaterThan(1);
    expect(res.assessments).toEqual([
      { kind: 'collection', state: 'unknown', reason: 'source_unavailable' },
      { kind: 'time_domain', state: 'clear', statusSource: 'time-domain-registry', observedAt: '2026-09-26T08:58:00', detail: 'KR-WALL' },
    ]);
  });

  it('passes a 7-day CJU merge (no late tools there)', async () => {
    const res = await serve({
      role: 'engineer',
      global: ctx({ scopeId: 'CJU', from: WEEK_FROM, to: WEEK_TO }),
      latency: 0,
      kinds: ['time_domain'],
      compute: ({ equipment }) => equipment.length,
    });
    expect(res.outcome).toBe('ok');
    expect(res.data).toBeGreaterThan(1);
    expect(res.assessments[0]).toMatchObject({ state: 'clear', statusSource: 'time-domain-registry', detail: 'KR-WALL' });
  });

  it('passes a multi-equipment XIA merge as CN-XIA', async () => {
    const res = await serve({
      role: 'admin',
      global: ctx({ scopeId: 'XIA' }),
      latency: 0,
      kinds: ['time_domain'],
      compute: ({ equipment }) => equipment.length,
    });
    expect(res.outcome).toBe('ok');
    expect(res.data).toBeGreaterThan(1);
    expect(res.assessments[0]).toMatchObject({ state: 'clear', detail: 'CN-XIA', statusSource: 'time-domain-registry' });
  });

  it('passes a 7-day selection that excludes the late tools', async () => {
    const res = await serve({
      role: 'engineer',
      global: ctx({ from: WEEK_FROM, to: WEEK_TO, selection: [coveredIch[0], coveredIch[1]] }),
      latency: 0,
      kinds: ['time_domain'],
      compute: ({ equipment }) => equipment.map(e => e.equipmentId),
    });
    expect(res.outcome).toBe('ok');
    expect(res.data).toEqual([coveredIch[0], coveredIch[1]]);
    expect(res.assessments[0]).toMatchObject({ state: 'clear', detail: 'KR-WALL' });
  });

  it('covers the late tools when the request starts at their validFrom', async () => {
    const res = await serve({
      role: 'engineer',
      global: ctx({ from: TIME_DOMAIN_LATE_FROM, to: WEEK_TO, selection: [...LATE_TIME_DOMAIN_EQUIPMENT_IDS] }),
      latency: 0,
      kinds: ['time_domain'],
      compute: ({ equipment }) => equipment.length,
    });
    expect(res.outcome).toBe('ok');
    expect(res.data).toBe(2);
    expect(res.assessments[0]).toMatchObject({ state: 'clear', detail: 'KR-WALL' });
  });

  it('rejects the late tools one second before their validFrom', async () => {
    const res = await serve({
      role: 'engineer',
      global: ctx({ from: '2026-09-21T23:59:59', to: WEEK_TO, selection: [...LATE_TIME_DOMAIN_EQUIPMENT_IDS] }),
      latency: 0,
      compute: () => { throw new Error('must not merge'); },
    });
    expect(res.outcome).toBe('error');
    expect(res.message).toBe('time_domain_unverified: ICH-PHOTO-0103, ICH-PHOTO-0105');
  });

  it('allows one equipment through a gap and does not claim clear', async () => {
    const res = await serve({
      role: 'engineer',
      global: ctx({ from: WEEK_FROM, to: WEEK_TO, selection: [LATE_TIME_DOMAIN_EQUIPMENT_IDS[0]] }),
      latency: 0,
      kinds: ['time_domain'],
      compute: ({ equipment }) => equipment.length,
    });
    expect(res.outcome).toBe('ok');
    expect(res.data).toBe(1);
    expect(res.assessments).toEqual([{ kind: 'time_domain', state: 'unknown', reason: 'source_unavailable' }]);
  });

  it('allows one fully covered equipment to clear', async () => {
    const res = await serve({
      role: 'engineer',
      global: ctx({ from: WEEK_FROM, to: WEEK_TO, selection: [coveredIch[0]] }),
      latency: 0,
      kinds: ['time_domain'],
      compute: ({ equipment }) => equipment.length,
    });
    expect(res.outcome).toBe('ok');
    expect(res.assessments[0]).toMatchObject({ state: 'clear', statusSource: 'time-domain-registry', detail: 'KR-WALL' });
  });

  it('does not turn an explicit empty selection into a time-domain error', async () => {
    const res = await serve({
      role: 'engineer',
      global: ctx({ from: WEEK_FROM, to: WEEK_TO, selection: [] }),
      latency: 0,
      kinds: ['time_domain'],
      compute: ({ equipment }) => equipment,
      isEmpty: rows => rows.length === 0,
    });
    expect(res.outcome).toBe('empty');
    expect(res.message ?? '').not.toMatch(/time_domain_/);
  });

  it('mismatches when one request sees KR-WALL and CN-XIA', async () => {
    const res = await serve({
      role: 'admin',
      global: ctx(),
      requiresScope: false,
      latency: 0,
      compute: () => { throw new Error('must not merge'); },
    });
    expect(res.outcome).toBe('error');
    expect(res.message).toBe('time_domain_mismatch: CN-XIA, KR-WALL');
    expect(res.assessments).toEqual([]);
  });

  it('lets a gap win over a cross-site domain conflict', async () => {
    const res = await serve({
      role: 'admin',
      global: ctx({ from: WEEK_FROM, to: WEEK_TO }),
      requiresScope: false,
      latency: 0,
      compute: () => { throw new Error('must not merge'); },
    });
    expect(res.outcome).toBe('error');
    expect(res.message).toBe('time_domain_unverified: ICH-PHOTO-0103, ICH-PHOTO-0105');
  });

  it('opt-out skips the guard and does not claim clear', async () => {
    const res = await serve({
      role: 'admin',
      global: ctx({ from: WEEK_FROM, to: WEEK_TO }),
      requiresScope: false,
      mergeTimeDomain: false,
      latency: 0,
      kinds: ['time_domain'],
      compute: ({ equipment }) => equipment.length,
    });
    expect(res.outcome).toBe('ok');
    expect(res.data).toBe(EQUIPMENT.length);
    expect(res.assessments).toEqual([{ kind: 'time_domain', state: 'unknown', reason: 'source_unavailable' }]);
  });

  it('does not invent a time_domain assessment, but still rejects an undeclared merge', async () => {
    const ok = await serve({
      role: 'engineer',
      global: ctx(),
      latency: 0,
      compute: () => 1,
    });
    expect(ok.outcome).toBe('ok');
    expect(ok.assessments.map(a => a.kind)).toEqual(['collection', 'processing_delay', 'coverage']);
    const bad = await serve({
      role: 'engineer',
      global: ctx({ from: WEEK_FROM, to: WEEK_TO }),
      latency: 0,
      compute: () => { throw new Error('must not merge'); },
    });
    expect(bad.outcome).toBe('error');
    expect(bad.message?.startsWith('time_domain_unverified')).toBe(true);
  });

  it('does not let the empty scenario disguise an illegal merge', async () => {
    setScenario('empty');
    try {
      const bad = await serve({
        role: 'engineer',
        global: ctx({ from: WEEK_FROM, to: WEEK_TO }),
        latency: 0,
        kinds: ['time_domain'],
        compute: () => { throw new Error('must not merge'); },
      });
      expect(bad.outcome).toBe('error');
      expect(bad.message).toBe('time_domain_unverified: ICH-PHOTO-0103, ICH-PHOTO-0105');
      const quiet = await serve({
        role: 'engineer',
        global: ctx(),
        latency: 0,
        kinds: ['time_domain'],
        compute: () => 1,
        isEmpty: () => true,
      });
      expect(quiet.outcome).toBe('empty');
      expect(quiet.assessments[0]).toMatchObject({ state: 'clear', statusSource: 'time-domain-registry', detail: 'KR-WALL' });
    } finally {
      setScenario('normal');
    }
  });

  it('keeps unknown_status ahead of a passing registry', async () => {
    setScenario('unknown_status');
    try {
      const res = await serve({
        role: 'engineer',
        global: ctx(),
        latency: 0,
        kinds: ['time_domain'],
        compute: () => 1,
      });
      expect(res.outcome).toBe('ok');
      expect(res.assessments).toEqual([{ kind: 'time_domain', state: 'unknown', reason: 'source_unavailable' }]);
    } finally {
      setScenario('normal');
    }
  });

  it('lets scenario error and scope forbidden and too_large win over the guard', async () => {
    setScenario('error');
    try {
      const failed = await serve({
        role: 'engineer',
        global: ctx({ from: WEEK_FROM, to: WEEK_TO }),
        latency: 0,
        compute: () => 1,
      });
      expect(failed).toMatchObject({ outcome: 'error', message: 'Upstream mart query failed' });
    } finally {
      setScenario('normal');
    }
    const denied = await serve({
      role: 'engineer',
      global: ctx({ scopeId: 'XIA', from: WEEK_FROM, to: WEEK_TO }),
      latency: 0,
      compute: () => 1,
    });
    expect(denied.outcome).toBe('forbidden');
    expect(denied.message ?? '').not.toMatch(/time_domain_/);
    const huge = await serve({
      role: 'engineer',
      global: ctx({ from: '2026-06-28T09:00:00', to: DEFAULT_RANGE_TO }),
      maxHours: 24 * 31,
      latency: 0,
      compute: () => { throw new Error('must not run'); },
    });
    expect(huge.outcome).toBe('too_large');
    expect(huge.message ?? '').not.toMatch(/time_domain_/);
  });

  it('does not reject one equipment whose assertions conflict', async () => {
    const id = coveredIch[0];
    TIME_DOMAIN_ASSERTIONS.push(row(id, 'CN-XIA', TIME_DOMAIN_SEEDED_FROM, TIME_DOMAIN_OPEN_END));
    try {
      const alone = await serve({
        role: 'engineer',
        global: ctx({ selection: [id] }),
        latency: 0,
        kinds: ['time_domain'],
        compute: ({ equipment }) => equipment.length,
      });
      expect(alone.outcome).toBe('ok');
      expect(alone.data).toBe(1);
      expect(alone.assessments).toEqual([{ kind: 'time_domain', state: 'unknown', reason: 'source_unavailable' }]);
      const pair = await serve({
        role: 'engineer',
        global: ctx({ selection: [id, coveredIch[1]] }),
        latency: 0,
        compute: () => { throw new Error('must not merge'); },
      });
      expect(pair.outcome).toBe('error');
      expect(pair.message).toBe('time_domain_mismatch: CN-XIA, KR-WALL');
    } finally {
      TIME_DOMAIN_ASSERTIONS.pop();
    }
  });
});
