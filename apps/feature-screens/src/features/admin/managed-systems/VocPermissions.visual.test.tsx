import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemVocPermissions, type SystemPermissionRow } from './VocPermissions';

const mock = vi.hoisted(() => ({ modes: {} as Record<string, 'open' | 'restricted'>, bulk: vi.fn(), renderDetail: vi.fn(() => null) }));
vi.mock('../permissions/permission-gate', () => ({ PermissionGate: ({ children }: { children: ReactNode }) => children }));
vi.mock('./useVocPermissions', async importOriginal => ({
  ...await importOriginal<typeof import('./useVocPermissions')>(),
  useVocPermissions: () => ({
    ready: true, busy: false, known: () => true, drafts: {}, undo: null, notice: '',
    saved: (id: string) => ({ mode: mock.modes[id] ?? 'open', people: id === 'a' ? ['person-1', 'person-2'] : [] }),
    bulk: mock.bulk,
  }),
}));
const rows: SystemPermissionRow[] = ['Power BI', 'Tableau', 'Looker', 'Metabase', 'Grafana'].map((name, i) => ({
  key: String(i), id: String.fromCharCode(97 + i), name, kind: 'manual', platform: false, archived: false, business: '—', link: '플랫폼 밖',
}));
function mount() {
  render(<SystemVocPermissions rows={rows} fallback={null} renderDetail={mock.renderDetail} />);
}
function select(name: string) { fireEvent.click(screen.getByRole('checkbox', { name: `${name} 선택` })); }
async function filterRestricted() {
  fireEvent.click(screen.getByRole('combobox', { name: 'VOC 등록 필터' }));
  fireEvent.click(await screen.findByRole('option', { name: '지정한 사람만' }));
}
beforeEach(() => { mock.modes = { a: 'restricted' }; mock.bulk.mockReset().mockResolvedValue(true); mock.renderDetail.mockClear(); });
afterEach(cleanup);

describe('VOC permission review fixes', () => {
  it('names visible and hidden bulk targets in the bar and preview and can retain visible selections', async () => {
    mount(); select('Power BI'); select('Tableau'); await filterRestricted();
    const targets = screen.getByRole('region', { name: '일괄 변경 대상 목록' });
    expect(targets).toHaveTextContent('Power BI, Tableau');
    expect(targets).toHaveTextContent('보이는 항목 1개');
    expect(targets).toHaveTextContent('필터로 숨겨진 1개 포함');
    fireEvent.click(screen.getByRole('button', { name: '모두로' }));
    const preview = screen.getByRole('region', { name: '일괄 변경 적용 전 확인' });
    expect(preview).toHaveTextContent('Power BI, Tableau');
    expect(preview).toHaveTextContent('필터로 숨겨진 1개 포함');
    fireEvent.click(screen.getByRole('button', { name: '보이는 항목만 남기기' }));
    expect(targets).toHaveTextContent('Power BI');
    expect(targets).not.toHaveTextContent('Tableau');
    expect(screen.queryByRole('region', { name: '일괄 변경 적용 전 확인' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '선택 해제' }));
    expect(screen.getByRole('checkbox', { name: 'Power BI 선택' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: '모두로' })).toBeDisabled();
  });
  it('keeps all-hidden targets reviewable and clears them without changing the filter', async () => {
    mount(); select('Tableau'); select('Looker'); await filterRestricted();
    const targets = screen.getByRole('region', { name: '일괄 변경 대상 목록' });
    expect(targets).toHaveTextContent('Tableau, Looker');
    expect(targets).toHaveTextContent('필터로 숨겨진 2개 포함');
    fireEvent.click(screen.getByRole('button', { name: '보이는 항목만 남기기' }));
    expect(screen.getByRole('button', { name: '모두로' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'VOC 등록 필터' })).toHaveTextContent('지정한 사람만');
  });
  it('collapses more than three names and provides the complete expandable list in both summaries', () => {
    mount(); for (const row of rows) select(row.name);
    fireEvent.click(screen.getByRole('button', { name: '모두로' }));
    for (const name of ['일괄 변경 대상 목록', '적용 전 대상 목록']) {
      const region = screen.getByRole('region', { name });
      const summary = region.querySelector('summary');
      if (!summary) throw new Error('Missing expandable target summary');
      expect(summary).toHaveTextContent('Power BI, Tableau, Looker 외 2개');
      const list = within(region).getByRole('list', { hidden: true });
      expect(within(list).getAllByRole('listitem', { hidden: true })).toHaveLength(5);
      expect(list).toHaveTextContent('Grafana');
      expect(summary?.closest('details')).not.toHaveAttribute('open');
      fireEvent.click(summary);
      expect(summary?.closest('details')).toHaveAttribute('open');
    }
  });
  it('exposes the saved mode and people count in each settings button name', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Power BI VOC 등록 설정, 현재 지정 2명' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tableau VOC 등록 설정, 현재 모두' })).toBeInTheDocument();
  });
  it('separates selected, changed and unchanged counts and applies the effective targets only', () => {
    mount(); select('Power BI'); select('Tableau');
    fireEvent.click(screen.getByRole('button', { name: '지정한 사람만으로' }));
    expect(screen.getByRole('region', { name: '일괄 변경 적용 전 확인' })).toHaveTextContent('선택 2개 · 변경 1개 · 이미 같은 설정 1개');
    fireEvent.click(screen.getByRole('button', { name: '1개 시스템에 적용' }));
    expect(mock.bulk).toHaveBeenCalledWith([rows[1]], 'restricted');
  });
  it('disables a zero-change apply with an associated reason', () => {
    mount(); select('Power BI');
    fireEvent.click(screen.getByRole('button', { name: '지정한 사람만으로' }));
    const apply = screen.getByRole('button', { name: '0개 시스템에 적용' });
    expect(apply).toBeDisabled();
    expect(apply).toHaveAccessibleDescription('선택한 시스템이 이미 같은 설정입니다. 변경할 시스템이 없습니다.');
    fireEvent.click(apply); expect(mock.bulk).not.toHaveBeenCalled();
  });
  it('gives the checkbox a 24px label target whose padding selects without opening the row', () => {
    mount(); const checkbox = screen.getByRole('checkbox', { name: 'Power BI 선택' });
    const label = checkbox.closest('label');
    if (!label) throw new Error('Missing checkbox hit target');
    expect(label).toHaveClass('size-6');
    expect(label).toHaveAttribute('for', checkbox.id);
    fireEvent.click(label);
    expect(checkbox).toBeChecked();
    expect(mock.renderDetail).not.toHaveBeenCalled();
  });
  it('shows directional sort icons only after activation and keeps aria-sort aligned', () => {
    mount(); const button = screen.getByRole('button', { name: 'VOC 등록 정렬' });
    expect(button.closest('th')).toHaveAttribute('aria-sort', 'none');
    expect(button.querySelector('svg')).toBeNull();
    fireEvent.click(button);
    expect(button.closest('th')).toHaveAttribute('aria-sort', 'ascending');
    expect(button.querySelector('.lucide-arrow-up')).toBeInTheDocument();
    fireEvent.click(button);
    expect(button.closest('th')).toHaveAttribute('aria-sort', 'descending');
    expect(button.querySelector('.lucide-arrow-down')).toBeInTheDocument();
  });
});
