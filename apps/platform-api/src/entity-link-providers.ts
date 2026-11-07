import { manualValidationAttachmentEntityLinkProvider } from './modules/attachments/entity-link-provider.js';
import type { AttachmentParentReader } from './modules/attachments/index.js';
import { opaqueSurveyResponseProvider } from './modules/entity-links/opaque-survey-response-provider.js';
import type { EntityLinkProviderRegistry } from './modules/entity-links/provider-types.js';
import { findingEntityLinkProvider } from './modules/findings/entity-link-provider.js';
import { validationRoundEntityLinkProvider } from './modules/log-lifecycle/entity-link-provider.js';
import { taskRequestEntityLinkProvider } from './modules/task-requests/entity-link-provider.js';
import { taskEntityLinkProvider } from './modules/tasks/entity-link-provider.js';
import { vocClusterEntityLinkProvider } from './modules/voc-clusters/entity-link-provider.js';
import { vocEntityLinkProvider } from './modules/voc/entity-link-provider.js';

/**
 * `attachmentParents` are the readers the attachment end consults (the same ones the download path uses); none registered
 * = every attachment end is denied.
 */
export function buildEntityLinkProviders(
  opts: { attachmentParents?: readonly AttachmentParentReader[] } = {},
): EntityLinkProviderRegistry {
  return {
    voc: vocEntityLinkProvider,
    survey_response: opaqueSurveyResponseProvider,
    finding: findingEntityLinkProvider,
    voc_cluster: vocClusterEntityLinkProvider,
    task_request: taskRequestEntityLinkProvider,
    task: taskEntityLinkProvider,
    validation_round: validationRoundEntityLinkProvider,
    manual_validation_attachment: manualValidationAttachmentEntityLinkProvider(
      opts.attachmentParents ?? [],
    ),
  };
}
