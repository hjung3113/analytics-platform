import type { EntityLinkTargetSummary } from '@ap/feature-shared';
import type { Db } from '../../db/client.js';
import {
  type EntityLinkProvider,
  type ReporterSummaryResult,
  requireEndpointManagedSystemId,
} from '../entity-links/provider-types.js';
import { checkSurveyRead } from './authorization.js';
import { findSurvey } from './repo-read.js';

async function resolveSurvey(db: Db, workspaceId: string, id: string) {
  const survey = await findSurvey(db, workspaceId, id);
  if (!survey) return null;
  return {
    workspace_id: survey.workspace_id,
    managed_system_id: survey.primary_managed_system_id,
    reporter_id: null,
  };
}

const unavailableReporterSummary: ReporterSummaryResult = { available: false };

export const surveyEntityLinkProvider: EntityLinkProvider = {
  entityType: 'survey',
  assertExists: resolveSurvey,
  getPermissionSubject: resolveSurvey,
  canRead: async (deps, actor, subject) =>
    (
      await checkSurveyRead(
        deps.checkService,
        actor,
        requireEndpointManagedSystemId(subject),
      )
    ).allow,
  getReporterSummary: async () => unavailableReporterSummary,
  getReporterSummaries: async (_db, _workspaceId, ids) =>
    new Map(ids.map((id) => [id, unavailableReporterSummary])),
  getInternalSummary: async (db, workspaceId, id): Promise<EntityLinkTargetSummary | null> => {
    const survey = await findSurvey(db, workspaceId, id);
    return survey
      ? {
          type: 'survey',
          id: survey.id,
          display_id: survey.display_id,
          title: survey.title,
          survey_type: survey.type,
          status: survey.status,
          primary_managed_system_id: survey.primary_managed_system_id,
        }
      : null;
  },
  listExpectedLinks: async () => [],
};
