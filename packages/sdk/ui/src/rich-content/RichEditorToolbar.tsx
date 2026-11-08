import type { Editor } from '@tiptap/core';
import { Bold, Italic, Underline, Strikethrough, Code, Highlighter, Palette, Plus, Link2, Undo2, TableCellsMerge, Rows3, Columns3, Trash2 } from 'lucide-react';
import * as React from 'react';
import { Button } from '../components/Button';
import { Input } from '../components/shadcn/input';
import { Popover, PopoverTrigger, PopoverContent } from '../components/shadcn/popover';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from '../components/shadcn/dropdown-menu';
import { getExtensionsForSurface, RICH_CONTENT_LANGUAGES, RICH_CONTENT_PALETTE, type UIRichContentExtensionCapability } from './allowlist-local';
import type { RichEditorSurface, RichEditorToolbarApi } from './RichEditor';
import { actionsForSurface } from './editor-actions';
import { AttachButton } from './toolbar/AttachButton';
import { IconHelp } from './toolbar/IconHelp';
export const formatActions = [
  { label: '굵게', capability: 'bold', mark: 'bold', Icon: Bold },
  { label: '기울임', capability: 'italic', mark: 'italic', Icon: Italic },
  { label: '밑줄', capability: 'underline', mark: 'underline', Icon: Underline },
  { label: '취소선', capability: 'strike', mark: 'strike', Icon: Strikethrough },
  { label: '인라인 코드', capability: 'code', mark: 'code', Icon: Code },
] as const;
export function FormatButtons({ editor, surface }: { editor: Editor; surface: RichEditorSurface }) {
  const capabilities = getExtensionsForSurface(surface);
  return <>{formatActions.filter(a => capabilities.includes(a.capability)).map(({ label, mark, Icon }) => <IconHelp key={mark} label={label}><Button type="button" variant="subtle" size="icon-xs" aria-label={label} aria-pressed={editor.isActive(mark)} disabled={!editor.isEditable} onClick={() => editor.chain().focus().toggleMark(mark).run()}><Icon className="size-4" /></Button></IconHelp>)}</>;
}
const paletteNames: Record<(typeof RICH_CONTENT_PALETTE)[number], string> = { default: '기본', info: '정보', success: '성공', warning: '주의', danger: '위험' };
export function RichEditorToolbar({ editor, surface, attach, onAttachError }: { editor: Editor; surface: RichEditorSurface; attach?: RichEditorToolbarApi['attach']; onAttachError?: (error: unknown) => void }) {
  const [href, setHref] = React.useState('');
  const [linkError, setLinkError] = React.useState(false);
  const linkErrorId = React.useId();
  const [, update] = React.useReducer(n => n + 1, 0);
  const [attachError, setAttachError] = React.useState(false);
  React.useEffect(() => { editor.on('transaction', update); return () => { editor.off('transaction', update); }; }, [editor]);
  const has = (capability: UIRichContentExtensionCapability) => getExtensionsForSurface(surface).includes(capability);
  return <div className="flex flex-wrap items-center gap-1 border-b border-border-subtle px-2 py-1 break-keep" role="toolbar" aria-label="본문 서식" data-rich-toolbar="">
    <FormatButtons editor={editor} surface={surface} />
    {([['highlight', '형광펜', Highlighter], ['color', '글자색', Palette]] as const).filter(([cap]) => has(cap)).map(([cap, label, Icon]) => <DropdownMenu key={cap}><IconHelp label={label}><DropdownMenuTrigger asChild><Button type="button" size="icon-xs" variant="subtle" aria-label={label} disabled={!editor.isEditable}><Icon className="size-4" /></Button></DropdownMenuTrigger></IconHelp><DropdownMenuContent align="end"><DropdownMenuGroup>{RICH_CONTENT_PALETTE.map(key => <DropdownMenuItem key={key} onSelect={() => editor.chain().focus().setMark(cap === 'color' ? 'textStyle' : 'highlight', { color: key }).run()}>{paletteNames[key]}</DropdownMenuItem>)}<DropdownMenuItem onSelect={() => editor.chain().focus().unsetMark(cap === 'color' ? 'textStyle' : 'highlight').run()}>지우기</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>)}
    <DropdownMenu><IconHelp label="블록 추가"><DropdownMenuTrigger asChild><Button type="button" size="icon-xs" variant="subtle" aria-label="블록 추가" disabled={!editor.isEditable}><Plus className="size-4" /></Button></DropdownMenuTrigger></IconHelp><DropdownMenuContent align="end"><DropdownMenuGroup>{actionsForSurface(surface).map(action => <DropdownMenuItem key={action.label} onSelect={() => action.run(editor)}>{action.label}</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
    {has('link') && <Popover onOpenChange={() => setLinkError(false)}><IconHelp label="링크"><PopoverTrigger asChild><Button type="button" size="icon-xs" variant="subtle" aria-label="링크" disabled={!editor.isEditable}><Link2 className="size-4" /></Button></PopoverTrigger></IconHelp><PopoverContent padding="compact" align="end"><div className="flex items-center gap-1"><Input inputSize="toolbar" aria-label="링크 주소" value={href} aria-invalid={linkError || undefined} aria-describedby={linkError ? linkErrorId : undefined} onChange={e => { setHref(e.target.value); setLinkError(false); }} /><Button type="button" size="toolbar" variant="subtle" onClick={() => { if (!/^https?:\/\//i.test(href)) { setLinkError(true); return; } setLinkError(false); editor.chain().focus().setLink({ href }).run(); }}>적용</Button><Button type="button" size="toolbar" variant="subtle" onClick={() => editor.chain().focus().unsetLink().run()}>해제</Button></div>{linkError && <p id={linkErrorId} role="alert" className="mt-1 text-xs text-text-danger-label break-keep">http:// 또는 https://로 시작하는 주소를 입력해 주세요.</p>}</PopoverContent></Popover>}
    <IconHelp label="실행 취소"><Button type="button" size="icon-xs" variant="subtle" aria-label="실행 취소" disabled={!editor.isEditable || !editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Undo2 className="size-4" /></Button></IconHelp>
    {attach && <AttachButton showTooltip data-testid="rich-toolbar-attach" disabled={!editor.isEditable} onPick={async file => { setAttachError(false); try { await attach(file); } catch (error) { setAttachError(true); onAttachError?.(error); } }} />}
    {attachError && <span role="alert" className="text-xs text-text-danger-label">첨부 파일을 올리지 못했습니다. 다시 시도해 주세요.</span>}
    {has('table') && editor.isActive('table') && <div className="flex w-full flex-wrap items-center gap-1 border-t border-border-subtle pt-1" role="toolbar" aria-label="표 편집">
      {([
        ['칸 병합 / 나누기', TableCellsMerge, () => editor.chain().focus().mergeOrSplit().run()],
        ['머리 행', Rows3, () => editor.chain().focus().toggleHeaderRow().run()],
        ['열 추가', Columns3, () => editor.chain().focus().addColumnAfter().run()],
        ['행 추가', Rows3, () => editor.chain().focus().addRowAfter().run()],
        ['열 삭제', Trash2, () => editor.chain().focus().deleteColumn().run()],
        ['행 삭제', Trash2, () => editor.chain().focus().deleteRow().run()],
        ['표 삭제', Trash2, () => editor.chain().focus().deleteTable().run()],
      ] as const).map(([label, Icon, run]) => <IconHelp key={label} label={label}><Button type="button" size="icon-xs" variant="subtle" aria-label={label} disabled={!editor.isEditable} onClick={run}><Icon className="size-4" /></Button></IconHelp>)}
    </div>}
    {has('codeBlock') && editor.isActive('codeBlock') && <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" size="toolbar" variant="subtle" disabled={!editor.isEditable} aria-label="코드 언어">{editor.getAttributes('codeBlock').language ?? '일반 텍스트'}</Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuGroup>{RICH_CONTENT_LANGUAGES.map(language => <DropdownMenuItem key={language} onSelect={() => editor.chain().focus().updateAttributes('codeBlock', { language }).run()}>{language}</DropdownMenuItem>)}<DropdownMenuItem onSelect={() => editor.chain().focus().updateAttributes('codeBlock', { language: null }).run()}>일반 텍스트</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>}
  </div>;
}
