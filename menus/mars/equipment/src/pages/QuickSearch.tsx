import { useEffect, useRef, useState } from 'react';
import { Input } from '@ap/ui';

/**
 * The quick search in the table toolbar (ADR-0037, ADR-0105): a draft that applies on Enter, not on every keystroke. The draft rebases when the
 * applied value changes from outside (Back/Forward, a clear). Clearing the field (the native × or an emptied draft) applies at once.
 * An Enter that belongs to an IME composition only commits the text (isComposing, keyCode 229, or the Safari Enter right after compositionend).
 */
export function QuickSearch({ applied, label, onApply }: { applied: string; label: string; onApply: (value: string) => void }) {
  const [draft, setDraft] = useState(applied);
  const [synced, setSynced] = useState(applied);
  if (synced !== applied) { setSynced(applied); setDraft(applied); }
  const afterComposition = useRef(false);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return <Input
    type="search" inputSize="toolbar" aria-label={label} placeholder={label} value={draft}
    onChange={event => {
      setDraft(event.target.value);
      if (event.target.value === '' && applied !== '') onApply('');
    }}
    onCompositionStart={() => { afterComposition.current = false; }}
    onCompositionEnd={() => {
      afterComposition.current = true;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => { afterComposition.current = false; });
    }}
    onKeyDown={event => {
      if (event.key !== 'Enter') { afterComposition.current = false; return; }
      const composing = event.nativeEvent.isComposing || event.keyCode === 229 || afterComposition.current;
      afterComposition.current = false;
      if (composing) { event.preventDefault(); return; }
      if (draft !== applied) onApply(draft);
    }}
  />;
}
