import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cleanup, configure, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { eqvScreens } from '../src/index.js';
import { EQV_MOCK_EQUIPMENT, EQV_MOCK_WINDOW, eqvMockContext, eqvMockEquipmentOptions, eqvMockEvents } from '../src/mock-data/index.js';
import { createFakeHost, ok, type QueryCall } from './fake-host.js';
import { batch } from './replay-fixture.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
configure({ asyncUtilTimeout: 5000 });
afterEach(cleanup);

// What a host's mock server does: answer the two endpoints from the mock data for the applied window.
const mockServer = async ({ id, params }: QueryCall) => {
  const { equipmentId, continuationToken } = params as { equipmentId: string; continuationToken?: string };
  return ok(id === 'eqv.topview-context' ? eqvMockContext(equipmentId) : eqvMockEvents({ equipmentId, ...EQV_MOCK_WINDOW, continuationToken }));
};
const hostFor = (equipment: string) => createFakeHost({ page: { equipment }, context: EQV_MOCK_WINDOW, query: mockServer });
const SCREENS = [['topview', eqvScreens.topview], ['focus', eqvScreens.focus]] as const;
const NO_BINDING = '이 시점에 적용된 Binding이 없어 Top View를 표시할 수 없습니다';

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
});

describe('through the adapter', () => {
  it('Focus renders every fixture Occurrence from the mock, across both pages', async () => {
    const fake = hostFor(EQV_MOCK_EQUIPMENT);
    const Screen = eqvScreens.focus;
    render(<Screen host={fake.host} params={{}} />);
    await waitFor(() => expect(document.querySelector('tr[data-occurrence-id="occ-open"]')).not.toBeNull());
    for (const { id } of batch.occurrences) expect(document.querySelector(`tr[data-occurrence-id="${id}"]`), id).not.toBeNull();
    expect(screen.queryByText(/데이터 오류/)).toBeNull();
  });

  it.each(SCREENS)('%s: an unknown equipment is ready with the no-Binding state, not outcome empty', async (name, Screen) => {
    const fake = hostFor('eq-other');
    render(<Screen host={fake.host} params={{}} />);
    await screen.findByText(NO_BINDING);
    expect(screen.queryByText(/데이터 오류/)).toBeNull();
    expect(screen.queryByText('이 구간에 표시할 Occurrence가 없습니다')).toBeNull();
    if (name === 'focus') screen.getByText('이 구간에 겹치는 Occurrence가 없습니다');
  });
});

it('the generator rejects a malformed hash like core hashHex', async () => {
  // @ts-expect-error plain .mjs script without types
  const { hashHex } = (await import('../scripts/gen-mock-data.mjs')) as { hashHex: (hash: string) => string };
  const hex = 'a'.repeat(64);
  expect(hashHex(`sha256:${hex}`)).toBe(hex);
  for (const bad of [`sha512:${hex}`, `sha256:${'a'.repeat(63)}`, `sha256:${'A'.repeat(64)}`]) expect(() => hashHex(bad)).toThrow(RangeError);
});
