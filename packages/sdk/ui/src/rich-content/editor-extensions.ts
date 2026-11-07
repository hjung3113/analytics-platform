import { type Editor, ResizableNodeView } from '@tiptap/core';
import StarterKit, { type StarterKitOptions } from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Details, DetailsSummary, DetailsContent } from '@tiptap/extension-details';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import FileHandler from '@tiptap/extension-file-handler';
import type { RichEditorSurface } from './RichEditor';
import { getExtensionsForSurface, RICH_CONTENT_IMAGE_WIDTH, type UIRichContentExtensionCapability } from './allowlist-local';
import { AttachmentRef } from './extensions/attachmentRef';
import { Mention } from './extensions/mention';
import { AttachmentImage, OutlineNode, PaletteHighlight, PaletteColor } from './content-schema';
import { lowlight } from './highlight';
import { richContentOutline } from './outline';
interface EditingOptions {
  resolveAttachmentUrl: (id: string) => string | null;
  onFiles: (editor: Editor, files: File[], pos?: number) => void;
}
export function buildExtensionsForSurface(surface: RichEditorSurface, placeholder: string, options: EditingOptions) {
  const capabilities = new Set(getExtensionsForSurface(surface));
  const has = (capability: UIRichContentExtensionCapability) => capabilities.has(capability);
  const starter: Partial<StarterKitOptions> = {
    blockquote: has('blockquote') ? {} : false,
    heading: has('heading') ? { levels: [1, 2, 3] } : false,
    horizontalRule: has('horizontalRule') ? {} : false,
    strike: has('strike') ? {} : false,
    codeBlock: false, hardBreak: false, link: false, underline: false,
  };
  if (!has('bold')) starter.bold = false;
  if (!has('italic')) starter.italic = false;
  if (!has('code')) starter.code = false;
  if (!has('list')) { starter.bulletList = false; starter.orderedList = false; starter.listItem = false; }
  const image = AttachmentImage.extend({
    addNodeView() {
      return ({ node, editor, getPos }) => {
        const url = options.resolveAttachmentUrl(String(node.attrs.id ?? ''));
        if (!url) {
          const dom = document.createElement('div'); dom.dataset.type = 'attachment-ref'; dom.dataset.attachmentId = String(node.attrs.id ?? ''); 
          const icon = document.createElement('span'); icon.className = 'attachment-icon'; icon.textContent = '📎';
          const label = document.createElement('span'); label.className = 'attachment-id'; label.textContent = 'attachment';
          dom.append(icon, label);
          return { dom };
        }
        const element = document.createElement('img'); element.src = url; element.alt = 'attachment';
        const syncWidth = (width: unknown) => {
          // Resize writes inline CSS px; clear it so the width attribute (the stored value) is the only source.
          element.style.width = ''; element.style.height = '';
          if (typeof width === 'number' && width > 0) element.width = width; else element.removeAttribute('width');
        };
        syncWidth(node.attrs.width);
        return new ResizableNodeView({ element, node, editor, getPos,
          onResize: width => { element.width = Math.round(width); },
          onCommit: width => {
            const pos = getPos();
            if (pos !== undefined) editor.chain().setNodeSelection(pos).updateAttributes('image', { width: Math.max(RICH_CONTENT_IMAGE_WIDTH.min, Math.min(RICH_CONTENT_IMAGE_WIDTH.max, Math.round(width))) }).run();
          },
          onUpdate: next => {
            if (next.type !== node.type || next.attrs.id !== node.attrs.id) return false;
            syncWidth(next.attrs.width);
            return true;
          },
          options: { directions: ['bottom-right'], min: { width: RICH_CONTENT_IMAGE_WIDTH.min }, max: { width: RICH_CONTENT_IMAGE_WIDTH.max }, preserveAspectRatio: true },
        });
      };
    },
  }).configure({ resolveAttachmentUrl: options.resolveAttachmentUrl });
  return [StarterKit.configure(starter),
    ...(has('link') ? [Link.configure({ openOnClick: false })] : []), ...(has('underline') ? [Underline] : []),
    Placeholder.configure({ placeholder }), ...(has('attachmentRef') ? [AttachmentRef] : []), ...(has('mention') ? [Mention] : []),
    ...(has('highlight') ? [PaletteHighlight] : []), ...(has('color') ? [PaletteColor] : []),
    ...(has('taskList') ? [TaskList, TaskItem.configure({ nested: true })] : []),
    ...(has('table') ? [TableKit.configure({ table: { resizable: true, cellMinWidth: 25 } })] : []),
    ...(has('details') ? [Details.configure({ persist: true }), DetailsSummary, DetailsContent] : []),
    ...(has('tableOfContents') ? [OutlineNode.extend({
      addNodeView() {
        return ({ editor }) => {
          const dom = document.createElement('nav');
          dom.dataset.richOutline = ''; dom.setAttribute('aria-label', '목차');
          dom.className = 'flex flex-col gap-1 text-xs break-keep';
          const refresh = () => {
            dom.replaceChildren(...richContentOutline(editor.getJSON()).map((entry, index) => {
              const link = document.createElement('a'); link.href = `#${entry.id}`; link.textContent = entry.text;
              if (entry.level > 1) link.className = 'pl-3';
              link.onclick = event => { event.preventDefault(); editor.view.dom.querySelectorAll('h1,h2,h3')[index]?.scrollIntoView({ block: 'center' }); };
              return link;
            }));
          };
          refresh(); editor.on('update', refresh);
          return { dom, update: () => { refresh(); return true; }, destroy: () => { editor.off('update', refresh); } };
        };
      },
    })] : []),
    ...(has('codeBlock') ? [CodeBlockLowlight.configure({ lowlight, defaultLanguage: null, enableTabIndentation: true })] : []),
    ...(has('image') ? [image, FileHandler.configure({
      onPaste: (editor, files) => options.onFiles(editor, files),
      onDrop: (editor, files, pos) => options.onFiles(editor, files, pos),
    })] : []),
  ];
}
