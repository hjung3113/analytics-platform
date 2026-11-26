import { useId, useState } from 'react';
import type { GlobalContext } from '@ap/contracts';
import { presetOutsideAxes, SegmentedRadio } from '@ap/components';
import { type useConditionPreset, useI18n, useMessages, useQueryDraft } from '@ap/kernel';
import { SHELL_MESSAGES } from '../messages';

export function ConditionPresetSelector({ preset, global, disabled }: {
  preset: NonNullable<ReturnType<typeof useConditionPreset>>;
  global: GlobalContext;
  disabled?: boolean;
}) {
  const { lang } = useI18n();
  const m = useMessages(SHELL_MESSAGES);
  const { setDraftPage } = useQueryDraft();
  const labelId = useId();
  const [notice, setNotice] = useState({ id: '', text: '' });
  const label = m('queryConditionSet');
  const change = (next: string) => {
    setDraftPage({ [preset.key]: next });
    const selected = preset.presets.find(item => item.id === next);
    const left = selected ? presetOutsideAxes(global, { key: preset.key, presets: preset.presets, id: next }).length : 0;
    const name = selected?.label[lang] ?? next;
    setNotice({ id: next, text: left ? m('queryPresetNoticeWithUnused', { name, count: left }) : m('queryPresetNotice', { name }) });
  };
  return <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-text-secondary">
    <span id={labelId}>{label}</span>
    <SegmentedRadio disabled={disabled} label={label} labelledBy={labelId} value={preset.activeId} onChange={change}
      options={preset.presets.map(item => ({ value: item.id, label: item.label[lang] }))} />
    <p role="status" className="sr-only">{notice.id === preset.activeId ? notice.text : ''}</p>
  </div>;
}
