import { useRef, useState, type RefObject } from 'react';
import type { Result, SavedViewContext, SavedViewKind } from '@ap/contracts';
import { useI18n, useMessages } from '@ap/kernel';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, RadioGroup, RadioGroupItem } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import { failureText, panelBadgeText, summarizeContext } from './text';

export type SaveViewSubmit = { mode: 'new' | 'update'; unit: SavedViewKind; name: string; visibility: string };
export type SaveViewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Units the caller can save in; a single unit hides the choice. */
  units: readonly SavedViewKind[];
  /** Present when the current view can be updated; enables the `update` mode. */
  updatable?: { name: string; unit?: SavedViewKind };
  initialMode?: 'new' | 'update';
  initialName?: string;
  /** The applied conditions that will be saved. */
  context: SavedViewContext;
  /** A query draft exists: only the applied conditions are saved. */
  hasDraft?: boolean;
  /** Read-only summary of the panels the view carries and the values left out of it. */
  panels?: { count: number; excluded?: readonly string[] };
  /** Audience choices for a new view (first is the default); chosen only by the final save. */
  visibilityOptions?: readonly { value: string; label: string }[];
  /** Where focus goes when the dialog closes (e.g. the save menu button). Without it, the element focused when the dialog opened is used if it is still on the page. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  onSubmit: (input: SaveViewSubmit) => Promise<Result<unknown>>;
};

export function SaveViewDialog(props: SaveViewDialogProps) {
  const { lang } = useI18n();
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <DialogBody key="body" {...props} lang={lang} opener={opener} />}
    </Dialog>
  );
}

function DialogBody({ units, updatable, initialMode, initialName = '', context, hasDraft, panels, visibilityOptions = [], onSubmit, onOpenChange, returnFocusRef, lang, opener }: SaveViewDialogProps & { lang: 'ko' | 'en'; opener: RefObject<HTMLElement | null> }) {
  const { t, tx } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const [mode, setMode] = useState<'new' | 'update'>(updatable && initialMode !== 'new' ? 'update' : 'new');
  const [unit, setUnit] = useState<SavedViewKind>(units[0] ?? 'menu-view');
  const [name, setName] = useState(initialName);
  const [visibility, setVisibility] = useState(visibilityOptions[0]?.value ?? '');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const updating = mode === 'update';
  const nameMissing = !updating && name.trim() === '';
  const summary = summarizeContext(context, lang);
  const savedUnit = updating ? updatable?.unit ?? unit : unit;
  const withPanels = savedUnit === 'menu-view';

  const submit = async () => {
    setTouched(true);
    if (nameMissing) return;
    setBusy(true); setFailure(null);
    const result = await onSubmit({ mode, unit, name: updating ? updatable?.name ?? name : name.trim(), visibility });
    setBusy(false);
    if (result.ok) onOpenChange(false);
    else setFailure(failureText(result, tx) + (result.detail ? ` (${result.detail})` : ''));
  };

  return (
    <DialogContent
      closeLabel={t('close')}
      onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        const back = returnFocusRef?.current ?? opener.current;
        if (back?.isConnected) back.focus();
      }}
    >
      <DialogHeader>
        <DialogTitle>{m(updating ? 'svDialogUpdateTitle' : 'svDialogTitle')}</DialogTitle>
        <DialogDescription className="sr-only">{m('svDialogTitle')}</DialogDescription>
      </DialogHeader>
      <form className="space-y-3 text-sm" onSubmit={event => { event.preventDefault(); void submit(); }}>
        {hasDraft && <p role="note" className="text-xs text-text-secondary">{m('svDraftNotice')}</p>}
        {updatable && (
          <fieldset className="space-y-1">
            <legend className="text-xs text-text-secondary">{m('svMode')}</legend>
            <RadioGroup value={mode} onValueChange={value => setMode(value as 'new' | 'update')}>
              <div className="flex items-center gap-2"><RadioGroupItem id="save-mode-update" value="update" /><Label htmlFor="save-mode-update">{m('svModeUpdate')}: {updatable.name}</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem id="save-mode-new" value="new" /><Label htmlFor="save-mode-new">{m('svModeNew')}</Label></div>
            </RadioGroup>
          </fieldset>
        )}
        {!updating && units.length > 1 && (
          <fieldset className="space-y-1">
            <legend className="text-xs text-text-secondary">{m('svUnit')}</legend>
            <RadioGroup value={unit} onValueChange={value => setUnit(value as SavedViewKind)}>
              {units.map(u => <div key={u} className="flex items-center gap-2"><RadioGroupItem id={`save-unit-${u}`} value={u} /><Label htmlFor={`save-unit-${u}`}>{m(u === 'menu-view' ? 'svUnitMenuView' : 'svUnitConditionSet')}</Label></div>)}
            </RadioGroup>
          </fieldset>
        )}
        {!updating && (
          <div className="space-y-1">
            <Label htmlFor="save-view-name">{m('svName')}</Label>
            <Input id="save-view-name" value={name} aria-invalid={touched && nameMissing ? true : undefined} aria-describedby={touched && nameMissing ? 'save-view-name-error' : undefined} onChange={event => setName(event.target.value)} />
            {touched && nameMissing && <p id="save-view-name-error" role="alert" className="text-xs text-text-danger-label">{m('svNameRequired')}</p>}
          </div>
        )}
        {!updating && visibilityOptions.length > 0 && (
          <fieldset className="space-y-1">
            <legend className="text-xs text-text-secondary">{m('svVisibility')} · {m('svVisibilityHint')}</legend>
            <RadioGroup value={visibility} onValueChange={setVisibility}>
              {visibilityOptions.map(o => <div key={o.value} className="flex items-center gap-2"><RadioGroupItem id={`save-visibility-${o.value}`} value={o.value} /><Label htmlFor={`save-visibility-${o.value}`}>{o.label}</Label></div>)}
            </RadioGroup>
          </fieldset>
        )}
        <section aria-label={m('svIncludes')} className="space-y-1 text-xs">
          <h3 className="text-text-secondary">{m('svIncludes')}</h3>
          <ul className="list-disc pl-4">
            {summary.length ? summary.map(line => <li key={line}>{line}</li>) : <li>{m('svNoContent')}</li>}
            {withPanels && panels && panels.count > 0 && <li>{m('svPanelsHeading')}: {panelBadgeText(panels.count, lang)}</li>}
            {withPanels && panels?.excluded?.length ? <li>{m('svExcludedHeading')}: {panels.excluded.join(', ')}</li> : null}
          </ul>
        </section>
        {failure && <p role="alert" className="text-xs text-text-danger-label">{failure}</p>}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
          <Button type="submit" disabled={busy}>{busy ? m('svSaving') : m('svSubmit')}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
