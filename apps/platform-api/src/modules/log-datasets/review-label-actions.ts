// The result review label write action (#1480 D-d, design log-test-datasets §3.6 / §6): `reviewLabelAdd`. Right: `dataset.manage` (no new
// capability; Workspace scope, session-only), and a User is refused on the CURRENT role even with a live grant (a grantee demoted to User
// keeps the row but loses the right). A label is a human's note on one rule of one run item — false positive, false negative, accepted
// change, needs review — appended to `log_datasets.suite_review_label` (UPDATE/DELETE refused for every role). It NEVER changes a baseline, a
// result or a classification; the comparison shows the latest label per rule beside the computed classification.
// Rules: the run and item are the workspace's and the dataset must be visible to the actor (else the same `not_found` as a missing run);
// the rule must exist in that run item (named by its baseline's scope or expectations, or reported by its latest succeeded attempt). One
// transaction holds the label row and its body-free audit row (ids, label name, reason LENGTH).

import { createAuditService } from '../core/audit/audit-service.js';
import type { Tx } from '../../db/tx.js';
import { type ActionHandlerResult, type FieldError, type MenuActionDeclaration, MenuActionInvalidError } from '../menu-dispatch/types.js';
import { applyAdminModuleBypass } from '../permissions/check-service.js';
import { DATASET_MANAGE_MENU_PERMISSION, DATASET_MANAGE_PERMISSION } from './dataset-actions.js';
import type { LogDatasetsDeps } from './deps.js';
import { REVIEW_LABEL_INPUT_KEYS, parseReviewLabelInput, validateReviewLabelInput } from './domain/review-label-input.js';
import { LOG_DATASETS_MENU_ID } from './menu.js';
import { baselineRuleIds, findLabelTarget, insertLabel, runVisibleTo } from './repositories/comparison-read.js';

const invalid = (...errors: FieldError[]) => new MenuActionInvalidError(errors);

export function reviewLabelActions(deps: LogDatasetsDeps): MenuActionDeclaration[] {
  const audit = createAuditService();

  const reviewLabelAdd: MenuActionDeclaration = {
    spec: {
      id: 'logDataset.reviewLabelAdd',
      menuId: LOG_DATASETS_MENU_ID,
      inputKeys: REVIEW_LABEL_INPUT_KEYS,
      permission: DATASET_MANAGE_MENU_PERMISSION,
      requiresScope: false,
      concurrency: 'none',
      invalidates: ['logDataset.comparison'],
    },
    authorize: async (actor, tx) =>
      // A User never labels, even with a live grant: the CURRENT role is checked on every call.
      actor.role_level !== 'user' &&
      applyAdminModuleBypass(
        actor.role_level,
        DATASET_MANAGE_PERMISSION,
        await deps.checkService.checkCapability(actor, DATASET_MANAGE_PERMISSION, { workspace_id: actor.workspace_id }, { tx }),
      ).allow,
    validate: (input) => validateReviewLabelInput(input),
    async handle(tx: Tx, actor, input): Promise<ActionHandlerResult> {
      const parsed = parseReviewLabelInput(input);
      if (!parsed.ok) throw new Error('action reviewLabelAdd: validate passed but parse failed');
      const v = parsed.value;
      const ws = actor.workspace_id;
      const target = await findLabelTarget(tx, ws, actor.actor_id, v.suiteRunId, v.ordinal, v.datasetRevisionId);
      if (!target) {
        const known = await runVisibleTo(tx, ws, actor.actor_id, v.suiteRunId);
        throw invalid({ path: [known ? 'datasetRevisionId' : 'suiteRunId'], code: 'not_found' });
      }
      // The rule must exist in this run item: the baseline names it, or the latest succeeded attempt reported it.
      let exists = (await baselineRuleIds(tx, ws, target.baselineId)).has(v.ruleId);
      if (!exists) {
        const seen = (await deps.lifecycleResults.latestSucceeded(tx, ws, [target.requestId])).get(target.requestId);
        exists = Boolean(seen?.rules.some((rule) => rule.ruleId === v.ruleId));
      }
      if (!exists) throw invalid({ path: ['ruleId'], code: 'not_found' });
      const row = await insertLabel(tx, {
        workspaceId: ws,
        actorId: actor.actor_id,
        suiteRunId: v.suiteRunId,
        ordinal: v.ordinal,
        ruleId: v.ruleId,
        datasetRevisionId: v.datasetRevisionId,
        label: v.label,
        reason: v.reason,
      });
      await audit.record(tx, {
        workspace_id: ws,
        actor_id: actor.actor_id,
        event_type: 'dataset.review_label_added',
        subject_type: 'suite_run',
        subject_id: v.suiteRunId,
        summary: 'dataset review label added',
        detail: { datasetRevisionId: v.datasetRevisionId, ordinal: v.ordinal, ruleId: v.ruleId, label: v.label, reasonLength: [...v.reason].length },
      });
      return { data: { labelId: row.id, at: row.at }, version: null };
    },
  };

  return [reviewLabelAdd];
}
