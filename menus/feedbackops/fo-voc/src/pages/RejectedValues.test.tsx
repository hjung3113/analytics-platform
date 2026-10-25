import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFoApi } from '@ap/fo-bridge/fo-api';
import { mountAt, warmPages } from '../test-support';

/** Screens and the drawer are doubles that would request FeedbackOps data when mounted; the page value check (FeedbackOps' real search schema) is not mocked. */
const mounted = vi.hoisted(() => ({ screens: 0, details: 0 }));
vi.mock('@fops/frontend/operator-screens/voc-inbox', () => ({ InboxScreen: () => { mounted.screens += 1; return <div data-testid="inbox" />; } }));
vi.mock('@fops/frontend/operator-screens/voc-triage', () => ({ TriageScreen: () => { mounted.screens += 1; return <div data-testid="triage" />; } }));
vi.mock('@fops/frontend/operator-screens/voc-detail', () => ({
  useVocDetailParts: () => { mounted.details += 1; return { title: 'VOC', body: <p>본문</p>, requestClose: () => undefined, view: { kind: 'loading' } }; },
}));

const SYSTEM = '33333333-3333-4333-8333-333333333333';
const VOC = 'a1821f1b-0000-4000-8000-00000000000a';
const request = vi.fn();

beforeAll(warmPages, 60_000);
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('fetch', request);
  mounted.screens = 0;
  mounted.details = 0;
  request.mockReset();
  setFoApi({ basePath: '/api/fo', onSessionLost: vi.fn() });
});
afterEach(() => { cleanup(); setFoApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

const OVERLONG = 'q'.repeat(101);
const INBOX_CASES = [
  ['tab', 'bogus'], ['sort', 'price:desc'], ['q', OVERLONG], ['area', 'not-a-uuid'], ['focus', 'abc'],
] as const;
const TRIAGE_CASES = [['tab', 'bogus'], ['area', 'not-a-uuid'], ['focus', 'abc']] as const;

describe.each([
  ['수신함', '/feedbackops/vocs', INBOX_CASES, 'inbox'],
  ['Triage', '/feedbackops/triage', TRIAGE_CASES, 'triage'],
] as const)('%s with an invalid address value', (_name, path, cases, testId) => {
  it.each(cases)('rejects an invalid %s, keeps the address and requests nothing from FeedbackOps', async (key, value) => {
    const search = `?${key}=${encodeURIComponent(value)}&managedSystem=${SYSTEM}`;
    mountAt(`${path}${search}`);
    expect((await screen.findByText(`주소의 ${key} 값이 올바르지 않습니다`, undefined, { timeout: 3000 }))).toBeTruthy();
    expect(screen.getByText('다른 값으로 바꾸지 않았습니다.')).toBeTruthy();
    expect(screen.queryByTestId(testId)).toBeNull();
    expect(mounted).toEqual({ screens: 0, details: 0 });
    expect(request).not.toHaveBeenCalled();
    expect(window.location.search).toBe(search);
  });

  it('clears only the rejected key, then mounts the screen with the other keys kept', async () => {
    mountAt(`${path}?tab=bogus&managedSystem=${SYSTEM}`);
    fireEvent.click(await screen.findByRole('button', { name: '값 지우기' }, { timeout: 3000 }));
    expect(await screen.findByTestId(testId)).toBeTruthy();
    const params = new URLSearchParams(window.location.search);
    expect(params.has('tab')).toBe(false);
    expect(params.get('managedSystem')).toBe(SYSTEM);
  });

  it('mounts normally for valid values (an area UUID, "unset", a UUID focus, a 100-character q)', async () => {
    mountAt(`${path}?tab=unassigned&area=unset&focus=${VOC}&managedSystem=${SYSTEM}`);
    expect(await screen.findByTestId(testId, undefined, { timeout: 3000 })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/값이 올바르지 않습니다/)).toBeNull());
  });
});

describe('수신함 filters', () => {
  it('accepts a 100-character q (101 is rejected above)', async () => {
    mountAt(`/feedbackops/vocs?q=${'q'.repeat(100)}`);
    expect(await screen.findByTestId('inbox', undefined, { timeout: 3000 })).toBeTruthy();
  });
});
