// Read-only schema/render definitions. No editor views, suggestions, upload handlers or editor plugins.
import { Mark, Node, type JSONContent } from '@tiptap/core';
import type { DOMOutputSpec } from '@tiptap/pm/model';
import { lowlight } from './highlight';
import { richContentOutline, type OutlineEntry } from './outline';
export const PALETTE_TEXT_CLASSES: Record<string, string> = {
  default: 'text-text-primary', info: 'text-text-info-label', success: 'text-text-success-label', warning: 'text-text-warning-label', danger: 'text-text-danger-label',
};
export const PALETTE_HIGHLIGHT_CLASSES: Record<string, string> = {
  default: 'bg-surface-row-selected', info: 'bg-text-info/10', success: 'bg-text-success/10', warning: 'bg-text-warning/10', danger: 'bg-text-danger/10',
};
const paletteMark = (name: string, tag: string, classes: Record<string, string>) => Mark.create({
  name,
  addAttributes() { return { color: { default: null, parseHTML: el => el.getAttribute('data-rich-color') } }; },
  parseHTML() { return [{ tag: `${tag}[data-rich-color]` }]; },
  renderHTML({ HTMLAttributes }) {
    const key = String(HTMLAttributes.color ?? 'default');
    return [tag, { 'data-rich-color': key, class: classes[key] ?? classes.default }, 0];
  },
});
export const PaletteHighlight = paletteMark('highlight', 'mark', PALETTE_HIGHLIGHT_CLASSES);
export const PaletteColor = paletteMark('textStyle', 'span', PALETTE_TEXT_CLASSES);

export const OutlineNode = Node.create<{ entries: OutlineEntry[] }>({
  name: 'tableOfContents', group: 'block', atom: true,
  addOptions() { return { entries: [] }; },
  parseHTML() { return [{ tag: 'nav[data-rich-outline]' }]; },
  renderHTML() {
    return ['nav', { 'data-rich-outline': '', 'aria-label': '목차', class: 'flex flex-col gap-1 text-xs' },
      ...this.options.entries.map(entry => ['a', { href: `#${entry.id}`, class: entry.level > 1 ? 'pl-3' : '' }, entry.text] as DOMOutputSpec),
    ];
  },
});

export const AttachmentImage = Node.create<{
  resolveAttachmentUrl: ((id: string) => string | null) | undefined;
  label: ((id: string) => string) | undefined;
}>({
  name: 'image', group: 'block', atom: true, draggable: true,
  addOptions() { return { resolveAttachmentUrl: undefined, label: undefined }; },
  addAttributes() { return { id: { default: null }, width: { default: null } }; },
  // HTML/markdown input can never manufacture an attachment ID.
  parseHTML() { return []; },
  renderHTML({ node }) {
    const id = String(node.attrs.id ?? '');
    const url = this.options.resolveAttachmentUrl?.(id);
    const label = this.options.label?.(id) ?? 'attachment';
    if (!url) return ['div', { 'data-type': 'attachment-ref', 'data-attachment-id': id }, ['span', { class: 'attachment-icon' }, '📎'], ['span', { class: 'attachment-id' }, label]];
    return ['img', { src: url, alt: label, 'data-attachment-id': id, ...(node.attrs.width ? { width: node.attrs.width } : {}) }];
  },
});

