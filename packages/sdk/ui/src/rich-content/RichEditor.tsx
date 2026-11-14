import type { Editor, JSONContent } from '@tiptap/core';
import * as React from 'react';
import { cn } from '../utils/cn';

// TipTapDoc is a branded alias over JSONContent for type safety at feature boundaries.
// The `content` array is typed as JSONContent[] to satisfy @tiptap/core's strict overloads.
export type TipTapDoc = JSONContent & { type: 'doc' };

/** Spec-locked surface identifiers. Typos compile-fail here instead of silently producing wrong toolbar config in #19. */
export type RichEditorSurface =
  | 'voc-description'
  | 'reporter-reply'
  | 'public-update'
  | 'internal-comment';

/**
 * Result of a successful attachment upload — the strict envelope returned
 * by POST /attachments (mirrors @ap/feature-shared AttachmentCreated, kept loose
 * here so packages/sdk/ui has no shared-domain import). PLAN-22 C8.
 */
export interface RichEditorAttachmentResult {
  attachment_id: string;
  name: string;
  size_bytes: number;
  mime_type: string;
}

/**
 * Helper bag passed to the toolbar render-prop. Surface toolbars use
 * `attach(file)` to upload + insert in one step; the editor wires the
 * AttachmentRef node insertion on the consumer's behalf so toolbars stay
 * free of TipTap node-schema knowledge.
 */
export interface RichEditorToolbarApi {
  /** Render capability-driven SDK controls through an existing toolbar adapter. */
  renderControls?: (options?: { hideAttach?: boolean; onAttachError?: (error: unknown) => void }) => React.ReactNode;
  /** Upload and insert: opted-in image files use `{id}`; other toolbar uploads retain attachmentRef metadata. Errors propagate. */
  attach: (file: File) => Promise<RichEditorAttachmentResult>;
}

export interface RichEditorProps {
  /** Copy of slash/block insertion actions; omitted preserves Korean labels and summary. */
  actionMessages?: import('./editor-actions').EditorActionMessages;
  surface: RichEditorSurface;
  /**
   * Controlled value. Pass `null` (or an empty doc) to explicitly clear the
   * editor — e.g. after submit success or VOC switch. Omitting the prop
   * (`undefined`) leaves the editor uncontrolled. REV-3 Cluster Z.
   */
  value?: TipTapDoc | null;
  defaultValue?: TipTapDoc;
  onChange?: (doc: TipTapDoc) => void;
  placeholder?: string;
  /** Accessible name of the editable textbox (the placeholder is not a name). */
  ariaLabel?: string;
  disabled?: boolean;
  minHeight?: string | number;
  className?: string;
  /** Sticky toolbar offset within the host scroll container; defaults to CSS --rich-editor-toolbar-offset or 0. */
  toolbarStickyOffset?: string | number;
  /**
   * Toolbar render-prop. Receives the live editor + a toolbar API helper
   * (PLAN-22 C8). If `onAttach` is not provided, `toolbarApi.attach` rejects
   * synchronously — toolbars should hide Attach when the surface does not
   * inject an uploader.
   */
  toolbar?: (editor: Editor | null, toolbarApi: RichEditorToolbarApi) => React.ReactNode;
  /**
   * Uploads a single picked file to the attachments service and returns the
   * created-attachment envelope. On image-capable surfaces paste/drop inserts
   * images with `{id}`; other files remain in the consumer attachment list.
   * Toolbar uploads retain attachmentRef behavior for non-image files.
   */
  onAttach?: (file: File) => Promise<RichEditorAttachmentResult>;
  /** Resolve an uploaded attachment at view time. URLs are never stored in image JSON. */
  resolveAttachmentUrl?: (id: string) => string | null;
  /**
   * Display name of a mentioned actor. A mention stores only `actor_id`; without a resolver, or when it
   * returns nothing, the chip shows the neutral fallback `@멘션`, never the id. The editor reads the latest
   * resolver when a mention is drawn. Already-drawn chips do not refresh when resolver results change;
   * callers should have labels ready before mounting the editor.
   */
  resolveMentionLabel?: (actorId: string) => string | null | undefined;
}

// The root entry stays cheap; Tiptap editing plugins load only when an editor mounts.
const LazyEditor = React.lazy(() => import('./RichEditorImpl'));
export function RichEditor(props: RichEditorProps) {
  return <div className={cn('rich-editor relative border border-border-control rounded-md bg-surface-canvas', props.className)} data-surface={props.surface}>
    <React.Suspense fallback={<div role="status" className="px-3 py-2 text-sm text-text-muted">{props.placeholder ?? '내용 준비 중'}</div>}>
      <LazyEditor {...props} />
    </React.Suspense>
  </div>;
}
