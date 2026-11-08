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

/** Selection owns visibility, rather than editor focus. A portalled menu therefore cannot detach its own anchor. */
export function EditorContextBars({ editor }: { editor: Editor }) {
  const marker = React.useRef<HTMLDivElement>(null);
  const bar = React.useRef<HTMLDivElement>(null);
  const roving = useToolbarRovingFocus(bar);
  const [placement, setPlacement] = React.useState<{ type: 'table' | 'codeBlock'; top: number; left: number } | null>(null);
  const [, update] = React.useReducer(n => n + 1, 0);
  const [codeOpen, setCodeOpen] = React.useState(false);
  React.useEffect(() => { editor.on('transaction', update); editor.on('update', update); return () => { editor.off('transaction', update); editor.off('update', update); }; }, [editor]);
  const type = editor.isEditable ? editor.isActive('table') ? 'table' : editor.isActive('codeBlock') ? 'codeBlock' : null : null;
  React.useLayoutEffect(() => {
    if (!type) { setPlacement(null); return; }
    const block = selectedBlock(editor, type);
    const origin = marker.current;
    if (!block || !origin) { setPlacement(null); return; }
    // compat.css always reserves a strip inside editable blocks, so the bar never covers text and selecting never shifts layout.
    // Never write attributes on these nodes: mutating a code block's PRE makes ProseMirror replace the node being measured.
    const anchor = type === 'table' ? block.closest<HTMLElement>('.tableWrapper') ?? block : block;
    const position = () => {
      const rect = anchor.getBoundingClientRect(); const bounds = origin.getBoundingClientRect();
      const barWidth = bar.current?.getBoundingClientRect().width ?? 0;
      const proposed = type === 'table' ? rect.left - bounds.left : rect.right - bounds.left - barWidth;
      setPlacement({ type, top: rect.top - bounds.top, left: Math.max(0, Math.min(proposed, bounds.width - barWidth)) });
    };
    position();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position);
    observer?.observe(anchor); observer?.observe(origin);
    if (bar.current) observer?.observe(bar.current);
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    return () => { observer?.disconnect(); window.removeEventListener('resize', position); document.removeEventListener('scroll', position, true); };
  }, [editor, type, editor.state.selection.from, editor.state.doc]);
  const actions = type === 'table' ? [
    ['위에 행 추가', BetweenHorizontalStart, () => editor.chain().focus().addRowBefore().run(), editor.can().addRowBefore()],
    ['아래에 행 추가', BetweenHorizontalEnd, () => editor.chain().focus().addRowAfter().run(), editor.can().addRowAfter()],
    ['왼쪽에 열 추가', BetweenVerticalStart, () => editor.chain().focus().addColumnBefore().run(), editor.can().addColumnBefore()],
    ['오른쪽에 열 추가', BetweenVerticalEnd, () => editor.chain().focus().addColumnAfter().run(), editor.can().addColumnAfter()],
    ['행 삭제', TableRowsSplit, () => editor.chain().focus().deleteRow().run(), editor.can().deleteRow()],
    ['열 삭제', TableColumnsSplit, () => editor.chain().focus().deleteColumn().run(), editor.can().deleteColumn()],
    ['머리 행', TableProperties, () => editor.chain().focus().toggleHeaderRow().run(), editor.can().toggleHeaderRow()],
    ['칸 병합 / 나누기', TableCellsMerge, () => editor.chain().focus().mergeOrSplit().run(), editor.can().mergeOrSplit()],
    ['표 삭제', Trash2, () => editor.chain().focus().deleteTable().run(), editor.can().deleteTable()],
  ] as const : [];
  return <div ref={marker} className="relative z-5">
    {placement && <div ref={bar} {...roving} data-context-placement={placement.type === 'table' ? 'top-start' : 'top-end'} className="absolute top-(--rich-context-top) left-(--rich-context-left) max-w-full rounded-md border border-border-subtle bg-surface-popover p-1 shadow-md break-keep" style={{ '--rich-context-top': `${placement.top}px`, '--rich-context-left': `${placement.left}px` } as React.CSSProperties}>
      {placement.type === 'table' ? <div role="toolbar" aria-label="표 편집" className="-m-1 flex flex-nowrap items-center gap-1 overflow-x-auto p-1">{actions.map(([label, Icon, run, allowed]) => <IconHelp key={label} label={label}><Button type="button" size="icon-xs" variant="ghost" aria-label={label} disabled={!allowed} onClick={run}><Icon className="size-4" /></Button></IconHelp>)}</div>
        : <DropdownMenu open={codeOpen} onOpenChange={setCodeOpen}><DropdownMenuTrigger asChild><Button type="button" size="toolbar" variant="ghost" aria-label="코드 언어">{editor.getAttributes('codeBlock').language ?? '일반 텍스트'}<ChevronDown className="size-3" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value={editor.getAttributes('codeBlock').language ?? ''} onValueChange={language => { editor.chain().focus().updateAttributes('codeBlock', { language: language || null }).run(); }}>{RICH_CONTENT_LANGUAGES.map(language => <DropdownMenuRadioItem key={language} value={language}>{language}</DropdownMenuRadioItem>)}<DropdownMenuRadioItem value="">일반 텍스트</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>}
    </div>}
  </div>;
}
