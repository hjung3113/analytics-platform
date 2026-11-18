import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, MoreHorizontal } from 'lucide-react';
import { useMessages, usePlatform, useQueryContext } from '@ap/kernel';
import { Button, Checkbox, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Input, Label, useImeEnterGuard } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import { MAX_GROUP_LABEL_LENGTH, MIN_GROUP_WIDTH, validGroupName } from './columnGroups';
import { MAX_GROUP_MEMBERS, MAX_GROUP_ID_LENGTH } from '@ap/contracts';

type Draft = { kind: 'idle' } | { kind: 'choose'; id?: string; name: string; members: string[] } | { kind: 'rename'; id: string; name: string };
const idle: Draft = { kind: 'idle' };
export function useColumnGroupEditor(identity: string) {
  const { session } = usePlatform();
  const { scopeId } = useQueryContext();
  const [owner, setOwner] = useState({ identity, session, scopeId });
  const [draft, setDraft] = useState<Draft>(idle);
  const [note, setNote] = useState('');
  if (owner.identity !== identity || owner.session !== session || owner.scopeId !== scopeId) {
    setOwner({ identity, session, scopeId });
    setDraft(idle);
    setNote('');
  }
  return {
    draft,
    note, setNote,
    start: () => setDraft({ kind: 'choose', name: '', members: [] }),
    edit: (id: string, name: string, members: string[]) => setDraft({ kind: 'choose', id, name, members }),
    rename: (id: string, name: string) => setDraft({ kind: 'rename', id, name }),
    cancel: () => setDraft(idle),
    setName: (name: string) => setDraft(d => d.kind === 'idle' ? d : { ...d, name }),
    toggle: (id: string) => setDraft(d => d.kind !== 'choose' ? d : { ...d, members: d.members.includes(id) ? d.members.filter(member => member !== id) : [...d.members, id] }),
  };
}

type Editor = ReturnType<typeof useColumnGroupEditor>;
export function ColumnGroupChooseView({ editor, columns, idPrefix, onSave, onCancel }: {
  editor: Editor;
  columns: { id: string; label: string; hidden: boolean; group?: string }[];
  idPrefix: string;
  onSave: () => void;
  /** Leaves the choose view; the table hands focus back to the control that opened it. */
  onCancel: () => void;
}) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const ime = useImeEnterGuard();
  const draft = editor.draft;
  if (draft.kind !== 'choose') return null;
  return <div className="space-y-3 break-keep">
    <div className="flex min-w-0 items-center gap-2">
      <Button autoFocus type="button" variant="ghost" size="icon-xs" aria-label={m('tableGroupCancel')} onClick={onCancel}><ArrowLeft className="size-3.5" aria-hidden /></Button>
      <p id={`${idPrefix}-choose-title`} className="t-card-title min-w-0 truncate" title={draft.id ? m('tableGroupChangeTitle', { name: draft.name }) : undefined}>{draft.id ? m('tableGroupChangeTitle', { name: draft.name }) : m('tableGroupNew')}</p>
    </div>
    <ul className="max-h-80 space-y-2 overflow-y-auto">{columns.map(column => <li key={column.id} className="flex min-w-0 items-center gap-2">
      <Checkbox id={`${idPrefix}-${column.id}-choose`} aria-label={m('tableGroupSelect', { name: column.label })} aria-describedby={column.id.length > MAX_GROUP_ID_LENGTH ? `${idPrefix}-${column.id}-unavailable` : undefined} checked={draft.members.includes(column.id)} disabled={column.id.length > MAX_GROUP_ID_LENGTH || (!draft.members.includes(column.id) && draft.members.length >= MAX_GROUP_MEMBERS)} onCheckedChange={() => editor.toggle(column.id)} className="size-3.5 border-border-control" />
      <Label className="min-w-0 flex-1" title={column.label} htmlFor={`${idPrefix}-${column.id}-choose`}><span className="block truncate">{column.label}</span></Label>
      {column.hidden && <span className="text-xs text-text-muted">{m('tableGroupHidden')}</span>}
      {column.id.length > MAX_GROUP_ID_LENGTH && <span id={`${idPrefix}-${column.id}-unavailable`} className="text-xs text-text-muted">{m('tableGroupUnavailable')}</span>}
      {column.group && <span className="max-w-24 truncate text-xs text-text-muted" title={column.group}>{column.group}</span>}
    </li>)}</ul>
    <form className="space-y-2" onKeyDown={ime.onKeyDown} onCompositionStart={ime.onCompositionStart} onCompositionEnd={ime.onCompositionEnd} onSubmit={event => { event.preventDefault(); onSave(); }}>
      <p className="text-xs text-text-secondary">{m('tableGroupSelected', { count: draft.members.length })}{draft.members.length >= MAX_GROUP_MEMBERS && <> · <span>{m('tableGroupMemberLimit', { count: MAX_GROUP_MEMBERS })}</span></>}</p>
      <div className="flex min-w-0 items-center gap-2">
        <Input inputSize="toolbar" className="min-w-0 flex-1" aria-label={m('tableGroupName')} placeholder={m('tableGroupName')} maxLength={MAX_GROUP_LABEL_LENGTH} value={draft.name} onChange={event => editor.setName(event.target.value)} />
        <Button type="submit" size="toolbar" variant="secondary" disabled={!validGroupName(draft.name) || draft.members.length < (draft.id ? 1 : 2)}>{draft.id ? m('tableGroupSave') : m('tableGroupCreate')}</Button>
        <Button type="button" size="toolbar" variant="ghost" onClick={onCancel}>{m('tableGroupCancel')}</Button>
      </div>
    </form>
  </div>;
}

