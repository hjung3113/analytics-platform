import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cleanup, configure, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FocusScreen } from '../src/screens/FocusScreen.js';
import { TopViewScreen } from '../src/screens/TopViewScreen.js';
import { EQV_MOCK_EQUIPMENT, EQV_MOCK_WINDOW, eqvMockContext, eqvMockEquipmentOptions, eqvMockEvents } from '../src/mock-data/index.js';
import { createFake, ok, response, type QueryCall } from './test-support.js';
import { batch } from './replay-fixture.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
configure({ asyncUtilTimeout: 5000 });
afterEach(cleanup);

// What a host's mock server does: answer the two endpoints from the mock data for the applied window.
const mockServer = async ({ id, params }: QueryCall) => {
  if (id === 'eqv.equipment-options') return response('ok', eqvMockEquipmentOptions(), { assessments: [] });
  const { equipmentId, continuationToken } = params as { equipmentId: string; continuationToken?: string };
  return ok(id === 'eqv.topview-context' ? eqvMockContext(equipmentId) : eqvMockEvents({ equipmentId, ...EQV_MOCK_WINDOW, continuationToken }));
};
const PATHS = { topview: '/tools/eqv-topview', focus: '/tools/eqv-focus' } as const;
const hostFor = (name: keyof typeof PATHS, equipment: string) => createFake({ path: PATHS[name], page: { equipment }, context: EQV_MOCK_WINDOW, query: mockServer });
const SCREENS = [['topview', TopViewScreen], ['focus', FocusScreen]] as const;
const NO_DATA = '이 구간에는 관측 자료가 없습니다';

it('discovers the synthetic sample window and a second equipment without data', () => {
  expect(eqvMockEquipmentOptions()).toEqual({ options: [
    { id: 'eq-synth-01', label: 'eq-synth-01', dataRange: { from: '2026-01-01T10:00:00', to: '2026-01-01T10:30:00' } },
    { id: 'eq-synth-02', label: 'eq-synth-02', dataRange: null },
  ] });
});

it('the generated data matches what the generator writes now', () => {
  const committed = readFileSync('src/mock-data/cluster-single.generated.ts', 'utf8');
  expect(execFileSync('node', ['scripts/gen-mock-data.mjs', '--stdout'], { encoding: 'utf8' })).toBe(committed);
});

describe('eqvMockEvents', () => {
  const window = { equipmentId: EQV_MOCK_EQUIPMENT, ...EQV_MOCK_WINDOW };

  it('pages the fixture in Record Sequence order and repeats no issue', () => {
    const first = eqvMockEvents(window);
    const last = eqvMockEvents({ ...window, continuationToken: first.continuationToken });
    expect(first.occurrences).toHaveLength(15);
    expect(first.issues).toEqual([]);
    expect(first.watermark).toEqual({ seq: 30, at: '2026-01-01T10:13:00.000' });
    expect(last.continuationToken).toBeUndefined();
    expect([...first.occurrences, ...last.occurrences]).toEqual(batch.occurrences);
    expect(last.issues).toEqual(batch.issues);
    expect(last.watermark).toEqual(batch.watermark);
    expect([first.from, first.to]).toEqual([batch.from, batch.to]);
  });

  it('keeps a row whose time cannot be judged, drops one outside [from, to), and answers one page when 15 or fewer remain', () => {
    const narrow = eqvMockEvents({ ...window, from: '2026-01-01T10:20:00', to: '2026-01-01T10:25:00' });
    const ids = narrow.occurrences.map(({ id }) => id);
    expect(narrow.continuationToken).toBeUndefined();
    expect(narrow.issues).toEqual(batch.issues);
    expect(ids).toEqual(expect.arrayContaining(['occ-null-time', 'occ-open', 'occ-time-anomaly']));
    expect(ids).not.toContain('occ-efem-out');
  });

  it('windows judged rows half-open: one ending exactly at `from` stays, one starting exactly at `to` goes', () => {
    const [from, to] = ['2026-01-01T10:04:00', '2026-01-01T10:10:00'];
    const judged = batch.occurrences.filter(({ start, end }) => start.at !== null && end?.at != null && start.at <= end.at);
    const endsAtFrom = judged.filter(({ end }) => end?.at === `${from}.000`).map(({ id }) => id);
    const startsAtTo = judged.filter(({ start }) => start.at === `${to}.000`).map(({ id }) => id);
    const ids = eqvMockEvents({ ...window, from, to }).occurrences.map(({ id }) => id);
    expect(endsAtFrom).not.toEqual([]);
    expect(startsAtTo).not.toEqual([]);
    expect(ids).toEqual(expect.arrayContaining(endsAtFrom));
    for (const id of startsAtTo) expect(ids).not.toContain(id);
  });

  it('answers another equipment with one empty page under its own id', () => {
    expect(eqvMockEvents({ ...window, equipmentId: 'eq-other' })).toMatchObject({ equipmentId: 'eq-other', occurrences: [], issues: [], from: batch.from });
  });

  it('returns no occurrences after the fixture watermark and keeps that watermark', () => {
    const afterWatermark = eqvMockEvents({ ...window, from: '2026-09-01T00:00:00', to: '2026-10-01T00:00:00' });

    expect(afterWatermark.occurrences).toEqual([]);
    expect(afterWatermark.issues).toEqual([]);
    expect(afterWatermark.watermark).toEqual(batch.watermark);
  });
});

