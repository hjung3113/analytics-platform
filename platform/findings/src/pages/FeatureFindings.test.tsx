import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { LAZY_MOUNT_WAIT } from '@ap/feature-bridge/testing';
import type { ReactNode } from 'react';
import { useHostSeam } from '@/lib/host/host-seam';
import { mountAt, warmPages } from '../test-support';

/** The three feature entries are doubles that record how the page drives them; the value check (the feature screens' real findings-search schema) is not mocked. */
const screenMock = vi.hoisted(() => ({
  list: [] as { renderDetail: (id: string | null, options: { listDenied: boolean; returnTo: string | null }) => unknown }[],
  detailArgs: [] as { findingId: string; onClose: () => void }[],
  mounts: 0,
  evidence: [] as { renderDetail: (parts: Parts) => ReactNode }[],
  requestClose: vi.fn(),
}));
vi.mock('@ap/feature-screens/operator-screens/evidence', () => ({
  EvidenceScreen: (props: { renderDetail: (parts: Parts) => ReactNode }) => {
    screenMock.evidence.push(props);
    const seam = useHostSeam();
    const selected = seam.useSearch!().selected;
    return <div data-testid="evidence" data-selected={selected ?? ''} data-here={seam.useHere!()}>
      {selected !== undefined && props.renderDetail({ title: `근거 ${selected}`, body: <p>근거 본문 {selected}</p>, requestClose: screenMock.requestClose })}
    </div>;
  },
}));
vi.mock('@ap/feature-screens/operator-screens/findings', () => ({
  FindingsScreen: (props: { renderDetail: (id: string | null, options: { listDenied: boolean; returnTo: string | null }) => unknown }) => {
    screenMock.list.push(props);
    const seam = useHostSeam();
    return <div data-testid="list" data-here={seam.useHere!()} />;
  },
}));
vi.mock('@ap/feature-screens/operator-screens/finding-detail', async () => {
  const { useState } = await import('react');
  return {
    useFindingDetailParts: (args: { findingId: string; onClose: () => void }) => {
      const [instance] = useState(() => ++screenMock.mounts);
      screenMock.detailArgs.push(args);
      return { title: `Finding ${args.findingId}`, body: <p data-instance={instance}>상세 본문 {args.findingId}</p>, view: { kind: 'loading' } };
    },
  };
});

const SYSTEM = '33333333-3333-4333-8333-333333333333';
const FINDING_A = '99999999-9999-4999-8999-99999999999a';
const FINDING_B = '99999999-9999-4999-8999-99999999999b';
const PATH = '/flow/findings';
const EVIDENCE_PATH = '/flow/evidence';
const EVIDENCE = '99999999-9999-4999-8999-999999999999';
type Parts = Record<string, unknown>;
const request = vi.fn();

beforeAll(warmPages, 60_000);
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('fetch', request);
  screenMock.list.length = 0; screenMock.detailArgs.length = 0; screenMock.mounts = 0; screenMock.evidence.length = 0; screenMock.requestClose.mockReset(); request.mockReset();
});
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('전체 Finding without a feature API (mock preview)', () => {
  it('shows 실서버 필요 and mounts no screen', async () => {
    mountAt(PATH);
    await screen.findByRole('heading', { name: '전체 Finding' }, LAZY_MOUNT_WAIT);
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect(screen.queryByTestId('list')).toBeNull();
  });
});

