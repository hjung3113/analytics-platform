import { useState } from 'react';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFoApi } from '@ap/fo-bridge/fo-api';
import { inboxRoute, triageRoute } from '@ap/fo-bridge';
import { useHostSeam } from '@/lib/host/host-seam';
import { manifests } from '../index';
import { mountAt, warmPages } from '../test-support';

const fo = vi.hoisted(() => ({
  render: undefined as undefined | ((id: string, options: { managedSystemId: string | undefined; onClose: () => void }) => unknown),
  inboxProps: [] as unknown[],
  detailArgs: [] as { vocId: string; managedSystemId?: string }[],
  requestClose: vi.fn(),
  mounts: 0,
}));
vi.mock('@fops/frontend/operator-screens/voc-inbox', () => ({
  InboxScreen: (props: { view: string; renderDetail: typeof fo.render }) => {
    fo.inboxProps.push(props);
    fo.render = props.renderDetail;
    const seam = useHostSeam();
    const here = seam.useHere!();
    const go = seam.useNavigate!();
    return <div data-testid="inbox" data-here={here} data-can-triage={String(seam.canLink('/vocs?view=triage'))} data-can-tasks={String(seam.canLink('/tasks?view=board'))} data-href={seam.absoluteHref!('/vocs?view=inbox&selected=abc')}>
      <button type="button" onClick={() => go(`/vocs?view=inbox&selected=${VOC_Z}`)}>선택</button>
    </div>;
  },
}));
vi.mock('@fops/frontend/operator-screens/voc-detail', () => ({
  useVocDetailParts: (args: { vocId: string; managedSystemId?: string; onClose: () => void }) => {
    // Per-instance state: a new instance (remount) takes the next number.
    const [instance] = useState(() => ++fo.mounts);
    fo.detailArgs.push({ vocId: args.vocId, ...(args.managedSystemId !== undefined ? { managedSystemId: args.managedSystemId } : {}) });
    return { title: `VOC ${args.vocId}`, body: <p data-instance={instance}>상세 본문 {args.vocId}</p>, requestClose: () => { fo.requestClose(); args.onClose(); }, view: { kind: 'loading' } };
  },
}));

const SYSTEM = '33333333-3333-4333-8333-333333333333';
const VOC_A = 'a1821f1b-0000-4000-8000-00000000000a';
const VOC_Z = 'a1821f1b-0000-4000-8000-00000000000f';

