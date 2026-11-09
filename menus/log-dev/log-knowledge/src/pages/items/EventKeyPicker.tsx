import { useState } from 'react';
import { Combobox } from '@ap/ui';
import { useSpecWords } from '../spec/SpecControls';

/** The menu owns the key vocabulary; a typed stable key is an ordinary selectable option, even without a specification. */
export function EventKeyPicker({ id, value, options, onChange, onSearchChange, compact = false, disabled = false, invalid, describedBy }: {
  id: string; value: string; options: string[]; onChange: (key: string) => void; onSearchChange?: (text: string) => void;
  compact?: boolean; disabled?: boolean; invalid?: boolean; describedBy?: string;
}) {
  const w = useSpecWords(), [search, setSearch] = useState('');
  const keys = [...new Set([...options, ...(value ? [value] : []), ...(search.trim() ? [search.trim()] : [])])];
  return <Combobox id={id} font="mono" density={compact ? 'compact' : 'default'} value={value || null}
    options={keys.map(key => ({ value: key, label: key }))} onChange={onChange} disabled={disabled}
    onSearchChange={text => { setSearch(text); onSearchChange?.(text); }} filterOptions={onSearchChange === undefined}
    searchPlaceholder={w('Event 키 입력', 'Enter an Event key')} placeholder={w('MODULE/EVENT 키 선택·입력', 'Select or enter a MODULE/EVENT key')}
    listboxLabel={w('Event 키', 'Event keys')} emptyText={w('Event 키를 입력하세요', 'Enter an Event key')}
    aria-invalid={invalid} aria-describedby={describedBy} />;
}
