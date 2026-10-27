// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Gauge } from 'lucide-react';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import MetricCatalogPage from './MetricCatalog';
import { groupId, spaceId, type ApiResponse, type MenuQuery, type PlatformAdapter } from '@ap/contracts';
import { PERMISSION } from '../permission';

afterEach(cleanup);

// Real manifests so /metrics keeps its declared pageKeys; only the group/space wiring is added.
const registry = createRegistry({
  permissions: [PERMISSION],
  spaces: [{ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'metric-catalog' }],
  groups: [{ id: groupId('metrics'), label: { ko: '지표관리', en: 'Metrics' }, icon: Gauge, space: spaceId('mars') }],
  menus: manifests,
});

const session = testSession(['platform:view', 'metrics:view'], { user: { id: 'user-a', name: 'user-a', title: { ko: 'a', en: 'a' } } });

/** The catalog count query (`metrics.catalog.list`) fails; every other menu query answers empty. */
function fixture(): PlatformAdapter {
  return testAdapter({
    menuQuery: async (request: MenuQuery): Promise<ApiResponse<unknown>> =>
      request.endpoint === 'metrics.catalog.list'
        ? { outcome: 'error', data: null, message: 'catalog unavailable', assessments: [], trust: null, correlationId: 'fixture' }
        : { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' },
    session: () => session,
  });
}

describe('metric catalog count under a failed list query (UXA-4)', () => {
  /** Same as `fixture()`, but the `metrics.catalog.list` response is held until the test releases it. */
  function deferredFixture(): { adapter: PlatformAdapter; release: (response: ApiResponse<unknown>) => void } {
    let release!: (response: ApiResponse<unknown>) => void;
    const pending = new Promise<ApiResponse<unknown>>(resolve => { release = resolve; });
    const base = fixture();
    return {
      release,
      adapter: {
        ...base,
        menuQuery: (request: MenuQuery) =>
          request.endpoint === 'metrics.catalog.list' ? pending : base.menuQuery(request),
      },
    };
  }

  it('shows the pending count (…) until the failing response lands, then drops the number', async () => {
    window.history.replaceState(null, '', '/metrics');
    const { adapter, release } = deferredFixture();
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><MetricCatalogPage params={{}} /></PlatformProvider></I18nProvider>);
    // No response yet: the count stays pending, it is neither a number nor a failure statement.
    const pending = await screen.findByText(/발행 포인터는 레코드에 저장된 값/);
    expect(pending.textContent).toContain('합성 …건');
    expect(pending.textContent).not.toContain('합성 지표입니다');
    await act(async () => {
      release({ outcome: 'error', data: null, message: 'catalog unavailable', assessments: [], trust: null, correlationId: 'fixture' });
    });
    expect(await screen.findByText(/합성 지표입니다/)).toBeTruthy();
    expect(screen.getByText(/발행 포인터는 레코드에 저장된 값/).textContent).not.toContain('…');
  });

  it('drops the numeric count (no …) once the count query failed', async () => {
    window.history.replaceState(null, '', '/metrics');
    render(<I18nProvider><PlatformProvider adapter={fixture()} registry={registry}><MetricCatalogPage params={{}} /></PlatformProvider></I18nProvider>);
    // The count line first paints as pending (…) — wait for the failure itself, not the first paint.
    await screen.findByText(/합성 지표입니다/);
    const subtitle = screen.getByText(/발행 포인터는 레코드에 저장된 값/);
    expect(subtitle.textContent).toContain('합성 지표입니다');
    expect(subtitle.textContent).not.toContain('…');
  });
});

// #304 FIX1: the warning keeps the field's user name and the raw value as entered (quoted, untruncated),
// one sentence per invalid field — never `key=value`.
describe('invalid URL value warnings keep field name and raw value (#304 FIX1)', () => {
  it('the footer caption names the Context keys by their user labels (U-5)', () => {
    window.history.replaceState(null, '', '/metrics?v=1&scopeId=MEM');
    render(<I18nProvider><PlatformProvider adapter={fixture()} registry={registry}><MetricCatalogPage params={{}} /></PlatformProvider></I18nProvider>);
    expect(screen.getByText(/이 목록의 필터가 아닙니다/).textContent).toContain('기간·Lot·room_name·설비 그룹 조건·설비 선택은 이 목록의 필터가 아닙니다.');
  });

  it('domain=bogus names the 도메인 field and the entered value, without key=value', async () => {
    window.history.replaceState(null, '', '/metrics?v=1&scopeId=MEM&domain=bogus');
    render(<I18nProvider><PlatformProvider adapter={fixture()} registry={registry}><MetricCatalogPage params={{}} /></PlatformProvider></I18nProvider>);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('도메인');
    expect(alert.textContent).toContain('bogus');
    expect(alert.textContent).not.toContain('domain=');
    expect(alert.textContent).toContain('초기화');
  });

  it('invalid sort and page values each name their own field and raw value', async () => {
    window.history.replaceState(null, '', '/metrics?v=1&scopeId=MEM&sort=bogus&page=zzz');
    render(<I18nProvider><PlatformProvider adapter={fixture()} registry={registry}><MetricCatalogPage params={{}} /></PlatformProvider></I18nProvider>);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('정렬');
    expect(alert.textContent).toContain('bogus');
    expect(alert.textContent).toContain('페이지');
    expect(alert.textContent).toContain('zzz');
    expect(alert.textContent).not.toContain('sort=');
    expect(alert.textContent).not.toContain('page=');
  });
});

describe('metric catalog invalid URL values (ADR-0034 sentences)', () => {
  const renderAt = (path: string) => {
    window.history.replaceState(null, '', path);
    render(<I18nProvider><PlatformProvider adapter={fixture()} registry={registry}><MetricCatalogPage params={{}} /></PlatformProvider></I18nProvider>);
  };
  const alertParagraphs = (alert: HTMLElement) => [...alert.querySelectorAll('p')].map(p => p.textContent);

  it('an invalid status states the exact filter sentence and Reset clears only that key', async () => {
    renderAt('/metrics?status=bogus&domain=quality');
    const alert = await screen.findByRole('alert');
    expect(alertParagraphs(alert)).toEqual(['상태 “bogus”는 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.']);
    fireEvent.click(within(alert).getByRole('button', { name: '초기화' }));
    const params = new URLSearchParams(window.location.search);
    expect(params.has('status')).toBe(false);
    expect(params.get('domain')).toBe('quality');
  });

  it('Reset of an invalid filter moves focus off the removed button (06 §26, #924)', async () => {
    renderAt('/metrics?status=bogus');
    const alert = await screen.findByRole('alert');
    const reset = within(alert).getByRole('button', { name: '초기화' });
    reset.focus();
    fireEvent.click(reset);
    await act(async () => { await Promise.resolve(); });
    expect(reset.isConnected).toBe(false);
    // The button went away with the message: focus must not fall to <body>.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).not.toBe(reset);
  });

  it('invalid sort and page state the exact value sentences and Reset clears both', async () => {
    renderAt('/metrics?sort=bogus&page=0&q=abc');
    const alert = await screen.findByRole('alert');
    expect(alertParagraphs(alert)).toEqual([
      '정렬 “bogus”은 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.',
      '페이지 “0”는 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.',
    ]);
    fireEvent.click(within(alert).getByRole('button', { name: '초기화' }));
    const params = new URLSearchParams(window.location.search);
    expect(params.has('sort')).toBe(false);
    expect(params.has('page')).toBe(false);
    expect(params.get('q')).toBe('abc');
  });
});
