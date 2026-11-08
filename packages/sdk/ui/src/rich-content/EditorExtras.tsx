import type { Editor } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { BubbleMenu } from '@tiptap/react/menus';
import DragHandle from '@tiptap/extension-drag-handle-react';
import { GripVertical, Plus } from 'lucide-react';
import * as React from 'react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from '../components/shadcn/dropdown-menu';
import { IconHelp } from './toolbar/IconHelp';
import { EditorContextBars } from './EditorContextBars';
import { Button } from '../components/Button';
import type { RichEditorSurface } from './RichEditor';
import { actionsForSurface, type EditorAction } from './editor-actions';
import { FormatButtons } from './RichEditorToolbar';
import { richContentOutline } from './outline';
import { getExtensionsForSurface } from './allowlist-local';
const slashKey = new PluginKey('richContentSlash');
const bubbleOptions = { placement: 'bottom', flip: false } as const;
interface MenuState { items: EditorAction[]; index: number; apply: (action: EditorAction) => void }
export interface SlashMenuAssociation { id: string; activeId: string }
export function EditorExtras({ editor, surface, onMenuChange }: { editor: Editor; surface: RichEditorSurface; onMenuChange: (menu: SlashMenuAssociation | null) => void }) {
  const [menu, setMenu] = React.useState<MenuState | null>(null);
  const menuId = React.useId();
  const blockPosition = React.useRef(-1);
  const rememberBlock = React.useCallback(({ pos }: { pos: number }) => { blockPosition.current = pos; }, []);
  const slashElement = React.useRef<HTMLDivElement>(null);
  const [slashPosition, setSlashPosition] = React.useState({ top: 0, left: 0 });
  React.useLayoutEffect(() => {
    if (!menu) return;
    const position = () => {
      const rect = editor.view.coordsAtPos(editor.state.selection.from);
      const height = slashElement.current?.getBoundingClientRect().height || 280;
      const width = slashElement.current?.getBoundingClientRect().width || 200;
      setSlashPosition({ top: Math.max(4, Math.min(rect.bottom + 4, window.innerHeight - height - 4)), left: Math.max(4, Math.min(rect.left, window.innerWidth - width - 4)) });
    };
    position(); window.addEventListener('resize', position); document.addEventListener('scroll', position, true);
    return () => { window.removeEventListener('resize', position); document.removeEventListener('scroll', position, true); };
  }, [editor, menu]);
  const [, update] = React.useReducer(n => n + 1, 0);
  const capabilities = getExtensionsForSurface(surface);
  const editable = editor.isEditable;
  React.useEffect(() => {
    onMenuChange(menu && editable ? { id: menuId, activeId: `${menuId}-${menu.index}` } : null);
  }, [menu, editable, menuId, onMenuChange]);
  React.useEffect(() => () => onMenuChange(null), [onMenuChange]);
  React.useEffect(() => {
    // `setEditable` (the `disabled` prop) emits `update` without a transaction; re-render so the slash-menu association drops with editing.
    editor.on('transaction', update); editor.on('update', update);
    const actions = actionsForSurface(surface);
    if (!actions.length) return () => { editor.off('transaction', update); editor.off('update', update); };
    editor.registerPlugin(Suggestion<EditorAction>({ editor, pluginKey: slashKey, char: '/',
      allow: () => editor.isEditable,
      items: ({ query }) => actions.filter(action => action.label.includes(query)),
      command: ({ editor: live, range, props }) => { live.chain().focus().deleteRange(range).run(); props.run(live); },
      render: () => {
        let items: EditorAction[] = []; let apply = (_action: EditorAction) => {}; let index = 0;
        const refresh = (props: { items: EditorAction[]; command: (action: EditorAction) => void }) => {
          items = props.items; apply = props.command; index = 0; setMenu(items.length ? { items, index, apply } : null);
        };
        return { onStart: refresh, onUpdate: refresh, onExit: () => setMenu(null), onKeyDown: ({ event }) => {
          if (event.isComposing || editor.view.composing) return false;
          if (event.key === 'Escape') { setMenu(null); return true; }
          if (!items.length) return false;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { index = (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; setMenu({ items, index, apply }); return true; }
          const action = items[index];
          if (event.key === 'Enter' && action) { apply(action); return true; }
          return false;
        } };
      },
    }), (plugin, plugins) => [plugin, ...plugins]); // before the keymap, or Enter splits the block instead of running the command
    return () => { editor.off('transaction', update); editor.off('update', update); editor.unregisterPlugin(slashKey); };
  }, [editor, surface]);
  // The stacked controls are taller than a one-line block. Without this lock the lower one re-anchors to the next block under the pointer.
  const blockMenuOpen = React.useRef(false);
  const unlockBlockHandle = React.useCallback(() => { editor.commands.setMeta('lockDragHandle', false); }, [editor]); // stable: a new prop identity re-registers the plugin and dismisses an open slash menu
  const outline = capabilities.includes('tableOfContents') ? richContentOutline(editor.getJSON()) : [];
  return <>
    {outline.length > 0 && <details className="border-b border-border-subtle p-3 text-xs break-keep"><summary>목차</summary><div className="flex flex-col items-start gap-1">{outline.map((entry, index) => <Button type="button" key={entry.id} size="toolbar" variant="subtle" onClick={() => editor.view.dom.querySelectorAll('h1,h2,h3')[index]?.scrollIntoView({ block: 'center' })}>{entry.text}</Button>)}</div></details>}
    {editor.isEditable && actionsForSurface(surface).length > 0 && <DragHandle editor={editor} onNodeChange={rememberBlock} onElementDragEnd={unlockBlockHandle}><div className="flex flex-col items-center" onMouseEnter={() => { editor.commands.setMeta('lockDragHandle', true); }} onMouseLeave={() => { if (!blockMenuOpen.current) editor.commands.setMeta('lockDragHandle', false); }}><DropdownMenu onOpenChange={open => { blockMenuOpen.current = open; editor.commands.setMeta('lockDragHandle', open); }}><IconHelp label="블록 추가"><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-xs" aria-label="블록 추가"><Plus className="size-4" /></Button></DropdownMenuTrigger></IconHelp><DropdownMenuContent align="start"><DropdownMenuGroup>{actionsForSurface(surface).map(action => <DropdownMenuItem key={action.label} onSelect={() => {
      const pos = blockPosition.current;
      const node = pos >= 0 ? editor.state.doc.nodeAt(pos) : null;
      if (!node) return;
      editor.chain().focus().setTextSelection(pos + 1).run();
      action.run(editor);
    }}>{action.label}</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu><Button type="button" variant="subtle" size="icon-xs" aria-label="블록 끌어 옮기기"><GripVertical className="size-4" /></Button></div></DragHandle>}
    {editor.isEditable && <BubbleMenu editor={editor} options={bubbleOptions}><div className="flex gap-1 rounded-md border border-border-subtle bg-surface-popover p-1 shadow-md" role="toolbar" aria-label="선택 서식"><FormatButtons editor={editor} surface={surface} /></div></BubbleMenu>}
    <EditorContextBars editor={editor} />
    {menu && editor.isEditable && <div ref={slashElement} style={{ '--rich-slash-top': `${slashPosition.top}px`, '--rich-slash-left': `${slashPosition.left}px` } as React.CSSProperties} id={menuId} className="fixed top-(--rich-slash-top) left-(--rich-slash-left) z-50 max-h-72 overflow-y-auto flex flex-col rounded-md border border-border-subtle bg-surface-popover p-1 shadow-md break-keep" role="listbox" aria-label="블록 추가">{menu.items.map((action, index) => <Button type="button" key={action.label} id={`${menuId}-${index}`} role="option" tabIndex={-1} aria-selected={index === menu.index} size="toolbar" variant={index === menu.index ? 'outline' : 'subtle'} onMouseDown={event => event.preventDefault()} onClick={() => menu.apply(action)}>{action.label}</Button>)}</div>}
  </>;
}