/** onSave(byKey): Enter hands focus back to the group's menu; a blur save keeps wherever the person moved focus. */
export function ColumnGroupRename({ name, onName, onSave, onCancel }: { name: string; onName: (name: string) => void; onSave: (byKey: boolean) => void; onCancel: () => void }) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const ime = useImeEnterGuard();
  return <Input autoFocus inputSize="toolbar" className="min-w-0 w-full" aria-label={m('tableGroupName')} maxLength={MAX_GROUP_LABEL_LENGTH} value={name} onChange={event => onName(event.target.value)} onBlur={() => onSave(false)}
    onCompositionStart={ime.onCompositionStart} onCompositionEnd={ime.onCompositionEnd}
    onKeyDown={event => {
      if (ime.isComposingEnter(event)) { event.preventDefault(); return; }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); }
      if (event.key === 'Enter') { event.preventDefault(); onSave(true); }
    }} />;
}
export function ColumnGroupRowMenu({ triggerId, name, onRename, onMembers, onUngroup }: { triggerId: string; name: string; onRename: () => void; onMembers: () => void; onUngroup: () => void }) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const editing = useRef(false);
  return <DropdownMenu modal={false}>
    <DropdownMenuTrigger asChild><Button id={triggerId} type="button" variant="ghost" size="icon-xs" className="shrink-0" aria-label={m('tableGroupMenu', { name })}><MoreHorizontal className="size-3.5" aria-hidden /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="break-keep" onCloseAutoFocus={event => { if (editing.current) { event.preventDefault(); editing.current = false; } }}>
      <DropdownMenuItem onSelect={() => { editing.current = true; onRename(); }}>{m('tableGroupRename')}</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => { editing.current = true; onMembers(); }}>{m('tableGroupMembers')}</DropdownMenuItem>
      {/* Ungroup removes this trigger; the table moves focus, so the menu must not return it. */}
      <DropdownMenuItem onSelect={() => { editing.current = true; onUngroup(); }}>{m('tableGroupUngroup')}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

const RESIZE_KEY_STEP = 20;
/** Lives with the table, outside clip boxes which may remount when the first width is set. */
export function useColumnGroupResize(identity: string, widthScale: number, onWidth: (id: string, width: number | undefined) => void) {
  const { session } = usePlatform();
  const { scopeId } = useQueryContext();
  const cleanup = useRef<(() => void) | null>(null);
  const focus = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (focus.current === null) return;
    document.getElementById(focus.current)?.focus();
    focus.current = null;
  });
  useEffect(() => () => { cleanup.current?.(); cleanup.current = null; }, [identity, session, scopeId]);
  const start = (event: ReactPointerEvent<HTMLElement>, id: string, initialWidth: number) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    cleanup.current?.();
    const startX = event.clientX;
    const pointerId = event.pointerId;
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      onWidth(id, Math.max(MIN_GROUP_WIDTH, (initialWidth + next.clientX - startX) / widthScale));
    };
    const end = (next: PointerEvent) => { if (next.pointerId === pointerId) { cleanup.current?.(); cleanup.current = null; } };
    cleanup.current = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  };
  return { start, setFromKeyboard: (id: string, width: number | undefined, controlId: string) => { focus.current = controlId; onWidth(id, width); } };
}
export function ColumnGroupResizer({ id, controlId, name, width, widthScale, resize, onWidth }: {
  id: string; controlId: string; name: string; width: number; widthScale: number;
  resize: ReturnType<typeof useColumnGroupResize>;
  onWidth: (id: string, width: number | undefined) => void;
}) {
  const m = useMessages(COMPONENTS_MESSAGES);
  return <span id={controlId} role="separator" tabIndex={0} aria-orientation="vertical" aria-label={m('tableGroupResize', { name })} aria-valuenow={Math.round(width)} aria-valuemin={MIN_GROUP_WIDTH * widthScale}
    data-column-resizer data-column-group-resizer className="group/resize absolute -right-4 inset-y-0 flex w-2 cursor-col-resize touch-none justify-end focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring"
    onPointerDown={event => resize.start(event, id, width)} onDoubleClick={event => { event.preventDefault(); onWidth(id, undefined); }}
    onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      resize.setFromKeyboard(id, event.key === 'Home' ? undefined : (width + (event.key === 'ArrowLeft' ? -RESIZE_KEY_STEP : RESIZE_KEY_STEP)) / widthScale, controlId);
    }}><span className="h-full w-px bg-border-subtle group-hover/resize:bg-accent-primary" /></span>;
}
