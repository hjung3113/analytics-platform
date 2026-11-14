import type { Editor } from '@tiptap/core';
import { Bold, Italic, Underline, Strikethrough, Code, Highlighter, Palette, Link2, Undo2, Redo2, List, ListOrdered, ListTodo, Quote, CodeXml, Minus, Table2, SquareChevronRight, TableOfContents, AtSign, ChevronDown } from 'lucide-react';
import * as React from 'react';
import { Button } from '../components/Button';
import { Input } from '../components/shadcn/input';
import { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from '../components/shadcn/popover';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '../components/shadcn/dropdown-menu';
import { getExtensionsForSurface, RICH_CONTENT_PALETTE, type UIRichContentExtensionCapability } from './allowlist-local';
import type { RichEditorSurface, RichEditorToolbarApi } from './RichEditor';
import { actionsForSurface } from './editor-actions';
import { isValidWriteHref } from './sanitizeClient';
import { AttachButton } from './toolbar/AttachButton';
import { IconHelp } from './toolbar/IconHelp';
import { useToolbarRovingFocus } from './toolbar/useToolbarRovingFocus';
import { ToolbarRow, type ToolbarControl, type ToolbarAfterClose } from './toolbar/ToolbarRow';
export const formatActions = [
  { label: '굵게', capability: 'bold', mark: 'bold', Icon: Bold },
  { label: '기울임', capability: 'italic', mark: 'italic', Icon: Italic },
  { label: '밑줄', capability: 'underline', mark: 'underline', Icon: Underline },
  { label: '취소선', capability: 'strike', mark: 'strike', Icon: Strikethrough },
  { label: '인라인 코드', capability: 'code', mark: 'code', Icon: Code },
] as const;
export function FormatButtons({ editor, surface }: { editor: Editor; surface: RichEditorSurface }) {
  const capabilities = getExtensionsForSurface(surface);
  return <>{formatActions.filter(a => capabilities.includes(a.capability)).map(({ label, mark, Icon }) => <IconHelp key={mark} label={label}><Button type="button" variant={editor.isActive(mark) ? 'secondary' : 'ghost'} size="icon-xs" aria-label={label} aria-pressed={editor.isActive(mark)} disabled={!editor.isEditable} onClick={() => editor.chain().focus().toggleMark(mark).run()}><Icon className="size-4" /></Button></IconHelp>)}</>;
}
const paletteNames: Record<(typeof RICH_CONTENT_PALETTE)[number], string> = { default: '기본', info: '정보', success: '성공', warning: '주의', danger: '위험' };
const inserts = [
  ['글머리 목록', List, 'bulletList', 0], ['번호 목록', ListOrdered, 'orderedList', 0], ['체크리스트', ListTodo, 'taskList', 0],
  ['인용', Quote, 'blockquote', 1], ['코드 블록', CodeXml, 'codeBlock', 1], ['구분선', Minus, 'horizontalRule', 1],
  ['표', Table2, 'table', 2], ['접기', SquareChevronRight, 'details', 2], ['목차', TableOfContents, 'tableOfContents', 2],
] as const;
export function RichEditorToolbar({ editor, surface, attach, onAttachError, stickyOffset }: { editor: Editor; surface: RichEditorSurface; attach?: RichEditorToolbarApi['attach']; onAttachError?: (error: unknown) => void; stickyOffset?: string | number | undefined }) {
  const root = React.useRef<HTMLDivElement>(null);
  const roving = useToolbarRovingFocus(root, '[data-toolbar-visible="true"] button:not(:disabled)');
  const [href, setHref] = React.useState('');
  const [linkAnchor, setLinkAnchor] = React.useState<HTMLButtonElement | null>(null);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkError, setLinkError] = React.useState(false);
  const linkErrorId = React.useId();
  const [, update] = React.useReducer(n => n + 1, 0);
  const [attachError, setAttachError] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const picking = React.useRef(false);
  React.useEffect(() => { editor.on('transaction', update); editor.on('update', update); return () => { editor.off('transaction', update); editor.off('update', update); }; }, [editor]);
  const has = (capability: UIRichContentExtensionCapability) => getExtensionsForSurface(surface).includes(capability);
  const disabled = !editor.isEditable;
  const icon = (id: string, label: string, Icon: typeof Bold, run: () => void, group: number, pressed?: boolean, unavailable = false, help = label): ToolbarControl => ({ id, group,
    control: <IconHelp label={help}><Button type="button" variant={pressed ? 'secondary' : 'ghost'} size="icon-xs" aria-label={label} aria-pressed={pressed} disabled={disabled || unavailable} onClick={run}><Icon className="size-4" /></Button></IconHelp>,
    overflow: pressed === undefined ? <DropdownMenuItem inset disabled={disabled || unavailable} onSelect={run}>{label}</DropdownMenuItem> : <DropdownMenuCheckboxItem checked={pressed} disabled={disabled || unavailable} onSelect={run}>{label}</DropdownMenuCheckboxItem>,
  });
  const row1: ToolbarControl[] = [];
  const row2: ToolbarControl[] = [];
  if (has('heading')) {
    const current = editor.isActive('heading') ? String(editor.getAttributes('heading').level) : '0';
    const choices = (afterClose?: ToolbarAfterClose) => <DropdownMenuRadioGroup value={current} onValueChange={value => { const run = () => { const level = Number(value) as 0 | 1 | 2 | 3; if (level === 0) editor.chain().focus().setParagraph().run(); else editor.chain().focus().setHeading({ level }).run(); }; if (afterClose) afterClose(run); else run(); }}>{([0, 1, 2, 3] as const).map(level => <DropdownMenuRadioItem key={level} value={String(level)} disabled={disabled}>{level === 0 ? '본문' : `제목 ${level}`}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>;
    row1.push({ id: 'heading', group: 0, control: <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="toolbar" className="min-w-20" aria-label="본문 스타일" disabled={disabled}>{current === '0' ? '본문' : `제목 ${current}`}<ChevronDown className="size-3" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start">{choices()}</DropdownMenuContent></DropdownMenu>, overflow: afterClose => <DropdownMenuSub><DropdownMenuSubTrigger inset disabled={disabled}>본문 스타일</DropdownMenuSubTrigger><DropdownMenuSubContent>{choices(afterClose)}</DropdownMenuSubContent></DropdownMenuSub> });
  }
  formatActions.filter(action => has(action.capability)).forEach(({ label, mark, Icon }) => row1.push(icon(mark, label, Icon, () => { editor.chain().focus().toggleMark(mark).run(); }, 1, editor.isActive(mark))));
  for (const [cap, label, Icon] of [['highlight', '형광펜', Highlighter], ['color', '글자색', Palette]] as const) {
    if (!has(cap)) continue;
    const choices = (afterClose?: ToolbarAfterClose) => <DropdownMenuGroup>{RICH_CONTENT_PALETTE.map(key => <DropdownMenuItem key={key} disabled={disabled} onSelect={() => { const run = () => { editor.chain().focus().setMark(cap === 'color' ? 'textStyle' : 'highlight', { color: key }).run(); }; if (afterClose) afterClose(run); else run(); }}>{paletteNames[key]}</DropdownMenuItem>)}<DropdownMenuItem disabled={disabled} onSelect={() => { const run = () => { editor.chain().focus().unsetMark(cap === 'color' ? 'textStyle' : 'highlight').run(); }; if (afterClose) afterClose(run); else run(); }}>지우기</DropdownMenuItem></DropdownMenuGroup>;
    row1.push({ id: cap, group: 2, control: <DropdownMenu><IconHelp label={label}><DropdownMenuTrigger asChild><Button type="button" size="icon-xs" variant="ghost" aria-label={label} disabled={disabled}><Icon className="size-4" /></Button></DropdownMenuTrigger></IconHelp><DropdownMenuContent align="end">{choices()}</DropdownMenuContent></DropdownMenu>, overflow: afterClose => <DropdownMenuSub><DropdownMenuSubTrigger inset disabled={disabled}>{label}</DropdownMenuSubTrigger><DropdownMenuSubContent>{choices(afterClose)}</DropdownMenuSubContent></DropdownMenuSub> });
  }
  if (has('link')) row1.push({ id: 'link', group: 3, control: <Popover open={linkOpen} onOpenChange={open => { setLinkOpen(open); setLinkError(false); }}>{linkAnchor && <PopoverAnchor virtualRef={{ current: linkAnchor }} />}<IconHelp label="링크"><PopoverTrigger asChild><Button type="button" size="icon-xs" variant="ghost" aria-label="링크" disabled={disabled} onClick={() => setLinkAnchor(null)}><Link2 className="size-4" /></Button></PopoverTrigger></IconHelp><PopoverContent padding="compact" align="end" onCloseAutoFocus={event => { if (linkAnchor) { event.preventDefault(); linkAnchor.focus(); } }}><div className="flex items-center gap-1"><Input inputSize="toolbar" aria-label="링크 주소" value={href} aria-invalid={linkError || undefined} aria-describedby={linkError ? linkErrorId : undefined} onChange={e => { setHref(e.target.value); setLinkError(false); }} /><Button type="button" size="toolbar" variant="ghost" onClick={() => { if (!isValidWriteHref(href, surface)) { setLinkError(true); return; } setLinkError(false); editor.chain().focus().setLink({ href }).run(); }}>적용</Button><Button type="button" size="toolbar" variant="ghost" onClick={() => editor.chain().focus().unsetLink().run()}>해제</Button></div>{linkError && <p id={linkErrorId} role="alert" className="mt-1 text-xs text-text-danger-label break-keep">http:// 또는 https://로 시작하는 주소를 입력해 주세요.</p>}</PopoverContent></Popover>, overflow: afterClose => <DropdownMenuItem inset disabled={disabled} onSelect={() => afterClose(anchor => { setLinkAnchor(anchor); setLinkError(false); setLinkOpen(true); })}>링크</DropdownMenuItem> });
  row1.push(icon('undo', '실행 취소', Undo2, () => { editor.chain().focus().undo().run(); }, 4, undefined, !editor.can().undo()));
  row1.push(icon('redo', '다시 실행', Redo2, () => { editor.chain().focus().redo().run(); }, 4, undefined, !editor.can().redo()));
  for (const [label, Icon, node, group] of inserts) {
    const action = actionsForSurface(surface).find(action => action.label === label);
    if (action) row2.push(icon(node, label, Icon, () => action.run(editor), group, editor.isActive(node), false, `${label} (/${label})`));
  }
  if (attach) row2.push({ id: 'attach', group: 3, control: <AttachButton showTooltip className="rounded-md text-text-primary hover:bg-surface-card focus-visible:ring-focus-ring focus-visible:ring-offset-2 [&_svg]:size-4" data-testid="rich-toolbar-attach" disabled={disabled || pending} onPick={async file => {
    if (picking.current) return;
    picking.current = true; setPending(true); setAttachError(false);
    try { await attach(file); } catch (error) { setAttachError(true); onAttachError?.(error); }
    finally { picking.current = false; setPending(false); }
  }} />, overflow: afterClose => <DropdownMenuItem inset disabled={disabled || pending} onSelect={() => afterClose(() => { root.current?.querySelector<HTMLInputElement>('[data-testid="rich-toolbar-attach-input"]')?.click(); })}>첨부 파일 추가</DropdownMenuItem> });
  if (has('mention')) row2.push(icon('mention', '멘션', AtSign, () => { editor.chain().focus().insertContent('@').run(); }, 3));
  return <div ref={root} className="sticky top-(--rich-editor-toolbar-offset,0px) z-10 border-b border-border-subtle bg-surface-canvas break-keep" style={stickyOffset === undefined ? undefined : { '--rich-editor-toolbar-offset': typeof stickyOffset === 'number' ? `${stickyOffset}px` : stickyOffset } as React.CSSProperties} role="toolbar" aria-label="본문 서식" data-rich-toolbar="" {...roving}>
    <ToolbarRow row={1} controls={row1} /><div aria-hidden className="mx-2 border-t border-border-subtle" /><ToolbarRow row={2} controls={row2} />
    {attachError && <p role="alert" className="px-2 text-xs text-text-danger-label">첨부 파일을 올리지 못했습니다. 다시 시도해 주세요.</p>}
  </div>;
}
