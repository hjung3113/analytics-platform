import { formatNumber } from '@ap/contracts';
import { Button } from '@ap/ui';

type Props = {
  lang: 'ko' | 'en';
  /** Rows of the shown page. */
  pageRows: number;
  /** Result total (display). */
  total: number;
  /** Offer the widening: the whole page is checked and more results exist. */
  offer: boolean;
  /** The active whole-result selection, if any (`total` is the snapshot taken when it was chosen). */
  all: { total: number } | null;
  /** Rows the user unchecked out of the whole-result selection. */
  excluded: number;
  onSelectAll: () => void;
  onClear: () => void;
};

/** Gmail-style bar of the opt-in `selectAllResults` (#556c, ADR-0104): offers 「필터 결과 전체 M행 선택」 and, once chosen, states it and clears it. Renders nothing otherwise. */
export function SelectAllBar({ lang, pageRows, total, offer, all, excluded, onSelectAll, onClear }: Props) {
  if (!offer && !all) return null;
  const ko = lang === 'ko';
  return <div data-testid="select-all-bar" className="flex min-h-9 flex-wrap items-center gap-2 border-t border-border-subtle bg-surface-card px-3 py-1.5 text-xs" role="status">
    {all ? <>
      <span className="tabular">{excluded > 0
        ? (ko ? `필터 결과 전체 ${formatNumber(all.total, lang)}행 중 ${formatNumber(excluded, lang)}행 제외` : `${formatNumber(excluded, lang)} of ${formatNumber(all.total, lang)} filtered rows excluded`)
        : (ko ? `필터 결과 전체 ${formatNumber(all.total, lang)}행을 선택했습니다` : `All ${formatNumber(all.total, lang)} filtered rows are selected`)}</span>
      <Button variant="ghost" size="toolbar" onClick={onClear}>{ko ? '선택 해제' : 'Clear selection'}</Button>
    </> : <>
      <span className="tabular">{ko ? `이 쪽의 ${formatNumber(pageRows, lang)}행을 선택했습니다` : `All ${formatNumber(pageRows, lang)} rows on this page are selected`}</span>
      <Button variant="ghost" size="toolbar" onClick={onSelectAll}>{ko ? `필터 결과 전체 ${formatNumber(total, lang)}행 선택` : `Select all ${formatNumber(total, lang)} filtered rows`}</Button>
    </>}
  </div>;
}
