import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Assessment } from '@ap/contracts';
import { I18nProvider } from '@ap/kernel';
import { afterEach, describe, expect, it } from 'vitest';
import { EQV_MOCK_EQUIPMENT, EQV_MOCK_WINDOW, eqvMockContext, eqvMockEquipmentOptions, eqvMockEvents } from '../src/mock-data/index.js';
import { FocusScreen } from '../src/screens/FocusScreen.js';
import { TopViewScreen } from '../src/screens/TopViewScreen.js';
import { TrustLine } from '../src/screens/states.js';
import { createFake, response, type QueryCall } from './test-support.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
configure({ asyncUtilTimeout: 5000 });
afterEach(cleanup);

const UNKNOWN_COLLECTION = { kind: 'collection', state: 'unknown', reason: 'source_unavailable' } as const;
const UNKNOWN_TIME_DOMAIN = { kind: 'time_domain', state: 'unknown', reason: 'source_unavailable' } as const;

describe('TrustLine', () => {
  it('renders one Data Trust line for assessments without a Trust, and says some status could not be confirmed', () => {
    render(<I18nProvider><TrustLine trust={null} assessments={[UNKNOWN_COLLECTION, UNKNOWN_TIME_DOMAIN]} /></I18nProvider>);
    expect(screen.getAllByRole('button', { name: /Data Trust|데이터 신뢰/ })).toHaveLength(1);
    screen.getByTitle(/일부 상태를 확인하지 못했습니다 \(2\)/);
    expect(screen.queryByTitle(/확인된 이슈 없음/)).toBeNull();
  });

  it('renders nothing when the read said nothing at all', () => {
    const { container } = render(<I18nProvider><TrustLine trust={null} assessments={[]} /></I18nProvider>);
    expect(container.textContent).toBe('');
  });
});

/** The assessments the mock server gives the two replay reads (collection and time domain unverified, the other two clear), with no Trust (see apps/platform-web/src/dev/eqv-viewer-mock.test.ts). */
const MOCK_ASSESSMENTS: Assessment[] = [
  UNKNOWN_COLLECTION,
  { kind: 'processing_delay', state: 'clear', statusSource: 'mart-watermark', observedAt: '2026-09-26T08:58:00' },
  { kind: 'coverage', state: 'clear', statusSource: 'coverage-service', observedAt: '2026-09-26T08:58:00', detail: '98.7%' },
  UNKNOWN_TIME_DOMAIN,
];

describe('replay reads like the mock server answers them for eq-synth-01 (no Trust, two unverified checks)', () => {
  const mockServer = async ({ id, params }: QueryCall) => {
    if (id === 'eqv.equipment-options') return response('ok', eqvMockEquipmentOptions(), { assessments: [] });
    const { equipmentId, continuationToken } = params as { equipmentId: string; continuationToken?: string };
    const data = id === 'eqv.topview-context' ? eqvMockContext(equipmentId) : eqvMockEvents({ equipmentId, ...EQV_MOCK_WINDOW, continuationToken });
    return response('ok', data, { assessments: MOCK_ASSESSMENTS, trust: null });
  };

  it.each([['topview', TopViewScreen, '/tools/eqv-topview'], ['focus', FocusScreen, '/tools/eqv-focus']] as const)('%s: exactly one Data Trust line, naming both unverified checks', async (_name, Screen, path) => {
    const fake = createFake({ path, page: { equipment: EQV_MOCK_EQUIPMENT }, context: EQV_MOCK_WINDOW, query: mockServer });
    fake.render(Screen);
    await waitFor(() => expect(document.querySelector('tr[data-occurrence-id], [data-layer="replay"]')).not.toBeNull());
    const lines = screen.getAllByRole('button', { name: /Data Trust|데이터 신뢰/ });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.getAttribute('title')).toMatch(/일부 상태를 확인하지 못했습니다 \(2\)/);
    fireEvent.click(lines[0]!);
    const list = (await screen.findByText('수집')).closest('ul')!;
    expect(list.textContent).toContain('시간역');
    expect(list.textContent?.match(/미확인/g)).toHaveLength(2);
    // No invented finality: the absent Trust reads provisional with an unknown update time, never «확정»/«Final».
    const popover = list.closest('[role="dialog"]') ?? list.parentElement!;
    expect(popover.textContent).not.toMatch(/확정|Final/);
    expect(popover.textContent).toContain('잠정');
    expect(popover.textContent).toContain('응답에 Trust가 없음');
    expect(popover.textContent).toMatch(/갱신\s*—/);
  });
});
