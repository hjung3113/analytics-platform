import { describe, expect, it } from 'vitest';
import {
  buildFeedbackOpsLink,
  buildPlatformInboundLink,
  ContractError,
  parseFeedbackOpsLink,
  parsePlatformInboundLink,
} from '@ap/contracts';

const code = (fn: () => unknown) => { try { fn(); } catch (e) { return e instanceof ContractError ? e.code : 'other'; } return 'ok'; };

const F = 'https://feedbackops.example';
const P = 'https://platform.example';
const MS_ID = '11111111-1111-4111-8111-111111111111';
const VOC_ID = '22222222-2222-4222-8222-222222222222';
const SURVEY_ID = '33333333-3333-4333-8333-333333333333';
const NONE = { scopeId: null, from: null, to: null, selection: null };
const PERIOD = { scopeId: 'ICH', from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00', selection: null as string[] | null };

describe('FeedbackOps deep link A — platform → FeedbackOps (contract: 1)', () => {
  it('emits the phase-1 allowlist URLs byte-exactly', () => {
    expect(buildFeedbackOpsLink({ origin: F, target: { kind: 'voc-create' } })).toBe(`${F}/vocs?action=create`);
    expect(buildFeedbackOpsLink({ origin: F, target: { kind: 'voc-create', managedSystemId: MS_ID } })).toBe(`${F}/vocs?action=create&managedSystem=${MS_ID}`);
    expect(buildFeedbackOpsLink({ origin: F, target: { kind: 'voc-detail', vocId: VOC_ID } })).toBe(`${F}/vocs?view=inbox&selected=${VOC_ID}`);
    expect(buildFeedbackOpsLink({ origin: F, target: { kind: 'voc-detail', vocId: VOC_ID, managedSystemId: MS_ID } })).toBe(`${F}/vocs?view=inbox&selected=${VOC_ID}&managedSystem=${MS_ID}`);
    expect(buildFeedbackOpsLink({ origin: F, target: { kind: 'survey-detail', surveyId: SURVEY_ID } })).toBe(`${F}/surveys/${SURVEY_ID}`);
  });
  it('never emits scopeId/from/to/selectedEquipmentIds/equipmentIds/returnTo/v/fo into FeedbackOps URLs', () => {
    const forbidden = ['scopeId', 'from', 'to', 'selectedEquipmentIds', 'equipmentIds', 'returnTo', 'v', 'fo'];
    const targets = [
      { kind: 'voc-create' as const },
      { kind: 'voc-create' as const, managedSystemId: MS_ID },
      { kind: 'voc-detail' as const, vocId: VOC_ID },
      { kind: 'voc-detail' as const, vocId: VOC_ID, managedSystemId: MS_ID },
      { kind: 'survey-detail' as const, surveyId: SURVEY_ID },
    ];
    for (const target of targets) {
      const params = new URL(buildFeedbackOpsLink({ origin: F, target })).searchParams;
      for (const key of [...params.keys()]) expect(forbidden).not.toContain(key);
      expect([...params.keys()].every(k => ['action', 'managedSystem', 'view', 'selected'].includes(k))).toBe(true);
    }
  });
  it('rejects non-uuid ids without guessing', () => {
    expect(code(() => buildFeedbackOpsLink({ origin: F, target: { kind: 'voc-detail', vocId: 'ICH-PHOTO-0103' } }))).toBe('feedbackops_id');
    expect(code(() => buildFeedbackOpsLink({ origin: F, target: { kind: 'voc-create', managedSystemId: 'ICH' } }))).toBe('feedbackops_id');
    expect(code(() => buildFeedbackOpsLink({ origin: F, target: { kind: 'survey-detail', surveyId: 'nope' } }))).toBe('feedbackops_id');
  });
  it('rejects non-canonical and non-https origins, and loopback http only', () => {
    expect(code(() => buildFeedbackOpsLink({ origin: 'http://feedbackops.example', target: { kind: 'voc-create' } }))).toBe('feedbackops_origin');
    expect(code(() => buildFeedbackOpsLink({ origin: 'https://feedbackops.example/vocs', target: { kind: 'voc-create' } }))).toBe('feedbackops_origin');
    expect(code(() => buildFeedbackOpsLink({ origin: 'HTTPS://feedbackops.example', target: { kind: 'voc-create' } }))).toBe('feedbackops_origin');
    expect(code(() => buildFeedbackOpsLink({ origin: 'https://user@feedbackops.example', target: { kind: 'voc-create' } }))).toBe('feedbackops_origin');
    expect(buildFeedbackOpsLink({ origin: 'http://localhost:5173', target: { kind: 'voc-create' } })).toBe('http://localhost:5173/vocs?action=create');
    expect(buildFeedbackOpsLink({ origin: 'http://127.0.0.1:4173', target: { kind: 'voc-create' } })).toBe('http://127.0.0.1:4173/vocs?action=create');
  });
  it('round-trips every target and rejects origin drift on parse', () => {
    const targets = [
      { kind: 'voc-create' as const },
      { kind: 'voc-create' as const, managedSystemId: MS_ID },
      { kind: 'voc-detail' as const, vocId: VOC_ID },
      { kind: 'voc-detail' as const, vocId: VOC_ID, managedSystemId: MS_ID },
      { kind: 'survey-detail' as const, surveyId: SURVEY_ID },
    ];
    for (const target of targets) {
      const url = buildFeedbackOpsLink({ origin: F, target });
      expect(parseFeedbackOpsLink(url, F).target).toEqual(target);
      expect(code(() => parseFeedbackOpsLink(url, 'https://other.example'))).toBe('feedbackops_origin');
    }
  });
  it('parses strictly: unknown keys, bad shapes and non-uuid values are rejected', () => {
    expect(code(() => parseFeedbackOpsLink(`${F}/vocs?action=create&fo=1`, F))).toBe('feedbackops_path');
    expect(code(() => parseFeedbackOpsLink(`${F}/vocs?view=inbox&selected=${VOC_ID}&selected=${VOC_ID}`, F))).toBe('feedbackops_path');
    expect(code(() => parseFeedbackOpsLink(`${F}/vocs?view=today&selected=${VOC_ID}`, F))).toBe('feedbackops_path');
    expect(code(() => parseFeedbackOpsLink(`${F}/vocs?view=inbox&selected=ICH`, F))).toBe('feedbackops_id');
    expect(code(() => parseFeedbackOpsLink(`${F}/vocs?action=create&managedSystem=ICH`, F))).toBe('feedbackops_id');
    expect(code(() => parseFeedbackOpsLink(`${F}/surveys/${SURVEY_ID}?builder=x`, F))).toBe('feedbackops_path');
    expect(code(() => parseFeedbackOpsLink(`${F}/surveys/1234`, F))).toBe('feedbackops_id');
    expect(code(() => parseFeedbackOpsLink(`${F}/somewhere`, F))).toBe('feedbackops_path');
  });
});

describe('FeedbackOps deep link B — FeedbackOps → platform (06 §6/§22)', () => {
  it('builds the contract examples with canonical buildQuery serialization', () => {
    expect(buildPlatformInboundLink({ origin: P, hop: { menuId: 'equipment-detail', equipmentId: 'ICH-PHOTO-0103' }, context: PERIOD }))
      .toBe(`${P}/equipment/ICH-PHOTO-0103?v=1&scopeId=ICH&from=2026-09-25T09%3A00%3A00&to=2026-09-26T09%3A00%3A00`);
    expect(buildPlatformInboundLink({ origin: P, hop: { menuId: 'equipment-master' }, context: { ...NONE, scopeId: 'ICH', selection: ['ICH-PHOTO-0103'] } }))
      .toBe(`${P}/equipment?v=1&scopeId=ICH&selectedEquipmentIds=ICH-PHOTO-0103`);
    expect(buildPlatformInboundLink({ origin: P, hop: { menuId: 'cycle-time' }, context: { ...PERIOD, selection: ['ICH-PHOTO-0103'] } }))
      .toBe(`${P}/analytics/cycle-time?v=1&scopeId=ICH&from=2026-09-25T09%3A00%3A00&to=2026-09-26T09%3A00%3A00&selectedEquipmentIds=ICH-PHOTO-0103`);
  });
  it('round-trips a hop with sorted selection (buildQuery rule) and encoded path ids', () => {
    const url = buildPlatformInboundLink({
      origin: P,
      hop: { menuId: 'cycle-time' },
      context: { scopeId: 'ICH', from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00', selection: ['ICH-PHOTO-0103', 'ICH-ETCH-01', 'ICH-ETCH-01'] },
    });
    const parsed = parsePlatformInboundLink(url, P);
    expect(parsed.hop).toEqual({ menuId: 'cycle-time' });
    expect(parsed.context).toEqual({ scopeId: 'ICH', from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00', selection: ['ICH-ETCH-01', 'ICH-PHOTO-0103'] });
    const detail = parsePlatformInboundLink(
      buildPlatformInboundLink({ origin: P, hop: { menuId: 'equipment-detail', equipmentId: 'ICH/ETCH 01' }, context: NONE }),
      P,
    );
    expect(detail.hop).toEqual({ menuId: 'equipment-detail', equipmentId: 'ICH/ETCH 01' });
    expect(detail.context.selection).toBeNull();
  });
  it('keeps managedSystem/vocId/fo as extras and never lifts them into global scope', () => {
    const parsed = parsePlatformInboundLink(`${P}/equipment?v=1&managedSystem=${MS_ID}&vocId=${VOC_ID}&fo=1`, P);
    expect(parsed.hop).toEqual({ menuId: 'equipment-master' });
    expect(parsed.extras).toEqual([['managedSystem', MS_ID], ['vocId', VOC_ID], ['fo', '1']]);
    expect(parsed.context.scopeId).toBeNull();
  });
  it('accepts the equipmentIds alias on parse only and rejects using both keys', () => {
    expect(parsePlatformInboundLink(`${P}/equipment?v=1&equipmentIds=ICH-PHOTO-0103`, P).context.selection).toEqual(['ICH-PHOTO-0103']);
    expect(code(() => parsePlatformInboundLink(`${P}/equipment?equipmentIds=A&selectedEquipmentIds=B`, P))).toBe('alias_conflict');
  });
  it('rejects v=2 and one-sided periods without rewriting', () => {
    expect(code(() => parsePlatformInboundLink(`${P}/equipment?v=2&scopeId=ICH`, P))).toBe('unsupported_version');
    expect(code(() => parsePlatformInboundLink(`${P}/equipment?from=2026-09-25T09:00:00`, P))).toBe('partial_period');
    expect(code(() => parsePlatformInboundLink(`${P}/equipment?from=2026-09-25T09:00:00Z&to=2026-09-26T09:00:00`, P))).toBe('invalid_time');
  });
  it('rejects external returnTo values as external_return', () => {
    expect(code(() => parsePlatformInboundLink(`${P}/equipment/ICH-PHOTO-0103?returnTo=https://evil.com`, P))).toBe('external_return');
    expect(code(() => parsePlatformInboundLink(`${P}/equipment/ICH-PHOTO-0103?returnTo=%2F%2Fevil`, P))).toBe('external_return');
    expect(code(() => parsePlatformInboundLink(`${P}/equipment/ICH-PHOTO-0103?returnTo=${encodeURIComponent('/\\evil')}`, P))).toBe('external_return');
    expect(code(() => buildPlatformInboundLink({ origin: P, hop: { menuId: 'equipment-detail', equipmentId: 'ICH-PHOTO-0103' }, context: NONE, returnTo: 'https://evil.com' }))).toBe('external_return');
  });
  it('round-trips a relative returnTo on equipment-detail only', () => {
    const returnTo = '/analytics/cycle-time?v=1&scopeId=ICH';
    const url = buildPlatformInboundLink({ origin: P, hop: { menuId: 'equipment-detail', equipmentId: 'ICH-PHOTO-0103' }, context: NONE, returnTo });
    const parsed = parsePlatformInboundLink(url, P);
    expect(parsed.hop).toEqual({ menuId: 'equipment-detail', equipmentId: 'ICH-PHOTO-0103' });
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
});
