import { useId } from 'react';
import { useI18n, useMessages } from '@ap/kernel';
import { RadioGroup, RadioGroupItem } from '@ap/ui';
import { SHELL_MESSAGES } from '../messages';

export function MembershipBasis({ value, onChange, disabled, history, customGroup }: {
  value: 'asOf' | null;
  onChange(value: 'asOf' | null): void;
  disabled: boolean;
  history: boolean;
  customGroup: boolean;
}) {
  const { t } = useI18n();
  const m = useMessages(SHELL_MESSAGES);
  const id = useId();
  return <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
    <span id={id}>{m('queryMembershipBasis')}</span>
    <RadioGroup disabled={disabled} appearance="segmented" orientation="horizontal" aria-labelledby={id} value={value ?? 'current'} onValueChange={next => onChange(next === 'asOf' ? 'asOf' : null)} onKeyDownCapture={event => {
      if (disabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const selectHistorical = history && event.key !== 'Home' && (event.key === 'End' || value !== 'asOf');
      onChange(selectHistorical ? 'asOf' : null);
      event.currentTarget.querySelector<HTMLButtonElement>(selectHistorical ? 'button[value="asOf"]' : 'button[value="current"]')?.focus();
    }}>
      <RadioGroupItem appearance="segmented" value="current">{m('queryCurrentMembership')}</RadioGroupItem>
      <RadioGroupItem appearance="segmented" value="asOf" disabled={!history} aria-describedby={history ? undefined : `${id}-hint`}>{t('membershipAsOf')}</RadioGroupItem>
    </RadioGroup>
    {!history && <p id={`${id}-hint`}>{m(customGroup ? 'customGroupCurrentOnly' : 'queryMembershipHistoryHint')}</p>}
  </div>;
}
