import { Node, mergeAttributes } from '@tiptap/core';

/** Stored mention attributes: only the actor id. The display name is resolved at view time. */
export interface MentionAttrs {
  actor_id: string;
}

export interface MentionOptions {
  /** Display name for an actor id; `null`/`undefined` shows the neutral fallback, never the id. */
  label: (actorId: string) => string | null | undefined;
}

/** Shown when no resolver is given or it does not know the actor. */
const MENTION_FALLBACK_LABEL = '멘션';

export const Mention = Node.create<MentionOptions>({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addOptions() {
    return { label: () => null };
  },
  addAttributes() {
    return {
      actor_id: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="mention"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    const actorId = HTMLAttributes.actor_id;
    const label = typeof actorId === 'string' && actorId ? this.options.label(actorId) : null;
    return [
      'span',
      mergeAttributes({ 'data-type': 'mention', class: 'mention-chip' }, HTMLAttributes),
      `@${label || MENTION_FALLBACK_LABEL}`,
    ];
  },
});