describe('through the adapter', () => {
  it('Focus renders every fixture Occurrence from the mock, across both pages', async () => {
    const fake = hostFor('focus', EQV_MOCK_EQUIPMENT);
    fake.render(FocusScreen);
    await waitFor(() => expect(document.querySelector('tr[data-occurrence-id="occ-open"]')).not.toBeNull());
    for (const { id } of batch.occurrences) expect(document.querySelector(`tr[data-occurrence-id="${id}"]`), id).not.toBeNull();
    expect(screen.queryByText(/데이터 오류/)).toBeNull();
  });

  // The second listed equipment has no Occurrences, so both replay views show the shared no-data state.
  it.each(SCREENS)('%s: an equipment without data shows the no-data state', async (name, Screen) => {
    const fake = hostFor(name, 'eq-synth-02');
    fake.render(Screen);
    await screen.findByText(NO_DATA);
    expect(screen.getAllByText(NO_DATA)).toHaveLength(1);
    expect(screen.getByText(/마지막 자료 2026-01-01 10:25:00/)).toBeTruthy();
    expect(screen.queryByText(/데이터 오류/)).toBeNull();
    expect(screen.queryByText('이 구간에 표시할 Occurrence가 없습니다')).toBeNull();
    expect(document.querySelector('[data-layer="replay"]')).toBeNull();
    if (name === 'focus') {
      expect(screen.getByRole('button', { name: '변경' })).toBeTruthy();
      expect(screen.queryByRole('heading', { name: 'Gantt' })).toBeNull();
    }
  });

  it('Top View shows no data for a September window with the January fixture', async () => {
    const window = { from: '2026-09-01T00:00:00', to: '2026-10-01T00:00:00' };
    const fake = createFake({
      path: PATHS.topview,
      page: { equipment: EQV_MOCK_EQUIPMENT },
      context: window,
      query: async ({ id, params, context }) => {
        if (id === 'eqv.equipment-options') return response('ok', eqvMockEquipmentOptions(), { assessments: [] });
        const { equipmentId, continuationToken } = params as { equipmentId: string; continuationToken?: string };
        if (id === 'eqv.topview-context') return ok(eqvMockContext(equipmentId));
        const applied = context as { from: string; to: string };
        return ok(eqvMockEvents({ equipmentId, ...applied, continuationToken }));
      },
    });
    fake.render(TopViewScreen);

    expect(await screen.findByText('이 구간에는 관측 자료가 없습니다')).toBeTruthy();
    expect(screen.getByText(/마지막 자료 2026-01-01 10:25:00/)).toBeTruthy();
    expect(document.querySelector('[data-layer="replay"]')).toBeNull();
  });
});

it('the generator rejects a malformed hash like core hashHex', async () => {
  // @ts-expect-error plain .mjs script without types
  const { hashHex } = (await import('../scripts/gen-mock-data.mjs')) as { hashHex: (hash: string) => string };
  const hex = 'a'.repeat(64);
  expect(hashHex(`sha256:${hex}`)).toBe(hex);
  for (const bad of [`sha512:${hex}`, `sha256:${'a'.repeat(63)}`, `sha256:${'A'.repeat(64)}`]) expect(() => hashHex(bad)).toThrow(RangeError);
});