// lowlight's hast is serialized as DOMOutputSpec text nodes, which generateHTML escapes.
function highlightedCode(text: string, language: unknown): DOMOutputSpec[] {
  if (typeof language !== 'string' || !lowlight.registered(language)) return [['span', {}, text]];
  type HNode = { type: string; value?: string; properties?: { className?: unknown }; children?: HNode[] };
  const render = (nodes: HNode[]): DOMOutputSpec[] => nodes.flatMap<DOMOutputSpec>(node => {
    if (node.type === 'text') return [['span', {}, node.value ?? '']];
    if (node.type !== 'element') return [];
    const classes = Array.isArray(node.properties?.className) ? node.properties.className.filter(x => typeof x === 'string' && /^hljs-[\w-]+$/.test(x)).join(' ') : '';
    return [['span', { class: classes }, ...render(node.children ?? [])]];
  });
  return render(lowlight.highlight(language, text).children as HNode[]);
}
export function readerBlockSchemas(doc: JSONContent) {
  const container = (name: string, tag: string, content: string, group?: string) => Node.create({
    name, content, ...(group ? { group } : {}),
    parseHTML() { return [{ tag }]; }, renderHTML() { return [tag, {}, 0]; },
  });
  const cell = (name: string, tag: string) => Node.create({
    name, content: 'block+',
    addAttributes() { return { colspan: { default: 1 }, rowspan: { default: 1 }, colwidth: { default: null } }; },
    renderHTML({ node }) { return [tag, { colspan: node.attrs.colspan, rowspan: node.attrs.rowspan, ...(node.attrs.colwidth ? { 'data-colwidth': node.attrs.colwidth.join(',') } : {}) }, 0]; },
  });
  return [
    Node.create({ name: 'heading', group: 'block', content: 'inline*', addAttributes() { return { level: { default: 1 }, id: { default: null } }; }, renderHTML({ node }) { return [`h${node.attrs.level}`, { id: node.attrs.id }, 0]; } }),
    Node.create({ name: 'table', group: 'block', content: 'tableRow+', renderHTML({ node }) {
      const columns: DOMOutputSpec[] = [];
      const row = node.firstChild;
      row?.forEach(cell => {
        for (let index = 0; index < Number(cell.attrs.colspan ?? 1); index++) {
          const width = cell.attrs.colwidth?.[index];
          columns.push(['col', width ? { width } : {}]);
        }
      });
      return ['table', {}, ['colgroup', {}, ...columns], ['tbody', {}, 0]];
    } }), container('tableRow', 'tr', '(tableCell | tableHeader)+'), cell('tableCell', 'td'), cell('tableHeader', 'th'),
    Node.create({ name: 'taskList', group: 'block', content: 'taskItem+', renderHTML() { return ['ul', { 'data-type': 'taskList' }, 0]; } }),
    Node.create({ name: 'taskItem', content: 'paragraph block*', addAttributes() { return { checked: { default: false } }; }, renderHTML({ node }) { return ['li', { 'data-type': 'taskItem' }, ['label', {}, ['input', { type: 'checkbox', disabled: '', ...(node.attrs.checked ? { checked: '' } : {}) }]], ['div', {}, 0]]; } }),
    Node.create({ name: 'details', group: 'block', content: 'detailsSummary detailsContent', addAttributes() { return { open: { default: false } }; }, renderHTML({ node }) { return ['details', node.attrs.open ? { open: '' } : {}, 0]; } }),
    container('detailsSummary', 'summary', 'text*'), container('detailsContent', 'div', 'block+'),
    Node.create({ name: 'codeBlock', group: 'block', content: 'text*', marks: '', code: true, addAttributes() { return { language: { default: null } }; }, renderHTML({ node }) { return ['pre', {}, ['code', { class: node.attrs.language ? `language-${node.attrs.language}` : '' }, ...highlightedCode(node.textContent, node.attrs.language)]]; } }),
    OutlineNode.configure({ entries: richContentOutline(doc) }), PaletteHighlight, PaletteColor,
  ];
}

/** Minimal read schemas: no StarterKit, history, input rules or autolink plugins. */
export function readerBaseSchemas(extended: boolean) {
  const block = (name: string, tag: string, content: string, group = 'block') => Node.create({ name, group, content, renderHTML() { return [tag, {}, 0]; } });
  const mark = (name: string, tag: string) => Mark.create({ name, renderHTML() { return [tag, {}, 0]; } });
  return [
    Node.create({ name: 'doc', topNode: true, content: 'block+' }),
    Node.create({ name: 'text', group: 'inline' }),
    block('paragraph', 'p', 'inline*'), block('bulletList', 'ul', 'listItem+'),
    Node.create({ name: 'orderedList', group: 'block', content: 'listItem+', addAttributes() { return { start: { default: 1 } }; }, renderHTML({ node }) { return ['ol', node.attrs.start === 1 ? {} : { start: node.attrs.start }, 0]; } }),
    block('listItem', 'li', 'paragraph block*', ''), block('blockquote', 'blockquote', 'block+'),
    Node.create({ name: 'horizontalRule', group: 'block', renderHTML() { return ['hr']; } }),
    Node.create({ name: 'hardBreak', group: 'inline', inline: true, renderHTML() { return ['br']; } }),
    mark('bold', 'strong'), mark('italic', 'em'), mark('underline', 'u'), mark('strike', 's'), mark('code', 'code'),
    ...(!extended ? [Node.create({ name: 'codeBlock', group: 'block', content: 'text*', marks: '', code: true, addAttributes() { return { language: { default: null } }; }, renderHTML({ node }) { return ['pre', {}, ['code', node.attrs.language ? { class: `language-${node.attrs.language}` } : {}, 0]]; } })] : []),
  ];
}
