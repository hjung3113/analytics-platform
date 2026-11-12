// #1844 node 1844f1b — the bridge's blocked-place request slot (ADR-0154 decision 6). Synthetic site names only (ADR-0151).
import { useState } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PermissionRequestTarget } from '@ap/contracts';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { accessRequestSlot } from '@ap/feature-bridge/access-request-slot';
import { json, registry, stubFetch, switchableAdapter } from './feature/test-support';

const MINE = '/api/features/permission-requests/mine';
const CREATE = '/api/features/permission-requests';
const REQUEST_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const AT = '2026-11-13T00:00:00.000Z';
const SITE: PermissionRequestTarget = { kind: 'site', site: 'site-alpha' };

const mineRow = (site: string) => ({
  id: REQUEST_ID, requested_scope_kind: 'site', requested_scope_site: site, requested_scope_room: null, requested_capability: 'scope.read',
  requested_managed_system_id: null, reason: '조회', requested_object_type: null, requested_object_id: null, source_object_type: null,
  source_object_id: null, source_action_id: null, revision: 1, requested_expiration: null, updated_at: AT, return_route_intent: '/blocked', status: 'pending', created_at: AT,
});

/** A place stand-in: the state label and the request button sit inside `Pending`'s children, the dialog beside it (as the SDK places draw them). */
function Place({ target }: { target: PermissionRequestTarget }) {
  const [open, setOpen] = useState(false);
  const { Pending, Dialog } = accessRequestSlot;
  return <>
    <Pending target={target}>{state => <p data-testid="state">
      {`pending=${String(state.pending)} href=${String(state.statusHref)}`}
      <button type="button" onClick={() => setOpen(true)}>열기</button>
    </p>}</Pending>
    <Dialog target={target} returnTo="/blocked" open={open} onOpenChange={setOpen} />
  </>;
}

function mount(target: PermissionRequestTarget) {
  return render(<I18nProvider><PlatformProvider adapter={switchableAdapter().adapter} registry={registry}><Place target={target} /></PlatformProvider></I18nProvider>);
}

// jsdom has no `scrollIntoView`; the dialog's Radix Select calls it when its list opens (feature-screens' test setup stubs it the same way).
const scrollIntoView = Element.prototype.scrollIntoView;
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); Element.prototype.scrollIntoView = () => undefined; });
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); Element.prototype.scrollIntoView = scrollIntoView; });

describe('accessRequest slot', () => {
  it('without a feature API reports unknown and requests nothing', async () => {
    setFeatureApi(null);
    const calls = stubFetch(() => json({ requests: [] }));
    mount(SITE);
    expect(screen.getByTestId('state').textContent).toContain('pending=null');
    expect(calls).toEqual([]);
  });

  describe('with a feature API', () => {
    beforeEach(() => { setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });

    it('a submit through the dialog flips Pending without remounting the place (mine-list invalidation)', async () => {
      let rows: unknown[] = [];
      const calls = stubFetch((path, method) => {
        if (path === MINE) return json({ requests: rows });
        if (path === CREATE && method === 'POST') {
          rows = [mineRow('site-alpha')];
          return json({ id: REQUEST_ID, status: 'pending', created_at: AT, requested_scope_kind: 'site', requested_scope_site: 'site-alpha', requested_scope_room: null }, 201);
        }
        return json({ sites: [] });
      });
      mount(SITE);
      // The status link is the 권한 요청 menu's address as the Kernel builds it (`linkTo`), not a hard-coded path.
      await waitFor(() => expect(screen.getByTestId('state').textContent).toMatch(/^pending=false href=\/permission-requests(\?|열기)/));
      const place = screen.getByTestId('state');

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: '열기' }));
      const dialog = await screen.findByTestId('permission-request-dialog');
      expect(within(dialog).getByText('Site site-alpha')).toBeTruthy();
      within(dialog).getByRole('combobox', { name: '범위 종류' }).focus();
      await user.keyboard('{Enter}');
      await user.click(await screen.findByRole('option', { name: 'Site 전체 (이후 추가되는 공정 포함)' }));
      await user.type(within(dialog).getByTestId('permission-request-reason'), '조회');
      await user.click(within(dialog).getByRole('button', { name: '요청 제출' }));

      await waitFor(() => expect(screen.getByTestId('state').textContent).toContain('pending=true'));
      expect(screen.getByTestId('state')).toBe(place);
      const post = calls.find(call => call.method === 'POST');
      expect(post?.path).toBe(CREATE);
      expect(calls.filter(call => call.path === MINE).length).toBe(2);
    });

    it('a permission place reports unknown without a status link, reads nothing and draws no dialog', async () => {
      const calls = stubFetch(() => json({ requests: [mineRow('site-alpha')] }));
      mount({ kind: 'permission', permission: 'synthetic:view' as never });
      await userEvent.setup().click(screen.getByRole('button', { name: '열기' }));
      expect(screen.getByTestId('state').textContent).toBe('pending=null href=null열기');
      expect(screen.queryByTestId('permission-request-dialog')).toBeNull();
      expect(calls).toEqual([]);
    });
  });
});
