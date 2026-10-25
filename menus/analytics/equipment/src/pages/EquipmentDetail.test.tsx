// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Boxes } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import EquipmentDetail from './EquipmentDetail';
import { groupId, menuPermission, spaceId, type ApiResponse, type AuditEvent, type EntityAuditPage, type EntityAuditRequest } from '@ap/contracts';

// ADR-0085: the audit tab reads cursor pages of the destination's changes. There was no screen test for this tab.
const registry = createRegistry({
  permissions: [menuPermission('equipment:view')],
  spaces: [{ id: spaceId('analytics'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('equipment:view'), homeMenuId: 'equipment-master' }],
  groups: [{ id: groupId('equipment'), label: { ko: '설비', en: 'Equipment' }, icon: Boxes, space: spaceId('analytics') }],
  menus: manifests,
});
const session = testSession(['equipment:view', 'platform:view'], { user: { id: 'analyst-a', name: 'analyst-a', title: { ko: '분석가', en: 'Analyst' } }, scopes: [{ id: 'MEM', label: 'MEM', grantedRooms: 1, totalRooms: 1 }] });
const ev = (id: string, minute: number, actor: string): AuditEvent => ({
  id, at: `2026-09-01T00:${String(minute).padStart(2, '0')}:00.000Z`, actor, action: 'update', source: 'user', target: { type: 'equipment', id: 'EQ-1', scopeId: 'MEM' },
});
const page = (data: EntityAuditPage): ApiResponse<EntityAuditPage> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'corr-audit' });
const none = (outcome: 'empty' | 'forbidden'): ApiResponse<EntityAuditPage> => ({ outcome, data: null, assessments: [], trust: null, correlationId: 'corr-none', message: outcome === 'forbidden' ? 'No permission equipment:view' : undefined });

function renderAudit(entityAudit: (req: EntityAuditRequest) => Promise<ApiResponse<EntityAuditPage>>) {
  window.history.replaceState(null, '', '/equipment/EQ-1?v=1&scopeId=MEM&tab=audit');
  render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session, entityAudit })} registry={registry}><EquipmentDetail params={{ equipmentId: 'EQ-1' }} /></PlatformProvider></I18nProvider>);
}

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('EquipmentDetail change history tab', () => {
  it('lists the first page for the ref and offers no button when it is the whole list', async () => {
    const refs: EntityAuditRequest[] = [];
    renderAudit(async req => { refs.push(req); return page({ events: [ev('a1', 1, 'actor-one')], nextCursor: null }); });
    expect(await screen.findByText('actor-one')).toBeTruthy();
    expect(refs).toEqual([{ type: 'equipment', id: 'EQ-1', scopeId: 'MEM' }]);
    expect(screen.queryByRole('button', { name: '이전 변경 이력 더 보기' })).toBeNull();
  });

  it('appends the older page when the button is pressed and ends with the caption', async () => {
    const cursors: (string | undefined)[] = [];
    renderAudit(async req => {
      cursors.push(req.cursor);
      return req.cursor === undefined
        ? page({ events: [ev('a2', 2, 'actor-new')], nextCursor: 'c1' })
        : page({ events: [ev('a1', 1, 'actor-old')], nextCursor: null });
    });
    expect(await screen.findByText('actor-new')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '이전 변경 이력 더 보기' }));
    expect(await screen.findByText('actor-old')).toBeTruthy();
    expect(cursors).toEqual([undefined, 'c1']);
    expect(screen.queryByRole('button', { name: '이전 변경 이력 더 보기' })).toBeNull();
    expect(screen.getByText('더 이전 변경 이력이 없습니다.', { selector: 'p.t-caption' })).toBeTruthy();
  });

  it('shows the query view empty state in the tab for a destination with no changes', async () => {
    renderAudit(async () => none('empty'));
    const panel = () => screen.getByRole('tabpanel');
    await waitFor(() => expect(within(panel()).getByText(/데이터가 없습니다|없습니다/)).toBeTruthy());
    expect(within(panel()).queryByRole('button', { name: '이전 변경 이력 더 보기' })).toBeNull();
  });

  it('shows the forbidden state of the first page through the query view, without an older-changes control', async () => {
    renderAudit(async () => none('forbidden'));
    const panel = () => screen.getByRole('tabpanel');
    await waitFor(() => expect(within(panel()).getByText('이 Scope에 접근 권한이 없습니다')).toBeTruthy());
    expect(within(panel()).queryByRole('button', { name: '이전 변경 이력 더 보기' })).toBeNull();
  });
});
