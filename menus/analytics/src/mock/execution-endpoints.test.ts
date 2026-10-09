import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineEndpoint, emptyGlobal, projectContext, shift, type Capability, type ContextKey, type GlobalContext, type MenuMeta } from '@ap/contracts';
import { createMockAdapter, cycleMinutes, DATA_THROUGH, defineMockEndpoint, EQUIPMENT, getRole, jobsForEquipmentDay, setRole, type AnyMockEndpoint, type RoleId } from '@ap/mock-server';
import { executionOccurrence } from './execution';
import { occurrenceEndpoint, type Execution, type OccurrenceParams, type OccurrenceResult } from '../endpoints';
import { allExecutions } from './cycle';

const none: Record<ContextKey, Capability> = {
  time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported',
  lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported',
};

/** Inline mirror of execution-detail's registration fields: every Context key is reference-only. */
const executionMenu: MenuMeta = {
  id: 'execution-detail',
  group: 'analytics',
  label: { ko: '실행 상세', en: 'Execution detail' },
  description: { ko: '', en: '' },
  path: '/analytics/executions/:equipmentId',
  permission: 'analytics:view',
  requiresScope: true,
  context: {
    ...none,
    time: 'reference', roomNames: 'reference', condition: 'reference', selection: 'reference',
    lot: 'reference', ppid: 'reference', recipe: 'reference', metric: 'reference',
  },
  pageType: 'analysis',
  features: { export: false, savedView: false, annotate: false, compare: false },
  pageKeys: ['entityType', 'anchor', 'returnTo'],
};

const registry = { menus: [executionMenu] };
const adapter = createMockAdapter({ endpoints: [executionOccurrence], registry });
const seededExecutions = allExecutions();
const previousRole: RoleId = getRole();
beforeEach(() => { setRole('engineer'); });
afterEach(() => { setRole(previousRole); });

function grantedExecution(before?: string): Execution {
  const result = seededExecutions.find(execution => {
    const equipment = EQUIPMENT.find(row => row.equipmentId === execution.equipmentId);
    return equipment?.site === 'ICH'
      && ['PHOTO', 'ETCH', 'CVD'].includes(equipment.room)
      && (before === undefined || execution.anchor < before);
  });
  if (!result) throw new Error('expected a seeded execution in an engineer-granted ICH room');
  return result;
}

function occurrenceParams(overrides: Partial<OccurrenceParams> = {}): OccurrenceParams {
  const execution = grantedExecution();
  return {
    equipmentId: execution.equipmentId,
    entityType: 'job',
    anchor: execution.anchor,
    metricVersion: '3',
    ...overrides,
  };
}

describe('execution-detail occurrence endpoint registration', () => {
  it('registers for an all-reference, scope-required manifest and rejects an applied room filter', () => {
    expect(() => createMockAdapter({ endpoints: [executionOccurrence], registry })).not.toThrow();

    const roomFilteredEndpoint = defineMockEndpoint(
      defineEndpoint<OccurrenceParams, OccurrenceResult>({
        ...occurrenceEndpoint,
        id: 'analytics.execution.occurrence.bad-room-filter',
        context: { roomNames: 'apply' },
      }),
      { handle: (): OccurrenceResult => ({ access: 'missing' }) },
    );
    expect(() => createMockAdapter({ endpoints: [roomFilteredEndpoint], registry })).toThrow(/does not apply context roomNames/);
  });
});

