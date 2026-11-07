import type { Editor } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { BubbleMenu } from '@tiptap/react/menus';
import DragHandle from '@tiptap/extension-drag-handle-react';
import { GripVertical } from 'lucide-react';
import * as React from 'react';
import { Button } from '../components/Button';
import type { RichEditorSurface } from './RichEditor';
import { actionsForSurface, type EditorAction } from './editor-actions';
import { FormatButtons } from './RichEditorToolbar';
import { richContentOutline } from './outline';
import { getExtensionsForSurface } from './allowlist-local';
const slashKey = new PluginKey('richContentSlash');
interface MenuState { items: EditorAction[]; index: number; apply: (action: EditorAction) => void }
export function EditorExtras({ editor, surface }: { editor: Editor; surface: RichEditorSurface }) {
  const [menu, setMenu] = React.useState<MenuState | null>(null);
  const [, update] = React.useReducer(n => n + 1, 0);
  const capabilities = getExtensionsForSurface(surface);
  React.useEffect(() => {
    editor.on('transaction', update);
    const actions = actionsForSurface(surface);
    if (!actions.length) return () => { editor.off('transaction', update); };
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
    }));
    return () => { editor.off('transaction', update); editor.unregisterPlugin(slashKey); };
  }, [editor, surface]);
  const outline = capabilities.includes('tableOfContents') ? richContentOutline(editor.getJSON()) : [];
  return <>
    {outline.length > 0 && <details className="border-b border-border-subtle p-3 text-xs break-keep"><summary>목차</summary><div className="flex flex-col items-start gap-1">{outline.map((entry, index) => <Button type="button" key={entry.id} size="toolbar" variant="subtle" onClick={() => editor.view.dom.querySelectorAll('h1,h2,h3')[index]?.scrollIntoView({ block: 'center' })}>{entry.text}</Button>)}</div></details>}
    {editor.isEditable && actionsForSurface(surface).length > 0 && <DragHandle editor={editor}><Button type="button" variant="subtle" size="icon-xs" aria-label="블록 끌어 옮기기"><GripVertical className="size-4" /></Button></DragHandle>}
    {editor.isEditable && <BubbleMenu editor={editor}><div className="flex gap-1 rounded-md border border-border-subtle bg-surface-popover p-1 shadow-md" role="toolbar" aria-label="선택 서식"><FormatButtons editor={editor} surface={surface} /></div></BubbleMenu>}
    {menu && editor.isEditable && <div className="sticky bottom-1 flex flex-col rounded-md border border-border-subtle bg-surface-popover p-1 shadow-md break-keep" role="listbox" aria-label="블록 추가">{menu.items.map((action, index) => <Button type="button" key={action.label} role="option" aria-selected={index === menu.index} size="toolbar" variant={index === menu.index ? 'outline' : 'subtle'} onMouseDown={event => event.preventDefault()} onClick={() => menu.apply(action)}>{action.label}</Button>)}</div>}
  </>;
}
