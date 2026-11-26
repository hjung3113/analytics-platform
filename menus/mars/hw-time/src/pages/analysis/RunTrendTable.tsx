import { Table2 } from 'lucide-react';
import { PlatformDataTable, type PlatformColumn } from '@ap/components';
import { useI18n, useMessages } from '@ap/kernel';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@ap/ui';
import { HW_TIME_UNIT } from '../../endpoints';
import { HW_TIME_NEW_PANEL_MESSAGES as N, HW_TIME_OVERVIEW_MESSAGES } from '../../messages';
import { formatSeconds, missingText } from '../../shared/format';
import { htmStatusText } from '../../shared/htm';
import type { RunTrendTableRow } from './runTrendData';

/** `note` names a Module roll-up: its values sum Motions and have no HTM limits of their own, so the limit columns are left out. */
export function RunTrendTable({ title, note, rows }: { title: string; note?: string; rows: readonly RunTrendTableRow[] }) {
  const { lang, t } = useI18n();
  const m = useMessages(HW_TIME_OVERVIEW_MESSAGES);
  const n = useMessages(N);
  const seconds = (value: number | null | undefined) => value == null ? missingText(lang) : formatSeconds(value, lang);
  const unit = HW_TIME_UNIT[lang];
  const columns: PlatformColumn<RunTrendTableRow>[] = [
    { id: 'equipment', header: m('equipment'), value: row => row.equipment },
    { id: 'date', header: n('date'), value: row => row.date },
    { id: 'mean', header: `${m('average')} (${unit})`, value: row => row.value, cell: row => seconds(row.value), align: 'right', size: 115 },
    ...note ? [] : [
      { id: 'lower', header: `${m('lower')} (${unit})`, value: row => row.bound.lower, cell: row => seconds(row.bound.lower), align: 'right', size: 115 },
      { id: 'upper', header: `${m('upper')} (${unit})`, value: row => row.bound.upper, cell: row => seconds(row.bound.upper), align: 'right', size: 115 },
    ] satisfies PlatformColumn<RunTrendTableRow>[],
    { id: 'status', header: m('status'), value: row => row.judgement ? htmStatusText(row.judgement, lang) : missingText(lang) },
  ];
  const show = n('trendShowTable');
  return <Dialog>
    <DialogTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={show} title={show}><Table2 className="size-3.5" aria-hidden /></Button></DialogTrigger>
    {/* Without a note, opt out of the description link; with one, Radix links DialogDescription. */}
    <DialogContent {...(note ? {} : { 'aria-describedby': undefined })} closeLabel={t('close')} className="flex max-h-11/12 max-w-4xl flex-col">
      <DialogTitle>{title}</DialogTitle>
      {note && <DialogDescription>{note}</DialogDescription>}
      <PlatformDataTable fill hideTitle title={title} ariaLabel={title} rows={rows} columns={columns}
        preferenceKey="hw-time-overview:trend-table:v1" getRowId={row => `${row.equipment}/${row.date}`} />
    </DialogContent>
  </Dialog>;
}
