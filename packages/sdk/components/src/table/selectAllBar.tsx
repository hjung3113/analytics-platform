import { formatNumber } from '@ap/contracts';
import { useMessages } from '@ap/kernel';
import { Button } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';

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
  const m = useMessages(COMPONENTS_MESSAGES);
  if (!offer && !all) return null;
  return <div data-testid="select-all-bar" className="flex min-h-9 flex-wrap items-center gap-2 border-t border-border-subtle bg-surface-card px-3 py-1.5 text-xs" role="status">
    {all ? <>
      <span className="tabular">{excluded > 0
        ? m('tableSelectBarExcluded', { total: formatNumber(all.total, lang), excluded: formatNumber(excluded, lang) })
        : m('tableSelectBarAll', { total: formatNumber(all.total, lang) })}</span>
      <Button variant="ghost" size="toolbar" onClick={onClear}>{m('tableClearSelection')}</Button>
    </> : <>
      <span className="tabular">{m('tableSelectBarPage', { count: formatNumber(pageRows, lang) })}</span>
      <Button variant="ghost" size="toolbar" onClick={onSelectAll}>{m('tableSelectBarSelectAll', { total: formatNumber(total, lang) })}</Button>
    </>}
  </div>;
}
