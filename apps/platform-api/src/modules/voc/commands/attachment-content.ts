import { collectRichContentAttachmentIds } from '@ap/feature-shared';
import { HttpError } from '../../../lib/errors.js';
/** Call only after upload-link validation or with the new IDs that linking will validate in this transaction. */
export function assertBodyAttachmentsLinked(doc: unknown, linkedIds: readonly string[]): void {
  const linked = new Set(linkedIds.map(id => id.toLowerCase()));
  if (collectRichContentAttachmentIds(doc).some(id => !linked.has(id))) {
    throw new HttpError('validation.failed', 'body references an attachment not linked to this VOC', {
      fields: [{ path: ['description_rich_content'], code: 'attachment_not_linked' }],
    });
  }
}
