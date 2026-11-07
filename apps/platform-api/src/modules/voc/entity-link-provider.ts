import { resolveVocEndpoint } from '../entity-links/index.js';
import {
  type EntityLinkProvider,
  requireEndpointManagedSystemId,
} from '../entity-links/provider-types.js';
import { canReadVocAsSource } from './authorization.js';

export const vocEntityLinkProvider: EntityLinkProvider = {
  entityType: 'voc',
  assertExists: resolveVocEndpoint,
  getPermissionSubject: resolveVocEndpoint,
  canRead: async (deps, actor, subject) => {
    return canReadVocAsSource(deps.checkService, actor, {
      managedSystemId: requireEndpointManagedSystemId(subject),
      reporterId: subject.reporter_id,
    });
  },
  getReporterSummary: async () => ({ available: false }),
  getInternalSummary: async () => null,
  listExpectedLinks: async () => [],
};
