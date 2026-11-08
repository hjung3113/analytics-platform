// @vitest-environment jsdom
// #1496 R-f: the 명세 커버리지 badge of the spec header — counts when computable, the reason when not, the deep link to the rules coverage tab.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { BookOpen } from 'lucide-react';
import { groupId, menuPermission, spaceId, type ApiResponse } from '@ap/contracts';
import { createRegistry } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../../index';
import { mountWith } from '../test-support';
import { SpecCoverageBadge } from './SpecCoverageBadge';

const modelId = '00000003-0000-4000-8000-000000000008', softwareId = '00000004-0000-4000-8000-00000000000e';
const ok = (data: unknown) => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'badge' }) as ApiResponse<never>;
const menus = [...manifests, { ...manifests[0]!, id: 'log-rules', path: '/log/rules', pageKeys: ['tab', 'modelId', 'softwareId'], repeatedPageKeys: [], hiddenPageKeys: [], contextResetKeys: [], primary: false }];
const registry = (withRules: boolean) => createRegistry({
  permissions: ['knowledge:spec-publish', 'knowledge:catalog-manage', 'knowledge:item-publish'].map(menuPermission),
  spaces: [{ id: spaceId('logDev'), label: { ko: '로그', en: 'Log' }, description: { ko: '로그', en: 'Log' }, homeMenuId: 'log-knowledge-models' }],
  groups: [{ id: groupId('logKnowledge'), label: { ko: '지식', en: 'Knowledge' }, icon: BookOpen, space: spaceId('logDev') }],
  menus: withRules ? menus : manifests,
});
let asked: unknown[] = [];
const mount = (data: unknown, software: string | null = null, withRules = true) => {
  asked = [];
  window.history.replaceState(null, '', '/logDev/log-knowledge-spec?v=1');
  const session = testSession(['platform:view']);
  const adapter = testAdapter({ session: () => session, menuQuery: async req => { asked.push(req.params); return ok(data); } });
  return mountWith({ registry: registry(withRules) as never, adapter, ui: <SpecCoverageBadge modelId={modelId} softwareId={software} enabled /> });
};
afterEach(cleanup);

describe('SpecCoverageBadge', () => {
  it('shows «규칙 없음 N · 요구사항 M», says it is not a pass result, and links to the coverage tab with both ids', async () => {
    mount({ computable: true, counts: { no_rule: 3, unsupported: 0, unknown: 0, partial: 0, covered: 5, total: 8 }, coverageDigest: 'd' }, softwareId);
    expect(await screen.findByText('규칙 없음 3 · 요구사항 8')).toBeTruthy();
    expect(screen.getByText('통과가 아니라 구성 정보입니다')).toBeTruthy();
    expect(asked[0]).toEqual({ modelId, softwareId });
    const href = screen.getByRole('link', { name: '검증 규칙에서 보기' }).getAttribute('href') ?? '';
    const query = new URLSearchParams(href.split('?')[1]);
    expect(href).toContain('/logDev/log-rules');
    expect([query.get('tab'), query.get('modelId'), query.get('softwareId')]).toEqual(['coverage', modelId, softwareId]);
  });

  it.each([
    ['no_catalog', '검증 규칙 카탈로그를 아직 받지 못했습니다'],
    ['no_spec', '발행된 명세가 없습니다'],
    ['unavailable', '검증 규칙 연동이 켜져 있지 않습니다'],
  ])('not computable (%s): the badge and the reason, never a number', async (reason, text) => {
    mount({ computable: false, reason });
    expect(await screen.findByText('명세 커버리지 계산 불가')).toBeTruthy();
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByText(/규칙 없음/)).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('renders nothing for an unknown model (data null) and shows no link when the registry has no rules menu', async () => {
    mount(null);
    await Promise.resolve();
    expect(screen.queryByLabelText('명세 커버리지')).toBeNull();
    cleanup();
    mount({ computable: false, reason: 'no_catalog' }, null, false);
    expect(await screen.findByText('명세 커버리지 계산 불가')).toBeTruthy();
    expect(screen.queryByRole('link', { name: '검증 규칙에서 보기' })).toBeNull();
  });
});
