import { useState } from 'react';
import { usePlatform } from '@ap/kernel';
import { Input } from '@ap/ui';
import { useImeComposition } from '../filters/useImeEnterGuard';

export type TableQuickSearchProps = {
  /** The page key the menu declares for this search (e.g. 'q'); the applied value is read from it. */
  pageKey: string;
  /** Accessible name of the field; also the default placeholder. */
  label: string;
  /** Placeholder; defaults to `label`, as before. */
  placeholder?: string;
  /** Page keys cleared on apply (back to page 1); default `['page']`. */
  resetKeys?: readonly string[];
};

/**
 * The quick search of the table toolbar slot (06 §15, ADR-0037·ADR-0105, #1232): a draft that applies on Enter, not on every
 * keystroke. The draft rebases when the applied value changes from outside (Back/Forward, a clear). Clearing the field (the
 * native × or an emptied draft) applies at once. An Enter that belongs to an IME composition only commits the text.
 */
export function TableQuickSearch({ pageKey, label, placeholder, resetKeys = ['page'] }: TableQuickSearchProps) {
  const { pageParam, setPage } = usePlatform();
  const applied = pageParam(pageKey) ?? '';
  const [draft, setDraft] = useState(applied);
  const [synced, setSynced] = useState(applied);
  if (synced !== applied) { setSynced(applied); setDraft(applied); }
  const ime = useImeComposition();
  const apply = (value: string) => {
    const patch: Record<string, string | null> = { [pageKey]: value === '' ? null : value };
    for (const key of resetKeys) patch[key] = null;
    setPage(patch);
  };
  return <Input
    type="search" inputSize="toolbar" aria-label={label} placeholder={placeholder ?? label} value={draft}
    onChange={event => {
      setDraft(event.target.value);
      if (event.target.value === '' && applied !== '') apply('');
    }}
    onCompositionStart={ime.onCompositionStart}
    onCompositionEnd={ime.onCompositionEnd}
    onKeyDown={event => {
      if (event.key !== 'Enter') { ime.release(); return; }
      if (ime.composingEnter(event)) { event.preventDefault(); return; }
      if (draft !== applied) apply(draft);
    }}
  />;
}
