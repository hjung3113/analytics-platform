import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { useHostSeam } from '@/lib/host/host-seam';
import { mountAt, warmPages } from '../test-support';

vi.mock('@ap/feature-screens/operator-screens/voc-triage', () => ({
  TriageScreen: () => {
    const seam = useHostSeam();
    const go = seam.useNavigate!();
    return <div data-testid="triage" data-here={seam.useHere!()} data-can-inbox={String(seam.canLink('/vocs?view=inbox&tab=unassigned'))}>
      <button type="button" onClick={() => go(`/vocs?view=triage&selected=${VOC}&tab=unassigned`)}>선택</button>
    </div>;
  },
}));

const SYSTEM = '33333333-3333-4333-8333-333333333333';
const VOC = 'a1821f1b-0000-4000-8000-00000000000a';

beforeAll(warmPages, 60_000);
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('Triage without a FeedbackOps API (mock preview)', () => {
  it('shows 실서버 필요 and mounts no screen', async () => {
    mountAt('/feedbackops/triage');
    // The first mount lazy-loads the page module, which can pass the default 1 s under a loaded run.
    expect(await screen.findByRole('heading', { name: 'Triage' }, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect(screen.queryByTestId('triage')).toBeNull();
  });
});

describe('Triage through the FeedbackOps bridge', () => {
  beforeEach(() => { setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });

  it('renders the triage screen with the page read as the triage FO path', async () => {
    mountAt(`/feedbackops/triage?tab=high-no-link&managedSystem=${SYSTEM}&area=unset`);
    const triage = await screen.findByTestId('triage');
    const here = new URL(triage.getAttribute('data-here')!, 'http://x');
    expect(here.pathname).toBe('/vocs');
    expect(Object.fromEntries(here.searchParams)).toEqual({ view: 'triage', tab: 'high-no-link', managedSystem: SYSTEM, 'filter.analytics_area': 'unset' });
    expect(triage.getAttribute('data-can-inbox')).toBe('true');
  });

  it('selects through focus in the Triage menu, with no shell drawer (its panel stays inside the screen)', async () => {
    mountAt('/feedbackops/triage?tab=unassigned');
    fireEvent.click(await screen.findByRole('button', { name: '선택' }));
    await waitFor(() => expect(window.location.search).toContain(`focus=${VOC}`));
    expect(window.location.pathname).toBe('/feedbackops/fo-triage');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
