import { describe, expect, it } from 'vitest';
import {
  buildPlatformInboundLink,
  ContractError,
  emptyGlobal,
  parsePlatformInboundLink,
  type GlobalContext,
} from '@ap/contracts';

const code = (fn: () => unknown) => { try { fn(); } catch (e) { return e instanceof ContractError ? e.code : 'other'; } return 'ok'; };

const P = 'https://platform.example';
const MS_ID = '11111111-1111-4111-8111-111111111111';
const VOC_ID = '22222222-2222-4222-8222-222222222222';
const NONE: GlobalContext = { ...emptyGlobal };
const PERIOD: GlobalContext = { ...NONE, scopeId: 'MEM', from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' };

describe('platform inbound deep link (06 §6/§22)', () => {
  it('builds the contract examples with canonical buildQuery serialization', () => {
    expect(buildPlatformInboundLink({ origin: P, hop: { menuId: 'equipment-detail', equipmentId: 'MEM-PHOTO-0103' }, context: PERIOD }))
      .toBe(`${P}/equipment/MEM-PHOTO-0103?v=1&scopeId=MEM&from=2026-09-25T09%3A00%3A00&to=2026-09-26T09%3A00%3A00`);
    expect(buildPlatformInboundLink({ origin: P, hop: { menuId: 'equipment-master' }, context: { ...NONE, scopeId: 'MEM', selection: ['MEM-PHOTO-0103'] } }))
      .toBe(`${P}/equipment?v=1&scopeId=MEM&selectedEquipmentIds=MEM-PHOTO-0103`);
    expect(buildPlatformInboundLink({ origin: P, hop: { menuId: 'cycle-time' }, context: { ...PERIOD, selection: ['MEM-PHOTO-0103'] } }))
      .toBe(`${P}/analytics/cycle-time?v=1&scopeId=MEM&from=2026-09-25T09%3A00%3A00&to=2026-09-26T09%3A00%3A00&selectedEquipmentIds=MEM-PHOTO-0103`);
  });
  it('round-trips a hop with sorted selection (buildQuery rule) and encoded path ids', () => {
    const url = buildPlatformInboundLink({
      origin: P,
      hop: { menuId: 'cycle-time' },
      context: { ...PERIOD, selection: ['MEM-PHOTO-0103', 'MEM-ETCH-01', 'MEM-ETCH-01'] },
    });
    const parsed = parsePlatformInboundLink(url, P);
    expect(parsed.hop).toEqual({ menuId: 'cycle-time' });
    expect(parsed.context).toEqual({ ...PERIOD, selection: ['MEM-ETCH-01', 'MEM-PHOTO-0103'] });
    const detail = parsePlatformInboundLink(
      buildPlatformInboundLink({ origin: P, hop: { menuId: 'equipment-detail', equipmentId: 'MEM/ETCH 01' }, context: NONE }),
      P,
    );
    expect(detail.hop).toEqual({ menuId: 'equipment-detail', equipmentId: 'MEM/ETCH 01' });
    expect(detail.context.selection).toBeNull();
  });
  it('keeps managedSystem/vocId/fo as extras and never lifts them into global scope', () => {
    const parsed = parsePlatformInboundLink(`${P}/equipment?v=1&managedSystem=${MS_ID}&vocId=${VOC_ID}&fo=1`, P);
    expect(parsed.hop).toEqual({ menuId: 'equipment-master' });
    expect(parsed.extras).toEqual([['managedSystem', MS_ID], ['vocId', VOC_ID], ['fo', '1']]);
    expect(parsed.context.scopeId).toBeNull();
  });
  it('accepts the equipmentIds alias on parse only and rejects using both keys', () => {
    expect(parsePlatformInboundLink(`${P}/equipment?v=1&equipmentIds=MEM-PHOTO-0103`, P).context.selection).toEqual(['MEM-PHOTO-0103']);
    expect(code(() => parsePlatformInboundLink(`${P}/equipment?equipmentIds=A&selectedEquipmentIds=B`, P))).toBe('alias_conflict');
  });
  it('rejects v=2 and one-sided periods without rewriting', () => {
    expect(code(() => parsePlatformInboundLink(`${P}/equipment?v=2&scopeId=MEM`, P))).toBe('unsupported_version');
    expect(code(() => parsePlatformInboundLink(`${P}/equipment?from=2026-09-25T09:00:00`, P))).toBe('partial_period');
    expect(code(() => parsePlatformInboundLink(`${P}/equipment?from=2026-09-25T09:00:00Z&to=2026-09-26T09:00:00`, P))).toBe('invalid_time');
  });
  it('rejects external returnTo values as external_return', () => {
    expect(code(() => parsePlatformInboundLink(`${P}/equipment/MEM-PHOTO-0103?returnTo=https://evil.com`, P))).toBe('external_return');
    expect(code(() => parsePlatformInboundLink(`${P}/equipment/MEM-PHOTO-0103?returnTo=%2F%2Fevil`, P))).toBe('external_return');
    expect(code(() => parsePlatformInboundLink(`${P}/equipment/MEM-PHOTO-0103?returnTo=${encodeURIComponent('/\\evil')}`, P))).toBe('external_return');
    expect(code(() => buildPlatformInboundLink({ origin: P, hop: { menuId: 'equipment-detail', equipmentId: 'MEM-PHOTO-0103' }, context: NONE, returnTo: 'https://evil.com' }))).toBe('external_return');
  });
  it('round-trips a relative returnTo on equipment-detail only', () => {
    const returnTo = '/analytics/cycle-time?v=1&scopeId=MEM';
    const url = buildPlatformInboundLink({ origin: P, hop: { menuId: 'equipment-detail', equipmentId: 'MEM-PHOTO-0103' }, context: NONE, returnTo });
    const parsed = parsePlatformInboundLink(url, P);
    expect(parsed.hop).toEqual({ menuId: 'equipment-detail', equipmentId: 'MEM-PHOTO-0103' });
    expect(parsed.returnTo).toBe(returnTo);
    expect(code(() => buildPlatformInboundLink({ origin: P, hop: { menuId: 'cycle-time' }, context: NONE, returnTo }))).toBe('unsupported_page_key');
    expect(code(() => parsePlatformInboundLink(`${P}/analytics/cycle-time?v=1&returnTo=${encodeURIComponent(returnTo)}`, P))).toBe('unsupported_page_key');
    expect(code(() => parsePlatformInboundLink(`${P}/equipment?v=1&returnTo=${encodeURIComponent(returnTo)}`, P))).toBe('unsupported_page_key');
  });
  it('rejects drifted origins and non-hop paths', () => {
    const url = buildPlatformInboundLink({ origin: P, hop: { menuId: 'equipment-master' }, context: NONE });
    expect(code(() => parsePlatformInboundLink(url, 'https://other.example'))).toBe('feedbackops_origin');
    expect(code(() => parsePlatformInboundLink(url, 'platform.example'))).toBe('feedbackops_origin');
    expect(code(() => parsePlatformInboundLink(`${P}/voc?v=1`, P))).toBe('unsupported_path');
    expect(code(() => parsePlatformInboundLink(`${P}/equipment/%zz`, P))).toBe('invalid_id');
  });
  it('validates the context before serialization with parser error codes (P1)', () => {
    const master = { origin: P, hop: { menuId: 'equipment-master' } as const };
    // serializeGlobal drops one-sided periods and orphan metricVersions, so these must fail before serialization.
    expect(code(() => buildPlatformInboundLink({ ...master, context: { ...NONE, from: '2026-09-25T09:00:00' } }))).toBe('partial_period');
    expect(code(() => buildPlatformInboundLink({ ...master, context: { ...NONE, to: '2026-09-26T09:00:00' } }))).toBe('partial_period');
    expect(code(() => buildPlatformInboundLink({ ...master, context: { ...NONE, metricVersion: '3' } }))).toBe('metric_pair');
    expect(code(() => buildPlatformInboundLink({ ...master, context: { ...NONE, from: '2026-09-26T09:00:00', to: '2026-09-25T09:00:00' } }))).toBe('invalid_period');
    expect(code(() => buildPlatformInboundLink({ ...master, context: { ...NONE, from: '2026-09-25T09:00:00Z', to: '2026-09-26T09:00:00' } }))).toBe('invalid_time');
    expect(code(() => buildPlatformInboundLink({ ...master, context: { ...NONE, selection: ['  '] } }))).toBe('invalid_id');
  });
  it('preserves every registered global key on round-trip (06 §6.4, P2-a)', () => {
    const context: GlobalContext = {
      ...emptyGlobal,
      scopeId: 'MEM',
      from: '2026-09-25T09:00:00',
      to: '2026-09-26T09:00:00',
      roomNames: ['PHOTO'],
      condition: { stgroup: ['ST-01'] },
      selection: ['MEM-PHOTO-0103'],
      lotIds: ['LOT-1'],
      ppid: 'PP-1',
      recipeIds: ['RCP-1'],
      metricId: 'ct',
      metricVersion: '3',
    };
    const url = buildPlatformInboundLink({ origin: P, hop: { menuId: 'cycle-time' }, context });
    const parsed = parsePlatformInboundLink(url, P);
    expect(parsed.context).toEqual(context);
    expect(buildPlatformInboundLink({ origin: P, hop: { menuId: 'cycle-time' }, context: parsed.context })).toBe(url);
  });
  it('rejects dot-segment equipmentIds in build and parse (P2-b)', () => {
    for (const id of ['.', '..']) {
      expect(code(() => buildPlatformInboundLink({ origin: P, hop: { menuId: 'equipment-detail', equipmentId: id }, context: NONE }))).toBe('invalid_id');
      expect(code(() => parsePlatformInboundLink(`${P}/equipment/${id}`, P))).toBe('invalid_id');
    }
    expect(code(() => parsePlatformInboundLink(`${P}/equipment/%2e%2e`, P))).toBe('invalid_id');
    expect(code(() => parsePlatformInboundLink(`${P}/equipment/%2E%2e`, P))).toBe('invalid_id');
    // A browser normalizes raw and percent-encoded dot segments, so they can never address a detail page.
    expect(new URL(`${P}/equipment/..`).pathname).toBe('/');
    expect(new URL(`${P}/equipment/%2E%2E`).pathname).toBe('/');
    expect(new URL(`${P}/equipment/.`).pathname).toBe('/equipment/');
  });
  it('requires exactly one raw path segment and applies the builder id rule on parse (P2-c)', () => {
    expect(code(() => parsePlatformInboundLink(`${P}/equipment/A/B`, P))).toBe('invalid_id');
    expect(code(() => parsePlatformInboundLink(`${P}/equipment/%20`, P))).toBe('invalid_id');
    expect(code(() => parsePlatformInboundLink(`${P}/equipment//`, P))).toBe('invalid_id');
    expect(parsePlatformInboundLink(`${P}/equipment/MEM%2FPHOTO-0103`, P).hop).toEqual({ menuId: 'equipment-detail', equipmentId: 'MEM/PHOTO-0103' });
  });
  it('canonicalizes origins with URL-standard parsing (P2-d)', () => {
    const build = (origin: string) => buildPlatformInboundLink({ origin, hop: { menuId: 'equipment-master' }, context: NONE });
    const parse = (expectedOrigin: string) => parsePlatformInboundLink(`${P}/equipment?v=1`, expectedOrigin);
    for (const origin of ['http://platform.example', `${P}/equipment`, 'HTTPS://platform.example', 'https://PLATFORM.example', 'https://user@platform.example', 'https://127.1', 'https://platform.example.']) {
      expect(code(() => build(origin)), `build ${origin}`).toBe('feedbackops_origin');
      expect(code(() => parse(origin)), `parse ${origin}`).toBe('feedbackops_origin');
    }
    // A single trailing slash and loopback http are tolerated; the emitted link still carries the canonical origin byte-exactly.
    expect(build(`${P}/`)).toBe(`${P}/equipment?v=1`);
    expect(build('http://localhost:5173')).toBe('http://localhost:5173/equipment?v=1');
    expect(build('http://127.0.0.1:4173')).toBe('http://127.0.0.1:4173/equipment?v=1');
    expect(parsePlatformInboundLink('http://localhost:5173/equipment?v=1', 'http://localhost:5173/').hop).toEqual({ menuId: 'equipment-master' });
    expect(new URL(buildPlatformInboundLink({ origin: P, hop: { menuId: 'cycle-time' }, context: PERIOD })).origin).toBe(P);
  });
  it.each([
    ['fragment', `${P}/equipment?v=1#top`],
    ['backslash', `${P}\\equipment?v=1`],
  ])('rejects a %s in the link as feedbackops_path', (_name, url) => {
    expect(code(() => parsePlatformInboundLink(url, P))).toBe('feedbackops_path');
  });
});

describe('platform inbound Condition builder parity (#552)', () => {
  const target = { origin: P, hop: { menuId: 'equipment-master' } as const };
  it('round-trips map, Line/PRC sets and membership basis', () => {
    const context = { ...emptyGlobal, condition: { maker: ['X'], model: ['Y'] }, lineNames: ['L'], prcGroups: ['P'], membershipBasis: 'asOf' as const };
    const url = buildPlatformInboundLink({ ...target, context });
    expect(parsePlatformInboundLink(url, P).context).toEqual(context);
  });
  it.each([
    [{ membershipBasis: 'asOf' as const }, 'membership_basis_pair'],
    [{ condition: { alpha: [] } }, 'invalid_condition'],
    [{ lineNames: [' '] }, 'invalid_id'],
    [{ prcGroups: [''] }, 'invalid_id'],
  ])('rejects invalid runtime input %j before serialization', (input, expected) => {
    expect(code(() => buildPlatformInboundLink({ ...target, context: { ...emptyGlobal, ...input } }))).toBe(expected);
  });
});

it('history restores only draft and leaves the applied address query untouched', async () => {
  const { createElement } = await import('react');
  const { act, cleanup, render, waitFor } = await import('@testing-library/react');
  const { I18nProvider, PlatformProvider } = await import('@ap/kernel');
  const { useHostPlatform } = await import('@ap/kernel/host');
  const { testAdapter, testSession } = await import('@ap/kernel/testing');
  const { registry } = await import('./menus');
  const session = testSession(['platform:view', 'analytics:view']);
  let platform!: ReturnType<typeof useHostPlatform>;
  function Probe() { platform = useHostPlatform(); return null; }
  const store = { list: async () => [{ id: 'old', query: '?v=1&scopeId=MEM&from=2026-09-01T00:00:00&to=2026-09-02T00:00:00&roomNames=PHOTO&granularity=day', schemaVersion: 1 as const, count: 1, lastAppliedAt: 1 }], record: async () => {}, remove: async () => {}, clear: async () => {} };
  window.history.replaceState(null, '', '/mars/cycle-time?scopeId=MEM');
  try {
    render(createElement(I18nProvider, null, createElement(PlatformProvider, { equipmentAxes: (await import('./equipmentAxes')).EQUIPMENT_AXES, registry, adapter: testAdapter({ session: () => session, validateScope: async () => ({ status: 'valid', grantedRooms: ['PHOTO'] }) }), queryHistory: store, children: createElement(Probe) })));
    await waitFor(() => expect(platform.queryDraft.draft.page).toEqual([['granularity', 'day']]));
    await act(async () => {});
    expect(platform.url).toBe('/mars/cycle-time?scopeId=MEM');
    expect(platform.url).not.toContain('granularity'); expect(platform.global.from).toBeNull();
  } finally { cleanup(); }
});
