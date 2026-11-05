import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { featureQueryClient } from '@ap/feature-bridge';
import { mountAt, warmPages } from '../test-support';
const P = '00000000-0000-4000-8000-000000000001';
const A = '00000000-0000-4000-8000-000000000002';
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
beforeAll(warmPages, 60_000);
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.includes('/space-links')) return json({ items: [{ space_id: 'operations', managed_system_id: A, declared: true }], platform_managed_system_id: P });
    if (path.includes('/me/permissions/check')) return json({ state: 'approved', decision: { allow: true } });
    if (path.includes('/permissions/grants')) return json({ items: [] });
    if (path.includes('/actors?')) return json({ actors: [] });
    return json({ items: [{ id: P, slug: 'platform', name: '플랫폼', external_key: 'platform', archived_at: null, voc_create_mode: 'open' }, { id: A, slug: 'production', name: '생산 분석', external_key: 'space:operations', archived_at: null, voc_create_mode: 'restricted' }], total: 2 });
  }));
});
afterEach(() => { cleanup(); featureQueryClient.clear(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
describe('production systems permission shell', () => {
  it('opens the actual shell drawer with Enter and restores row focus on Escape', async () => {
    mountAt('/operations/systems');
    const row = await screen.findByRole('row', { name: '생산 분석 VOC 등록 설정 행' }, { timeout: 20_000 });
    await screen.findByText('지정 0명');
    row.focus(); fireEvent.keyDown(row, { key: 'Enter' });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('radio', { name: '지정한 사람만' }).getAttribute('aria-checked')).toBe('true');
    expect(within(dialog).getByRole('button', { name: '저장' })).toBeTruthy();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(row);
    expect(screen.queryByRole('navigation', { name: '시안 전환' })).toBeNull();
    expect(window.location.search).not.toContain('variant');
  }, 30_000);
  it('returns focus to the current row after switching an open drawer', async () => {
    mountAt('/operations/systems');
    const first = await screen.findByRole('row', { name: '생산 분석 VOC 등록 설정 행' }, { timeout: 20_000 });
    const second = screen.getByRole('row', { name: '플랫폼 VOC 등록 설정 행' });
    first.focus(); fireEvent.keyDown(first, { key: 'Enter' });
    await screen.findByRole('dialog');
    second.focus(); fireEvent.keyDown(second, { key: 'Enter' });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '상세 닫기' }));
    await waitFor(() => expect(document.activeElement).toBe(second));
  }, 30_000);
  it('opens the locked platform settings by clicking its row', async () => {
    mountAt('/operations/systems');
    const row = await screen.findByRole('row', { name: '플랫폼 VOC 등록 설정 행' }, { timeout: 20_000 });
    fireEvent.click(within(row).getByText('플랫폼'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('radio', { name: '지정한 사람만' }).hasAttribute('disabled')).toBe(true);
    expect(within(dialog).getByText(/항상 모두로 유지/)).toBeTruthy();
  }, 30_000);
});
