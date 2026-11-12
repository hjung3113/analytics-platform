import { currentAuthContext } from '../../lib/auth-context.js';
import { HttpError } from '../../lib/errors.js';
import type { MenuEndpointDeclaration } from '../menu-dispatch/types.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import type { LogLifecycleDeps } from './deps.js';
import { VALIDATION_ISSUE_PARAM_KEYS, parseValidationIssueParams, type ValidationIssueRead } from './domain/validation-issue-params.js';
import { LOG_MODELS_MENU_ID } from './menu.js';
import { createValidationIssueReader } from './validation-issue-read.js';

export function validationIssueEndpoints(deps: LogLifecycleDeps): MenuEndpointDeclaration[] {
  const reader = createValidationIssueReader(deps);
  return (Object.keys(VALIDATION_ISSUE_PARAM_KEYS) as ValidationIssueRead[]).map(name => ({
    spec: { id: `logLifecycle.${name}`, menuId: LOG_MODELS_MENU_ID, paramKeys: VALIDATION_ISSUE_PARAM_KEYS[name], permission: 'platform:view', requiresScope: false, context: {}, mergeTimeDomain: false },
    authorize: async (actor, tx) => currentAuthContext().kind === 'session' && holdsPlatformPermission(deps.checkService, actor, 'platform:view', tx ? { tx } : {}),
    validate: params => parseValidationIssueParams(name, params).success ? { ok: true } : { ok: false, message: 'invalid validation issue params' },
    async handle({ actor, params }) {
      if (currentAuthContext().kind !== 'session') return { outcome: 'forbidden', data: null };
      const parsed = parseValidationIssueParams(name, params);
      if (!parsed.success) return { outcome: 'error', data: null, message: 'invalid validation issue params' };
      const q = parsed.data;
      const options = { limit: q.limit, ...(q.cursor ? { cursor: q.cursor } : {}) };
      try {
        if (name === 'validationIssues') {
          const f = parseValidationIssueParams('validationIssues', params);
          if (!f.success) throw new Error('validated issue filters');
          return { outcome: 'ok', data: await reader.list(actor, { projectId: f.data.projectId, roundId: f.data.roundId }, options) };
        }
        if ('roundId' in q && name === 'roundDiscussion') return { outcome: 'ok', data: await reader.comments(actor, { kind: 'round', id: q.roundId as string }, options) };
        if (!('issueId' in q)) throw new Error('validated issue target');
        if (name === 'validationIssueThread') return { outcome: 'ok', data: await reader.comments(actor, { kind: 'issue', id: q.issueId }, options) };
        if (name === 'validationIssueHistory') return { outcome: 'ok', data: await reader.history(actor, q.issueId, options) };
        const detail = await reader.detail(actor, q.issueId);
        if (!detail) return { outcome: 'ok', data: null };
        const occurrences = await reader.occurrences(actor, q.issueId, options);
        // Both projections rejudge visibility; a revocation between them returns no cached original.
        return { outcome: 'ok', data: occurrences ? { ...detail, occurrences } : null };
      } catch (e) {
        if (e instanceof HttpError && e.code === 'validation.failed') return { outcome: 'error', data: null, message: 'cursor_invalid' };
        throw e;
      }
    },
  }));
}
