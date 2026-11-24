import type { Editor } from '@tiptap/core';
import * as React from 'react';
import { BetweenHorizontalStart, BetweenHorizontalEnd, BetweenVerticalStart, BetweenVerticalEnd, TableCellsMerge, TableColumnsSplit, TableProperties, TableRowsSplit, Trash2, ChevronDown } from 'lucide-react';
import { Button } from '../components/Button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '../components/shadcn/dropdown-menu';
import { RICH_CONTENT_LANGUAGES } from './allowlist-local';
import { IconHelp } from './toolbar/IconHelp';
import { useToolbarRovingFocus } from './toolbar/useToolbarRovingFocus';

function selectedBlock(editor: Editor, type: 'table' | 'codeBlock'): HTMLElement | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name !== type) continue;
    const node = editor.view.nodeDOM($from.before(depth));
    if (!(node instanceof HTMLElement)) return null;
    return type === 'table' ? node.querySelector('table') ?? node : node;
  }
  return null;
}

type Placement = { type: 'table' | 'codeBlock'; top: number; left: number };

/** Selection owns visibility, rather than editor focus. A portalled menu therefore cannot detach its own anchor. */
export function EditorContextBars({ editor }: { editor: Editor }) {
  const marker = React.useRef<HTMLDivElement>(null);
  const bar = React.useRef<HTMLDivElement>(null);
  const roving = useToolbarRovingFocus(bar);
  const [placement, setPlacement] = React.useState<Placement | null>(null);
  const [, update] = React.useReducer(n => n + 1, 0);
  const [codeOpen, setCodeOpen] = React.useState(false);
  React.useEffect(() => { editor.on('transaction', update); editor.on('update', update); return () => { editor.off('transaction', update); editor.off('update', update); }; }, [editor]);
  const type = editor.isEditable ? editor.isActive('table') ? 'table' : editor.isActive('codeBlock') ? 'codeBlock' : null : null;
  // Listeners follow the watched elements (block, marker, bar), not the document: a transaction only re-measures, so typing in a table
  // neither resubscribes the ResizeObserver nor replays its first callback (#2814).
  const watch = React.useRef<{ anchor: HTMLElement; origin: HTMLElement; bar: HTMLElement | null; type: 'table' | 'codeBlock'; position: () => void; stop: () => void } | null>(null);
  // The placement last set, so an unchanged measure sets nothing and adds no render.
  const placed = React.useRef(placement);
  const shown = placement !== null;
  React.useLayoutEffect(() => {
    const block = type ? selectedBlock(editor, type) : null;
    const origin = marker.current;
    if (!type || !block || !origin) { watch.current?.stop(); watch.current = null; placed.current = null; setPlacement(null); return; }
    // compat.css always reserves a strip inside editable blocks, so the bar never covers text and selecting never shifts layout.
    // Never write attributes on these nodes: mutating a code block's PRE makes ProseMirror replace the node being measured.
    const anchor = type === 'table' ? block.closest<HTMLElement>('.tableWrapper') ?? block : block;
    const current = watch.current;
    if (current && current.anchor === anchor && current.origin === origin && current.bar === bar.current && current.type === type) { current.position(); return; }
    current?.stop();
    const position = () => {
      const rect = anchor.getBoundingClientRect(); const bounds = origin.getBoundingClientRect();
      const barWidth = bar.current?.getBoundingClientRect().width ?? 0;
      const proposed = type === 'table' ? rect.left - bounds.left : rect.right - bounds.left - barWidth;
      const next: Placement = { type, top: rect.top - bounds.top, left: Math.max(0, Math.min(proposed, bounds.width - barWidth)) };
      const previous = placed.current;
      if (previous?.type === next.type && previous.top === next.top && previous.left === next.left) return;
      placed.current = next;
      setPlacement(next);
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position);
    observer?.observe(anchor); observer?.observe(origin);
    if (bar.current) observer?.observe(bar.current);
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    watch.current = { anchor, origin, bar: bar.current, type, position, stop: () => { observer?.disconnect(); window.removeEventListener('resize', position); document.removeEventListener('scroll', position, true); } };
    position();
  // `editor.state` re-runs the measure on every transaction; `shown` lets the bar element join the watch once it is rendered.
  }, [editor, type, editor.state, shown]);
  React.useLayoutEffect(() => () => { watch.current?.stop(); watch.current = null; }, []);
  // The nine `can()` checks once per editor state, not on every render of the bar (#2814).
  const allowed = React.useMemo(() => type === 'table' ? {
    addRowBefore: editor.can().addRowBefore(), addRowAfter: editor.can().addRowAfter(), addColumnBefore: editor.can().addColumnBefore(),
    addColumnAfter: editor.can().addColumnAfter(), deleteRow: editor.can().deleteRow(), deleteColumn: editor.can().deleteColumn(),
    toggleHeaderRow: editor.can().toggleHeaderRow(), mergeOrSplit: editor.can().mergeOrSplit(), deleteTable: editor.can().deleteTable(),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `editor.state` is what every `can()` reads
  } : null, [editor, type, editor.state]);
  const actions = type === 'table' && allowed ? [
    ['위에 행 추가', BetweenHorizontalStart, () => editor.chain().focus().addRowBefore().run(), allowed.addRowBefore],
    ['아래에 행 추가', BetweenHorizontalEnd, () => editor.chain().focus().addRowAfter().run(), allowed.addRowAfter],
    ['왼쪽에 열 추가', BetweenVerticalStart, () => editor.chain().focus().addColumnBefore().run(), allowed.addColumnBefore],
    ['오른쪽에 열 추가', BetweenVerticalEnd, () => editor.chain().focus().addColumnAfter().run(), allowed.addColumnAfter],
    ['행 삭제', TableRowsSplit, () => editor.chain().focus().deleteRow().run(), allowed.deleteRow],
    ['열 삭제', TableColumnsSplit, () => editor.chain().focus().deleteColumn().run(), allowed.deleteColumn],
    ['머리 행', TableProperties, () => editor.chain().focus().toggleHeaderRow().run(), allowed.toggleHeaderRow],
    ['칸 병합 / 나누기', TableCellsMerge, () => editor.chain().focus().mergeOrSplit().run(), allowed.mergeOrSplit],
    ['표 삭제', Trash2, () => editor.chain().focus().deleteTable().run(), allowed.deleteTable],
  ] as const : [];
  return <div ref={marker} className="relative z-5">
    {placement && <div ref={bar} {...roving} data-context-placement={placement.type === 'table' ? 'top-start' : 'top-end'} className="absolute top-(--rich-context-top) left-(--rich-context-left) max-w-full rounded-md border border-border-subtle bg-surface-popover p-1 shadow-md break-keep" style={{ '--rich-context-top': `${placement.top}px`, '--rich-context-left': `${placement.left}px` } as React.CSSProperties}>
      {placement.type === 'table' ? <div role="toolbar" aria-label="표 편집" className="-m-1 flex flex-nowrap items-center gap-1 overflow-x-auto p-1">{actions.map(([label, Icon, run, allowed]) => <IconHelp key={label} label={label}><Button type="button" size="icon-xs" variant="ghost" aria-label={label} disabled={!allowed} onClick={run}><Icon className="size-4" /></Button></IconHelp>)}</div>
        : <DropdownMenu open={codeOpen} onOpenChange={setCodeOpen}><DropdownMenuTrigger asChild><Button type="button" size="toolbar" variant="ghost" aria-label="코드 언어">{editor.getAttributes('codeBlock').language ?? '일반 텍스트'}<ChevronDown className="size-3" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value={editor.getAttributes('codeBlock').language ?? ''} onValueChange={language => { editor.chain().focus().updateAttributes('codeBlock', { language: language || null }).run(); }}>{RICH_CONTENT_LANGUAGES.map(language => <DropdownMenuRadioItem key={language} value={language}>{language}</DropdownMenuRadioItem>)}<DropdownMenuRadioItem value="">일반 텍스트</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>}
    </div>}
  </div>;
}