describe('execution-detail occurrence endpoint behavior', () => {
  it('rejects carried reference-only Context and accepts a request matching its projection', async () => {
    const from = '2026-06-28T09:00:00';
    const execution = grantedExecution(from);
    const outsideGrant = EQUIPMENT.find(row => row.site === 'ICH' && row.room === 'DIFF');
    if (!outsideGrant) throw new Error('expected seeded equipment in ungranted ICH room DIFF');

    let seenContext: GlobalContext | undefined;
    const handler = executionOccurrence;
    const observedHandler: AnyMockEndpoint = {
      ...handler,
      handle: input => {
        seenContext = input.context;
        return handler.handle(input);
      },
    };
    const observedAdapter = createMockAdapter({
      endpoints: [observedHandler],
      registry,
    });

    const params = {
      equipmentId: execution.equipmentId,
      entityType: 'job',
      anchor: execution.anchor,
      metricVersion: '3',
    };
    const withReferenceContext = await observedAdapter.menuQuery({
      endpoint: occurrenceEndpoint.id,
      context: { scopeId: 'ICH', roomNames: ['DIFF'], selection: [outsideGrant.equipmentId] },
      params,
    });
    expect(withReferenceContext.outcome).toBe('error');
    expect(withReferenceContext.message).toContain('roomNames');
    expect(seenContext).toBeUndefined();

    const wellFormed = await observedAdapter.menuQuery({
      endpoint: occurrenceEndpoint.id,
      context: { scopeId: 'ICH' },
      params,
    });
    expect(['ok', 'empty']).toContain(wellFormed.outcome);
    expect(wellFormed.outcome).not.toBe('too_large');
    expect((wellFormed.data as OccurrenceResult | null)?.access).toBe('ok');
    expect(seenContext).toMatchObject({ scopeId: 'ICH', roomNames: null, selection: null });
    expect(wellFormed.trust?.metricVersion).toBe(params.metricVersion);
  });

  it('returns granted, forbidden, and missing access states and pins declared kinds', async () => {
    const execution = grantedExecution();
    const outsideGrant = EQUIPMENT.find(row => row.site === 'ICH' && row.room === 'DIFF');
    if (!outsideGrant) throw new Error('expected seeded equipment in ungranted ICH room DIFF');
    const kinds = ['collection', 'processing_delay', 'coverage'];
    expect(occurrenceEndpoint.kinds).toEqual(kinds);

    const granted = await adapter.menuQuery({
      endpoint: occurrenceEndpoint.id,
      context: { scopeId: 'ICH' },
      params: occurrenceParams({ equipmentId: execution.equipmentId, anchor: execution.anchor }),
    });
    expect(granted.outcome).toBe('ok');
    expect((granted.data as OccurrenceResult | null)?.access).toBe('ok');
    expect(granted.assessments.map(({ kind }) => kind)).toEqual(kinds);
    expect(granted.trust?.metricVersion).toBe('3');

    const forbidden = await adapter.menuQuery({
      endpoint: occurrenceEndpoint.id,
      context: { scopeId: 'ICH' },
      params: occurrenceParams({ equipmentId: outsideGrant.equipmentId, anchor: execution.anchor }),
    });
    expect(forbidden.outcome).toBe('ok');
    expect((forbidden.data as OccurrenceResult | null)?.access).toBe('forbidden');

    const missing = await adapter.menuQuery({
      endpoint: occurrenceEndpoint.id,
      context: { scopeId: 'ICH' },
      params: occurrenceParams({ equipmentId: 'UNKNOWN-EQUIPMENT' }),
    });
    expect(missing.outcome).toBe('empty');
  });

  it('computes cycleMin per the requested metricVersion and echoes that version into Data Trust', async () => {
    const execution = grantedExecution();
    const equipment = EQUIPMENT.find(row => row.equipmentId === execution.equipmentId);
    if (!equipment) throw new Error('expected seeded equipment for the granted execution');
    const job = jobsForEquipmentDay(equipment, execution.anchor.slice(0, 10)).find(item => item.anchor === execution.anchor);
    if (!job) throw new Error('expected the seeded job behind the granted execution');
    expect(job.cycleMinV3).not.toBe(job.cycleMinV4);

    const fetchOccurrence = async (metricVersion: string) => {
      const response = await adapter.menuQuery({
        endpoint: occurrenceEndpoint.id,
        context: { scopeId: 'ICH' },
        params: occurrenceParams({ equipmentId: execution.equipmentId, anchor: execution.anchor, metricVersion }),
      });
      expect(response.outcome).toBe('ok');
      const data = response.data as OccurrenceResult | null;
      if (!data || data.access !== 'ok') throw new Error('expected an ok occurrence');
      return { response, data };
    };

    const v3 = await fetchOccurrence('3');
    expect(v3.data.execution.cycleMin).toBe(cycleMinutes(job, '3'));

    const v4 = await fetchOccurrence('4');
    expect(v4.data.execution.cycleMin).toBe(cycleMinutes(job, '4'));
    expect(v4.response.trust?.metricVersion).toBe('4');
  });

  // #123: an unknown version used to come back as "v999" in Data Trust over v3 figures.
  it('rejects a metricVersion the cycle_time series does not have instead of computing v3 under its label', async () => {
    const execution = grantedExecution();
    for (const metricVersion of ['999', '2']) {
      const response = await adapter.menuQuery({
        endpoint: occurrenceEndpoint.id,
        context: { scopeId: 'ICH' },
        params: occurrenceParams({ equipmentId: execution.equipmentId, anchor: execution.anchor, metricVersion }),
      });
      expect(response).toMatchObject({ outcome: 'error', data: null, trust: null });
      expect(response.message).toContain(`metricVersion ${metricVersion}`);
    }
  });

  it('rejects a non-job entityType and a malformed anchor on an otherwise valid identity', async () => {
    const execution = grantedExecution();

    // Same valid equipment/anchor, but entityType the page cannot open (identity is (equipmentId, entityType, anchor), 06 §22).
    const nonJob = await adapter.menuQuery({
      endpoint: occurrenceEndpoint.id,
      context: { scopeId: 'ICH' },
      params: occurrenceParams({ entityType: 'lot' }),
    });
    expect(nonJob.outcome).toBe('empty');
    expect((nonJob.data as OccurrenceResult | null)?.access).toBe('missing');

    // Matches the YYYY-MM-DDTHH:mm:ss shape but is not a real calendar time.
    const malformedAnchor = await adapter.menuQuery({
      endpoint: occurrenceEndpoint.id,
      context: { scopeId: 'ICH' },
      params: occurrenceParams({ anchor: '2026-13-40T25:61:61' }),
    });
    expect(malformedAnchor.outcome).toBe('empty');
    expect((malformedAnchor.data as OccurrenceResult | null)?.access).toBe('missing');
  });
});


