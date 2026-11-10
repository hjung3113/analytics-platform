import type { ReactNode } from 'react';
import { useI18n } from '@ap/kernel';
import { Plus, Redo2, RotateCcw, RotateCw, Undo2 } from 'lucide-react';
import { PRIMITIVE_CATALOG } from '@eqv/renderer';
import { Button, Checkbox, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tooltip, TooltipContent, TooltipTrigger } from '@ap/ui';

function IconAction({ label, icon, onClick, disabled = false, describedBy }: { label: string; icon: ReactNode; onClick(): void; disabled?: boolean; describedBy?: string }) {
  return <Tooltip><TooltipTrigger asChild><span className="inline-flex shrink-0">
    <Button size="icon-sm" variant="ghost" aria-label={label} aria-describedby={describedBy} disabled={disabled} onClick={onClick}>{icon}</Button>
  </span></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

export interface ToolbarProps {
  modeText: ReactNode;
  /** Present only in a Revision or EV Template view. */
  onReturnToDraft?: () => void;
  /** Edit tools render only while the open document is an editable draft. */
  tools: null | {
    canUndo: boolean; canRedo: boolean; hasSelection: boolean; snap: boolean; primitive: string; disabled: boolean;
    undoReason: boolean; redoReason: boolean; selectionReason: boolean;
    onUndo(): void; onRedo(): void; onRotate(degrees: number): void; onSnap(value: boolean): void; onPrimitive(name: string): void; onAdd(): void;
  };
  count: number | null;
  loading: boolean;
}

export const ROTATE_STEP = 15;

/** The `h-11` tool row above the canvas. */
export function Toolbar({ modeText, onReturnToDraft, tools, count, loading }: ToolbarProps) {
  const { t } = useI18n();
  return <div className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto whitespace-nowrap border-b border-border-subtle bg-surface-card px-3" aria-label="편집 도구" role="toolbar">
    <span className="mr-2 shrink-0 text-xs text-text-secondary">{modeText}</span>
    {onReturnToDraft && <Button size="toolbar" variant="secondary" onClick={onReturnToDraft}>초안으로 돌아가기</Button>}
    {tools && <>
      <IconAction label="실행 취소 · Ctrl/Cmd+Z" icon={<Undo2 className="size-4" aria-hidden />} disabled={tools.disabled || !tools.canUndo} describedBy={tools.undoReason ? 'undo-reason' : undefined} onClick={tools.onUndo} />
      <IconAction label="다시 실행 · Ctrl/Cmd+Shift+Z" icon={<Redo2 className="size-4" aria-hidden />} disabled={tools.disabled || !tools.canRedo} describedBy={tools.redoReason ? 'redo-reason' : undefined} onClick={tools.onRedo} />
      <IconAction label="왼쪽으로 15° 회전 · [" icon={<RotateCcw className="size-4" aria-hidden />} disabled={tools.disabled || !tools.hasSelection} describedBy={tools.selectionReason ? 'selection-reason' : undefined} onClick={() => tools.onRotate(-ROTATE_STEP)} />
      <IconAction label="오른쪽으로 15° 회전 · ]" icon={<RotateCw className="size-4" aria-hidden />} disabled={tools.disabled || !tools.hasSelection} describedBy={tools.selectionReason ? 'selection-reason' : undefined} onClick={() => tools.onRotate(ROTATE_STEP)} />
      <div className="mx-1 flex shrink-0 items-center gap-1.5"><Checkbox id="layout-snap" checked={tools.snap} disabled={tools.disabled} onCheckedChange={value => tools.onSnap(value === true)} /><Label htmlFor="layout-snap">격자 맞춤</Label></div>
      <div className="w-28"><Select value={tools.primitive} disabled={tools.disabled} onValueChange={tools.onPrimitive}>
        <SelectTrigger density="compact" aria-label="추가할 Component 종류"><SelectValue /></SelectTrigger>
        <SelectContent>{PRIMITIVE_CATALOG.map(p => <SelectItem value={p.name} key={p.name}>{p.name}</SelectItem>)}</SelectContent></Select></div>
      <IconAction label="Component 추가" icon={<Plus className="size-4" aria-hidden />} disabled={tools.disabled} onClick={tools.onAdd} />
    </>}
    <span className="ml-auto shrink-0 text-xs text-text-muted">{loading ? <span role="status">{t('loading')}</span> : `${count ?? '—'} Components`}</span>
  </div>;
}
