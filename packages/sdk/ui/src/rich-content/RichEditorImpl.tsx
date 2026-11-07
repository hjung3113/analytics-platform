import { type Editor, EditorContent, useEditor } from '@tiptap/react';
import { Node as ProseNode } from '@tiptap/pm/model';
import * as React from 'react';
import { cn } from '../utils/cn';
import type { RichEditorProps, RichEditorToolbarApi, TipTapDoc } from './RichEditor';
import { getExtensionsForSurface } from './allowlist-local';
import { buildExtensionsForSurface } from './editor-extensions';
import { RichEditorToolbar } from './RichEditorToolbar';
import { EditorExtras, type SlashMenuAssociation } from './EditorExtras';
import { sanitizeClient } from './sanitizeClient';

export default function RichEditorImpl({
  surface,
  value,
  defaultValue,
  onChange,
  placeholder,
  ariaLabel,
  disabled,
  minHeight,
  toolbar,
  onAttach,
  resolveAttachmentUrl,
}: RichEditorProps) {
  const callbacks = React.useRef({ onAttach, resolveAttachmentUrl });
  React.useEffect(() => { callbacks.current = { onAttach, resolveAttachmentUrl }; }, [onAttach, resolveAttachmentUrl]);
  const [uploadError, setUploadError] = React.useState(false);
  const [slashMenu, setSlashMenu] = React.useState<SlashMenuAssociation | null>(null);
  const uploadFiles = React.useCallback(async (editor: Editor, files: File[], pos?: number) => {
    if (!editor.isEditable || !callbacks.current.onAttach) return;
    setUploadError(false);
    let insertion = pos ?? editor.state.selection.from;
    const mapPosition = ({ transaction }: { transaction: import('@tiptap/pm/state').Transaction }) => {
      insertion = transaction.mapping.map(insertion, 1);
    };
    editor.on('transaction', mapPosition);
    try {
      for (const file of files) {
        try {
          const result = await callbacks.current.onAttach(file);
          if (editor.isDestroyed || !editor.isEditable) return;
          if (file.type.startsWith('image/')) {
            editor.commands.insertContentAt(Math.min(insertion, editor.state.doc.content.size), { type: 'image', attrs: { id: result.attachment_id } });
          }
        } catch { setUploadError(true); }
      }
    } finally { editor.off('transaction', mapPosition); }
  }, []);
  const extensions = React.useMemo(
    () => buildExtensionsForSurface(surface, placeholder ?? '', {
      resolveAttachmentUrl: id => callbacks.current.resolveAttachmentUrl?.(id) ?? null,
      onFiles: (editor, files, pos) => { void uploadFiles(editor, files, pos); },
    }), [surface, placeholder, uploadFiles],
  );

  // `role` is written explicitly: every setOptions call replaces the whole
  // `attributes` object, which drops the role TipTap only adds at view creation.
  const editorProps = React.useMemo(
    () => ({
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
        ...(getExtensionsForSurface(surface).includes('heading') ? {
          'aria-expanded': slashMenu ? 'true' : 'false',
          ...(slashMenu ? { 'aria-controls': slashMenu.id, 'aria-activedescendant': slashMenu.activeId } : {}),
        } : {}),
      },
    }),
    [ariaLabel, surface, slashMenu],
  );

  const editor = useEditor({
    extensions,
    editorProps,
    // value can be null (explicit clear); fall through to defaultValue / empty doc.
    content: getExtensionsForSurface(surface).includes('image')
      ? sanitizeClient(value ?? defaultValue ?? { type: 'doc', content: [{ type: 'paragraph' }] }, surface)
      : (value ?? defaultValue ?? { type: 'doc', content: [{ type: 'paragraph' }] }) as TipTapDoc,
    editable: !disabled,
    onUpdate({ editor }) {
      const doc = editor.getJSON() as TipTapDoc;
      onChange?.(getExtensionsForSurface(surface).includes('image') ? sanitizeClient(doc, surface) : doc);
    },
    immediatelyRender: false,
  });

  // A failed paste/drop warning belongs to that attempt: once the author edits again it is stale (the consumer's attachment
  // list keeps its own failed row and retry), so the next document change clears it.
  React.useEffect(() => {
    if (!editor || !uploadError) return;
    const clear = () => setUploadError(false);
    editor.on('update', clear);
    return () => { editor.off('update', clear); };
  }, [editor, uploadError]);

  // Re-sync value when controlled.
  // REV-3 Cluster Z: an explicit `null`/`undefined` from a controlled parent
  // must visually clear the editor. The prior implementation bailed on any
  // falsy value (`!value`), so submit-success and VOC-switch flows that
  // flipped the parent draft to null left stale content in the editor body.
  //
  // Controlled vs uncontrolled is detected via a ref on the initial render:
  // if the consumer ever passed a non-undefined `value`, the component is
  // controlled for the remainder of its life and subsequent null/undefined
  // values mean "clear me". A component that never receives a `value` prop
  // is uncontrolled (e.g. `<RichEditor surface="..." defaultValue={...} />`)
  // and the effect is a no-op for it.
  const wasControlledRef = React.useRef<boolean>(value !== undefined);
  React.useEffect(() => {
    if (!editor) return;
    if (value !== undefined) {
      wasControlledRef.current = true;
    }
    if (!wasControlledRef.current) return;
    const incoming: TipTapDoc = value ?? { type: 'doc', content: [{ type: 'paragraph' }] };
    const targetDoc = getExtensionsForSurface(surface).includes('image') ? sanitizeClient(incoming, surface) : incoming;
    // Compare as schema documents: raw getJSON() and the sanitized value differ in key order and
    // default attrs even when identical, and a needless setContent moves the caret.
    let same = false;
    try {
      same = ProseNode.fromJSON(editor.schema, targetDoc).eq(editor.state.doc);
    } catch {
      same = false;
    }
    if (!same) {
      editor.commands.setContent(targetDoc, { emitUpdate: false });
    }
  }, [editor, value, surface]);

  // Re-apply editable when disabled changes
  React.useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  // Stable toolbar API. `attach` uploads via the injected `onAttach`, and on
  // resolve inserts an attachment-backed image for an opted-in image upload,
  // otherwise the existing attachmentRef at the current selection. On failure we re-throw so the caller can toast — the
  // editor stays in its prior state (no partial node inserted).
  const onAttachRef = React.useRef(onAttach);
  React.useEffect(() => {
    onAttachRef.current = onAttach;
  }, [onAttach]);

  const toolbarApi = React.useMemo<RichEditorToolbarApi>(
    () => ({
      renderControls: opts => editor ? <RichEditorToolbar editor={editor} surface={surface} {...(opts?.hideAttach ? {} : { attach: toolbarApi.attach })} {...(opts?.onAttachError ? { onAttachError: opts.onAttachError } : {})} /> : null,
      attach: async (file: File) => {
        const uploader = onAttachRef.current;
        if (!uploader) {
          throw new Error('RichEditor: onAttach is not configured for this surface');
        }
        const result = await uploader(file);
        if (editor && !editor.isDestroyed) {
          editor
            .chain()
            .focus()
            .insertContent({
              type: getExtensionsForSurface(surface).includes('image') && file.type.startsWith('image/') ? 'image' : 'attachmentRef',
              attrs: {
                id: result.attachment_id,
                name: result.name,
                size_bytes: result.size_bytes,
                mime_type: result.mime_type,
              },
            })
            .run();
        }
        return result;
      },
    }),
    [editor, surface],
  );

  return (
    <>
      {toolbar ? toolbar(editor, toolbarApi) : editor && getExtensionsForSurface(surface).includes('heading') ? <RichEditorToolbar editor={editor} surface={surface} {...(onAttach ? { attach: toolbarApi.attach } : {})} /> : null}
      {uploadError && <p role="alert" className="break-keep px-3 text-sm text-text-danger-label">첨부 파일을 올리지 못했습니다. 다시 시도해 주세요.</p>}
      {editor && getExtensionsForSurface(surface).includes('heading') && <EditorExtras editor={editor} surface={surface} onMenuChange={setSlashMenu} />}
      {/*
        `minHeight` sizes this wrapper, but the editable element TipTap renders
        inside it (`.ProseMirror`) is only as tall as its content. Everything
        below the first line was therefore dead space: clicking it hit the
        wrapper, not the editor, so an 84px composer only took focus on its top
        line. Laying the wrapper out as a column, letting `.ProseMirror` grow
        into it, and moving the padding onto `.ProseMirror` itself makes the
        whole box the click target. Geometry is unchanged: the padding renders
        at the same offsets, it just belongs to the editable element now, so
        the inset that used to swallow clicks no longer does.
      */}
      <EditorContent
        editor={editor}
        className={cn(
          'flex max-w-none flex-col focus:outline-hidden [&_.ProseMirror]:flex-1 [&_.ProseMirror]:px-3 [&_.ProseMirror]:py-2',
          minHeight ? 'min-h-(--rich-editor-min-height)' : undefined,
        )}
        style={
          minHeight
            ? ({
                '--rich-editor-min-height':
                  typeof minHeight === 'number' ? `${minHeight}px` : minHeight,
              } as React.CSSProperties)
            : undefined
        }
      />
    </>
  );
}