describe('전체 Finding through the feature bridge', () => {
  beforeEach(() => { setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });

  it('mounts the list reading the page as the screen findings path, and gives the screen no detail node (denied and empty states included)', async () => {
    mountAt(`${PATH}?q=pump&execution=none&managedSystem=${SYSTEM}`);
    const list = await screen.findByTestId('list');
    const here = new URL(list.getAttribute('data-here')!, 'http://x');
    expect(here.pathname).toBe('/findings');
    expect(Object.fromEntries(here.searchParams)).toEqual({ q: 'pump', execution: 'none', managedSystem: SYSTEM });
    const { renderDetail } = screenMock.list.at(-1)!;
    expect(renderDetail(null, { listDenied: false, returnTo: null })).toBeUndefined();
    expect(renderDetail(FINDING_A, { listDenied: false, returnTo: null })).toBeUndefined();
    expect(renderDetail(null, { listDenied: true, returnTo: null })).toBeUndefined();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screenMock.detailArgs).toEqual([]);
  });

  it('opens the Finding detail in the shell detail slot on focus, remounting per Finding', async () => {
    mountAt(`${PATH}?focus=${FINDING_A}`);
    const aside = await screen.findByRole('complementary', { name: '상세 패널' });
    const dialog = await within(aside).findByRole('dialog');
    expect(within(dialog).getByText(`상세 본문 ${FINDING_A}`).getAttribute('data-instance')).toBe('1');
    // One tab draws no tab row (06 §13, #886 UX-8).
    expect(within(dialog).queryByRole('tablist', { name: '상세 탭' })).toBeNull();
    window.history.replaceState(null, '', `${PATH}?focus=${FINDING_B}`);
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect((await screen.findByText(`상세 본문 ${FINDING_B}`)).getAttribute('data-instance')).toBe('2');
  });

  it('closing the drawer removes focus, keeps the rest and returns focus to the opener', async () => {
    render(<button type="button">열기</button>);
    const opener = screen.getByRole('button', { name: '열기' });
    opener.focus();
    mountAt(`${PATH}?q=pump`);
    await screen.findByTestId('list');
    window.history.replaceState(null, '', `${PATH}?q=pump&focus=${FINDING_A}`);
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    fireEvent.click(await screen.findByRole('button', { name: '상세 닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const params = new URLSearchParams(window.location.search);
    expect(params.has('focus')).toBe(false);
    expect(params.get('q')).toBe('pump');
    expect(document.activeElement).toBe(opener);
  });

  it('hands useFindingDetailParts an onClose that clears focus (the not-found button)', async () => {
    mountAt(`${PATH}?focus=${FINDING_A}&q=pump`);
    await screen.findByRole('dialog');
    expect(screenMock.detailArgs.at(-1)).toMatchObject({ findingId: FINDING_A });
    act(() => { screenMock.detailArgs.at(-1)!.onClose(); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const params = new URLSearchParams(window.location.search);
    expect(params.has('focus')).toBe(false);
    expect(params.get('q')).toBe('pump');
  });
});

const REJECTED = [['status', 'bogus'], ['execution', 'x'], ['assignment', 'x'], ['managedSystem', 'x'], ['focus', 'not-a-uuid']] as const;

describe('전체 Finding with an invalid address value', () => {
  beforeEach(() => { setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });

  it.each(REJECTED)('rejects an invalid %s=%s, keeps the address and requests nothing', async (key, value) => {
    const search = `?${key}=${encodeURIComponent(value)}`;
    mountAt(`${PATH}${search}`);
    expect(await screen.findByText(`주소의 ${key} 값이 올바르지 않습니다`, undefined, LAZY_MOUNT_WAIT)).toBeTruthy();
    expect(screen.queryByTestId('list')).toBeNull();
    expect(screenMock.list).toEqual([]);
    expect(screenMock.detailArgs).toEqual([]);
    expect(request).not.toHaveBeenCalled();
    expect(window.location.search).toBe(search);
  });
});

describe('근거 without a feature API (mock preview)', () => {
  it('shows 실서버 필요 and mounts no screen', async () => {
    mountAt(EVIDENCE_PATH);
    await screen.findByRole('heading', { name: '근거' }, LAZY_MOUNT_WAIT);
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect(screen.queryByTestId('evidence')).toBeNull();
  });
});

describe('근거 through the feature bridge', () => {
  beforeEach(() => { setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });

  it('mounts the screen reading the page as the screen /integration/evidence path', async () => {
    mountAt(`${EVIDENCE_PATH}?source=voc&q=pump&managedSystem=${SYSTEM}`);
    await screen.findByTestId('evidence');
    const here = new URL(screen.getByTestId('evidence').getAttribute('data-here')!, 'http://x');
    expect(here.pathname).toBe('/integration/evidence');
    expect(Object.fromEntries(here.searchParams)).toEqual({ source: 'voc', q: 'pump', managedSystem: SYSTEM });
  });

  it('renders the screen\'s renderDetail(parts) result as the drawer in place, and its close is requestClose', async () => {
    mountAt(`${EVIDENCE_PATH}?focus=${EVIDENCE}`);
    expect((await screen.findByTestId('evidence')).getAttribute('data-selected')).toBe(EVIDENCE);
    const dialog = await within(await screen.findByRole('complementary', { name: '상세 패널' })).findByRole('dialog');
    expect(within(dialog).getByText(`근거 본문 ${EVIDENCE}`)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '상세 닫기' }));
    expect(screenMock.requestClose).toHaveBeenCalledOnce();
    expect(new URLSearchParams(window.location.search).get('focus')).toBe(EVIDENCE);
  });

  it.each([['source', 'x'], ['managedSystem', 'x']])('rejects an invalid %s=%s, keeps the address and mounts no screen', async (key, value) => {
    const search = `?${key}=${encodeURIComponent(value)}`;
    mountAt(`${EVIDENCE_PATH}${search}`);
    expect(await screen.findByText(`주소의 ${key} 값이 올바르지 않습니다`, undefined, LAZY_MOUNT_WAIT)).toBeTruthy();
    expect(screen.queryByTestId('evidence')).toBeNull();
    expect(screenMock.evidence).toEqual([]);
    expect(window.location.search).toBe(search);
  });
});