describe('execution occurrence provisional follows the object anchor', () => {
  it.each([
    { recent: true, expected: true },
    { recent: false, expected: false },
  ])('returns provisional=$expected for recent=$recent with reference periods', async ({ recent, expected }) => {
    const equipment = EQUIPMENT.find(row => row.site === 'ICH' && row.room === 'PHOTO');
    if (!equipment) throw new Error('expected engineer-granted equipment');
    const boundary = shift(DATA_THROUGH, -24);
    const job = jobsForEquipmentDay(equipment, boundary.slice(0, 10)).find(row => recent ? row.anchor >= boundary : row.anchor < boundary);
    if (!job) throw new Error('expected job on the requested side of the provisional boundary');
    for (const period of [
      { from: shift(DATA_THROUGH, -1), to: DATA_THROUGH },
      { from: shift(DATA_THROUGH, -168), to: DATA_THROUGH },
    ]) {
      const context = projectContext(occurrenceEndpoint, { ...emptyGlobal, scopeId: 'ICH', ...period });
      expect(context).toEqual({ scopeId: 'ICH' });
      const response = await adapter.menuQuery({
        endpoint: occurrenceEndpoint.id, context,
        params: occurrenceParams({ equipmentId: equipment.equipmentId, anchor: job.anchor }),
      });
      expect(response.outcome).toBe('ok');
      expect((response.data as OccurrenceResult).access).toBe('ok');
      expect(response.trust?.provisional).toBe(expected);
    }
    const carried = await adapter.menuQuery({
      endpoint: occurrenceEndpoint.id,
      context: { scopeId: 'ICH', from: shift(DATA_THROUGH, -1), to: DATA_THROUGH },
      params: occurrenceParams({ equipmentId: equipment.equipmentId, anchor: job.anchor }),
    });
    expect(carried.outcome).toBe('error');
    expect(carried.trust).toBeNull();
  });

  it('returns false for a missing occurrence even with a recent identity anchor', async () => {
    const response = await adapter.menuQuery({
      endpoint: occurrenceEndpoint.id, context: { scopeId: 'ICH' },
      params: occurrenceParams({ equipmentId: 'UNKNOWN-EQUIPMENT', anchor: DATA_THROUGH }),
    });
    expect(response.outcome).toBe('empty');
    expect(response.trust?.provisional).toBe(false);
  });
});
