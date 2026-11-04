// The two menu actions the import wizard needs because a menu has no multipart upload and no raw POST (#1195 b3,
// plan decision 11): `logKnowledge.importPaste` stages pasted text (model sheets only) and `logKnowledge.importApply`
// runs the resumable apply. Both are judged with `knowledge.catalog.import`, before replay and again on the
// transaction (the action engine does both).
//
// How `runApply` runs inside a handler (the transaction question): the engine's transaction holds the idempotency
// record and the (actor, key) advisory xact lock, nothing of the job (`concurrency: 'none'`, no `currentVersion`).
// `runApply` uses its own pool connections: one pinned connection holds the session advisory lock (workspace + job)
// and runs the seal and every row transaction on it, so a run takes the engine's connection plus one. It never
// touches the idempotency table, so it cannot wait on the record. Admission is by in-process slot (two runs per
// process, shared with the apply route): no free slot answers `busy` at once and nothing waits while the outer
// transaction is open. Rows commit outside the action record; if the record never commits, the same key re-runs
// the apply, and the seal plus per-row idempotency (node b) create nothing twice.

import { createHash } from 'node:crypto';

import type { Tx } from '../../db/tx.js';
import {
  type ActionHandlerResult,
  type FieldError,
  type MenuActionDeclaration,
  MenuActionInvalidError,
} from '../menu-dispatch/types.js';
import { CATALOG_MENU_PERMISSION } from './catalog-actions.js';
import { LOG_KNOWLEDGE_MENU_ID } from './catalog-menu.js';
import { PASTE_MAX_BYTES, parsePastedText, pasteDelimiter, sanitizeImportFileName } from './domain/import-file.js';
import { modelHeaderFailure, recognizeModelHeaders } from './domain/import-headers.js';
import { applySlots, parseSlots } from './import-admission.js';
import { IMPORT_APPLY_BUDGET_MS, runApply } from './import-apply-service.js';
import { UUID_PATTERN, importAuthorizer } from './import-actions.js';
import type { LogKnowledgeDeps } from './deps.js';
import { insertJob, insertRows } from './repositories/import-repo.js';

const INVALIDATES = ['logKnowledge.importDetail'] as const;
export const PASTE_DEFAULT_NAMES = { tab: '붙여넣기.tsv', comma: '붙여넣기.csv' } as const;

const pasteShapeErrors = (input: Record<string, unknown>): FieldError[] => {
  const errors: FieldError[] = [];
  if (typeof input.text !== 'string') errors.push({ path: ['text'], code: 'required' });
  else if (Buffer.byteLength(input.text, 'utf8') > PASTE_MAX_BYTES) errors.push({ path: ['text'], code: 'file_too_large' });
  if (input.sourceName !== undefined && typeof input.sourceName !== 'string') errors.push({ path: ['sourceName'], code: 'invalid' });
  return errors;
};

const applyShapeErrors = (input: Record<string, unknown>): FieldError[] => {
  const errors: FieldError[] = [];
  if (typeof input.jobId !== 'string' || !UUID_PATTERN.test(input.jobId)) errors.push({ path: ['jobId'], code: 'required' });
  const v = input.expectedPlanVersion;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) errors.push({ path: ['expectedPlanVersion'], code: 'invalid' });
  return errors;
};

export function importIntakeActions(deps: LogKnowledgeDeps): MenuActionDeclaration[] {
  const authorize = importAuthorizer(deps.checkService);

  const importPaste: MenuActionDeclaration = {
    spec: {
      id: 'logKnowledge.importPaste',
      menuId: LOG_KNOWLEDGE_MENU_ID,
      inputKeys: ['text', 'sourceName'],
      permission: CATALOG_MENU_PERMISSION,
      requiresScope: false,
      concurrency: 'none',
      invalidates: INVALIDATES,
    },
    authorize,
    validate: pasteShapeErrors,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const text = input.text as string;
      const release = parseSlots.tryTake();
      // Not recorded for replay (an `invalid` answer), so retrying with the same key works.
      if (!release) throw new MenuActionInvalidError([{ path: ['text'], code: 'busy' }]);
      let parsed: ReturnType<typeof parsePastedText>;
      try {
        parsed = parsePastedText(text, { recognizeHeaders: modelHeaderFailure });
      } finally {
        release();
      }
      if (!parsed.ok) {
        throw new MenuActionInvalidError([
          { path: ['text'], code: parsed.code },
          ...(parsed.detail ?? []).map((header) => ({ path: ['text', 'headers', header], code: parsed.code })),
        ]);
      }
      const recognized = recognizeModelHeaders(parsed.headers);
      const mapping = recognized.kind === 'mapped' ? recognized.mapping : undefined;
      const supplied = typeof input.sourceName === 'string' ? sanitizeImportFileName(input.sourceName) : '';
      const fileName = supplied !== '' ? supplied : pasteDelimiter(text) === '\t' ? PASTE_DEFAULT_NAMES.tab : PASTE_DEFAULT_NAMES.comma;
      const jobId = await insertJob(tx, {
        workspaceId: actor.workspace_id,
        actorId: actor.actor_id,
        entityType: 'model',
        fileName,
        fileSize: Buffer.byteLength(text, 'utf8'),
        fileType: 'csv',
        fileSha256: createHash('sha256').update(text, 'utf8').digest('hex'),
        headers: parsed.headers,
        ...(mapping ? { mapping } : {}),
      });
      await insertRows(
        tx,
        actor.workspace_id,
        jobId,
        parsed.rows.map((row, i) => ({ rowNo: i + 1, raw: row.cells, parseErrors: row.parseErrors })),
      );
      return { data: { jobId, rowCount: parsed.rows.length, status: mapping ? 'mapped' : 'uploaded' }, version: null };
    },
  };

  const importApply: MenuActionDeclaration = {
    spec: {
      id: 'logKnowledge.importApply',
      menuId: LOG_KNOWLEDGE_MENU_ID,
      inputKeys: ['jobId', 'expectedPlanVersion'],
      permission: CATALOG_MENU_PERMISSION,
      requiresScope: false,
      concurrency: 'none',
      invalidates: INVALIDATES,
    },
    authorize,
    validate: applyShapeErrors,
    async handle(_tx: Tx, actor, input): Promise<ActionHandlerResult> {
      if (!deps.pool) throw new Error('action importApply: the log-knowledge deps carry no pool');
      const release = applySlots.tryTake();
      if (!release) return { data: { outcome: 'busy' }, version: null };
      try {
        const result = await runApply(
          {
            db: deps.db,
            pool: deps.pool,
            actor,
            authorize,
            config: { budgetMs: deps.applyBudgetMs ?? IMPORT_APPLY_BUDGET_MS, ...(deps.applyHooks ? { hooks: deps.applyHooks } : {}) },
          },
          (input.jobId as string).toLowerCase(),
          input.expectedPlanVersion as number,
        );
        await deps.applyHooks?.afterApply?.();
        if (result.kind === 'not_found') return { data: { outcome: 'not_found' }, version: null };
        if (result.kind === 'conflict') return { data: { outcome: 'conflict', reason: result.code }, version: null };
        return { data: { outcome: 'progress', ...result.progress }, version: null };
      } finally {
        release();
      }
    },
  };

  return [importPaste, importApply];
}
