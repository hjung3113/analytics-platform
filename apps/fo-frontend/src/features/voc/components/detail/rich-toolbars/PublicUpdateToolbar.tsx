// PublicUpdateToolbar — toolbar config for the public-update RichEditor surface.
//
// C5.2 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.2
// Prototype ref: docs/design-prototype/screen-voc.jsx:415-468
//
// Allowed marks: Bold, Italic, BulletList. Link is intentionally excluded.
// Attach: the public-update editor registers no `attachmentRef` node (its allowlist has none), so
// `PublicUpdateComposer` passes no `onAttach` and files go through the composer dropzone (#745).
// The optional `onAttach` branch below stays generic and is not wired on this surface.

import { ComposerToolbarButton } from '@/features/cross-system/composer-editor/ComposerToolbarButton';
import { AttachButton, type TipTapEditor } from '@fops/ui';
import { Bold, Italic, List } from 'lucide-react';
import type * as React from 'react';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PublicUpdateToolbarProps {
  editor: TipTapEditor | null;
  /** PLAN-22 C8: wired through RichEditor toolbar API; hidden when omitted. */
  onAttach?: (file: File) => Promise<unknown>;
  onAttachError?: (err: unknown) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Component ─────────────────────────────────────────────────────────────────

export function PublicUpdateToolbar({
  editor,
  onAttach,
  onAttachError,
}: PublicUpdateToolbarProps): React.ReactElement {
  const disabled = editor === null;

  return (
    <div
      className="flex items-center gap-0.5 px-2 py-1 border-b border-border-subtle"
      data-testid="public-update-toolbar"
    >
      <ComposerToolbarButton
        onClick={() => editor?.chain().focus().toggleBold().run()}
        isActive={editor?.isActive('bold') ?? false}
        disabled={disabled}
        title="굵게"
      >
        <Bold size={14} />
      </ComposerToolbarButton>

      <ComposerToolbarButton
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        isActive={editor?.isActive('italic') ?? false}
        disabled={disabled}
        title="기울임"
      >
        <Italic size={14} />
      </ComposerToolbarButton>

      <ComposerToolbarButton
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
        isActive={editor?.isActive('bulletList') ?? false}
        disabled={disabled}
        title="글머리 기호"
      >
        <List size={14} />
      </ComposerToolbarButton>

      {/* Attach — only when a caller wires `onAttach`; PublicUpdateComposer does not (#745). */}
      {onAttach ? (
        <AttachButton
          data-testid="public-update-attach"
          disabled={disabled}
          onPick={async (file) => {
            try {
              await onAttach(file);
            } catch (e) {
              onAttachError?.(e);
            }
          }}
        />
      ) : null}
    </div>
  );
}