beforeAll(warmPages, 60_000);
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); fo.inboxProps.length = 0; fo.detailArgs.length = 0; fo.requestClose.mockReset(); fo.mounts = 0; });
afterEach(() => { cleanup(); setFoApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('수신함 manifest', () => {
  it('declares the route table page keys, managedSystem included, and the permission of the space', () => {
    const inbox = manifests.find(menu => menu.id === 'fo-inbox')!;
    expect([...inbox.pageKeys!].sort()).toEqual([...inboxRoute.pageKeys].sort());
    expect(inbox).toMatchObject({ path: '/feedbackops/vocs', permission: 'feedbackops:access', requiresScope: false, label: { ko: '수신함', en: 'Inbox' } });
    const triage = manifests.find(menu => menu.id === 'fo-triage')!;
    expect([...triage.pageKeys!].sort()).toEqual([...triageRoute.pageKeys].sort());
  });
});

describe('수신함 without a FeedbackOps API (mock preview)', () => {
  it('shows 실서버 필요 and mounts no screen', async () => {
    mountAt('/feedbackops/vocs');
    // The first mount lazy-loads the page module, which can pass the default 1 s under a loaded run.
    expect(await screen.findByRole('heading', { name: '수신함' }, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect(screen.queryByTestId('inbox')).toBeNull();
  });
});

describe('수신함 through the FeedbackOps bridge', () => {
  beforeEach(() => { setFoApi({ basePath: '/api/fo', onSessionLost: vi.fn() }); });

  it('renders the inbox view with the page read as the FO path, and links 수신함/Triage but not other routes', async () => {
    mountAt(`/feedbackops/vocs?q=pump&tab=unassigned&managedSystem=${SYSTEM}`);
    const inbox = await screen.findByTestId('inbox');
    expect(fo.inboxProps.at(-1)).toMatchObject({ view: 'inbox' });
    const here = new URL(inbox.getAttribute('data-here')!, 'http://x');
    expect(here.pathname).toBe('/vocs');
    expect(Object.fromEntries(here.searchParams)).toEqual({ view: 'inbox', q: 'pump', tab: 'unassigned', managedSystem: SYSTEM });
    expect(inbox.getAttribute('data-can-triage')).toBe('true');
    expect(inbox.getAttribute('data-can-tasks')).toBe('false');
  });

  it('gives the copy-link address of a VOC in 수신함 (focus), carrying the managed system', async () => {
    mountAt(`/feedbackops/vocs?managedSystem=${SYSTEM}`);
    const href = new URL((await screen.findByTestId('inbox')).getAttribute('data-href')!);
    expect(href.origin).toBe(window.location.origin);
    expect(href.pathname).toBe('/feedbackops/vocs');
    expect(href.searchParams.get('focus')).toBe('abc');
    expect(href.searchParams.get('managedSystem')).toBe(SYSTEM);
  });

  it('moves a screen navigation through the platform URL (selected becomes focus)', async () => {
    mountAt('/feedbackops/vocs?q=pump');
    fireEvent.click(await screen.findByRole('button', { name: '선택' }));
    await waitFor(() => expect(window.location.search).toContain(`focus=${VOC_Z}`));
    expect(new URLSearchParams(window.location.search).has('q')).toBe(false);
  });

  it('returns no detail node to FO (its ListShell would draw it outside the FeedbackOps providers)', async () => {
    mountAt('/feedbackops/vocs');
    await screen.findByTestId('inbox');
    expect(fo.render!(VOC_A, { managedSystemId: undefined, onClose: vi.fn() })).toBeUndefined();
  });

  it('draws no drawer without focus', async () => {
    mountAt('/feedbackops/vocs');
    await screen.findByTestId('inbox');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fo.detailArgs).toEqual([]);
  });

  it('opens the VOC detail in the shell detail slot on focus, scoped to the managed system', async () => {
    mountAt(`/feedbackops/vocs?focus=${VOC_A}&managedSystem=${SYSTEM}`);
    const aside = await screen.findByRole('complementary', { name: '상세 패널' });
    const dialog = await within(aside).findByRole('dialog');
    expect(within(dialog).getByText(`상세 본문 ${VOC_A}`)).toBeTruthy();
    expect(within(dialog).getByRole('tab', { name: '상세' })).toBeTruthy();
    expect(fo.detailArgs.at(-1)).toEqual({ vocId: VOC_A, managedSystemId: SYSTEM });
  });

  it('closing the drawer removes focus and keeps the rest of the page', async () => {
    mountAt(`/feedbackops/vocs?focus=${VOC_A}&q=pump`);
    fireEvent.click(await screen.findByRole('button', { name: '상세 닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fo.requestClose).toHaveBeenCalledOnce();
    const params = new URLSearchParams(window.location.search);
    expect(params.has('focus')).toBe(false);
    expect(params.get('q')).toBe('pump');
  });

  it('remounts the detail for another VOC', async () => {
    mountAt(`/feedbackops/vocs?focus=${VOC_A}`);
    expect((await screen.findByText(`상세 본문 ${VOC_A}`)).getAttribute('data-instance')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: '선택' }));
    // Without `key={focus}` the same instance would show the next VOC (instance 1); a remount is a new instance.
    expect((await screen.findByText(`상세 본문 ${VOC_Z}`)).getAttribute('data-instance')).toBe('2');
    expect(screen.queryByText(`상세 본문 ${VOC_A}`)).toBeNull();
  });
});
