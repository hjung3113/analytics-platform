import type { Editor } from '@tiptap/core';
import { getExtensionsForSurface, type UIRichContentExtensionCapability } from './allowlist-local';
import type { RichEditorSurface } from './RichEditor';
export interface EditorAction { label: string; capability: UIRichContentExtensionCapability; run: (editor: Editor) => void }
const actions: EditorAction[] = [
  ...([1, 2, 3] as const).map(level => ({ label: `제목 ${level}`, capability: 'heading' as const, run: (e: Editor) => { e.chain().focus().toggleHeading({ level }).run(); } })),
  { label: '글머리 목록', capability: 'list', run: e => { e.chain().focus().toggleBulletList().run(); } },
  { label: '번호 목록', capability: 'list', run: e => { e.chain().focus().toggleOrderedList().run(); } },
  { label: '체크리스트', capability: 'taskList', run: e => { e.chain().focus().toggleTaskList().run(); } },
  { label: '표', capability: 'table', run: e => { e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); } },
  { label: '코드 블록', capability: 'codeBlock', run: e => { e.chain().focus().toggleCodeBlock({ language: 'javascript' }).run(); } },
  { label: '인용', capability: 'blockquote', run: e => { e.chain().focus().toggleBlockquote().run(); } },
  { label: '구분선', capability: 'horizontalRule', run: e => { e.chain().focus().setHorizontalRule().run(); } },
  { label: '접기', capability: 'details', run: e => { e.chain().focus().insertContent({ type: 'details', attrs: { open: true }, content: [{ type: 'detailsSummary', content: [{ type: 'text', text: '추가 확인 사항' }] }, { type: 'detailsContent', content: [{ type: 'paragraph' }] }] }).run(); } },
  { label: '목차', capability: 'tableOfContents', run: e => { e.chain().focus().insertContent({ type: 'tableOfContents' }).run(); } },
];
export function actionsForSurface(surface: RichEditorSurface): EditorAction[] {
  const capabilities = new Set(getExtensionsForSurface(surface));
  return actions.filter(action => capabilities.has(action.capability));
}
