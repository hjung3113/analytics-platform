// The log explorer investigation write actions (#1468 b, design §3.2/§5): create, update (title / filters), add and
// remove an evidence location, archive. Right: `explorer.investigate` (workspace-scoped; menu permission
// `explorer:investigate`). Rules: the investigation belongs to its creator, and every action other than create finds
// only the caller's own row (`currentVersion` answers `not_found` for another owner, another workspace or an unknown
// id alike); the origin, the round reference and the sample set never change after create; an archived investigation
// is final (`illegal_transition`); the version check is the engine's (`conflict`), no silent overwrite. Every write is
// one transaction: row change and one `core.audit_log` row whose detail carries filter KEYS, counts and a note's
// LENGTH only. `evidenceHandoff` is node h, not here.

import type { Tx } from '../../db/tx.js';
import { createAuditService } from '../core/audit/audit-service.js';
import {
  type ActionHandlerResult,
  type FieldError,
  type MenuActionDeclaration,
  MenuActionInvalidError,
} from '../menu-dispatch/types.js';
import { applyAdminModuleBypass } from '../permissions/check-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import type { InvestigationDeps } from './deps.js';
import { addEvidence, removeEvidence, storedEvidence } from './domain/evidence.js';
import {
  EXPLORER_INPUT_KEYS,
  type ExplorerOp,
  parseArchive,
  parseCreate,
  parseEvidenceAdd,
  parseEvidenceRemove,
  parseUpdate,
  validateExplorerInput,
} from './domain/investigation-input.js';
import { INVESTIGATION_MENU_ID } from './menu.js';
import { insertInvestigation, lockOwned, patchInvestigation } from './repositories/investigation-write.js';

export const EXPLORER_INVESTIGATE_PERMISSION = 'explorer.investigate';
/** The menu permission the five actions declare: bootstrap lists it exactly for the users `EXPLORER_INVESTIGATE_PERMISSION` lets write (`platform-port/permissions.ts`). */
export const EXPLORER_INVESTIGATE_MENU_PERMISSION = 'explorer:investigate';

const INVALIDATES = ['logExplorer.investigations', 'logExplorer.investigationDetail'] as const;
const invalid = (...errors: FieldError[]) => new MenuActionInvalidError(errors);

export function investigationActions(deps: InvestigationDeps): MenuActionDeclaration[] {
  const audit = createAuditService();

  const authorize = async (actor: PlatformActor, tx: Tx) =>
    applyAdminModuleBypass(
      actor.role_level,
      EXPLORER_INVESTIGATE_PERMISSION,
      await deps.checkService.checkCapability(actor, EXPLORER_INVESTIGATE_PERMISSION, { workspace_id: actor.workspace_id }, { tx }),
    ).allow;

  const base = (op: ExplorerOp, concurrency: 'none' | 'version') => ({
    id: `logExplorer.${op}`,
    menuId: INVESTIGATION_MENU_ID,
    inputKeys: EXPLORER_INPUT_KEYS[op],
    permission: EXPLORER_INVESTIGATE_MENU_PERMISSION,
    requiresScope: false,
    concurrency,
    invalidates: INVALIDATES,
  });

  const currentVersion = async (tx: Tx, actor: PlatformActor, input: Record<string, unknown>) => {
    const row = await lockOwned(tx, actor.workspace_id, actor.actor_id, input.id as string);
    return row ? String(row.rowVersion) : null;
  };

  /** The locked own row of a version action; `currentVersion` already judged it present, the engine holds the lock. */
  const open = async (tx: Tx, actor: PlatformActor, id: string) => {
    const row = await lockOwned(tx, actor.workspace_id, actor.actor_id, id);
    if (!row) throw new Error('investigation action: currentVersion judged not_found first');
    // Archived is final; the engine compared expectedVersion first, so only a current version reaches this
    // `illegal_transition` — a stale version already answered `conflict` with the archived row's version.
    if (row.status !== 'open') throw invalid({ path: ['id'], code: 'illegal_transition' });
    // A round origin stays writable only while its Round resolves: the same port and answer as create, judged
    // on the write transaction before any mutation, so a lost Round refuses with nothing changed, no version
    // bump and no audit row. Standalone investigations are unaffected.
    if (row.origin === 'round' && (row.roundId === null || (await deps.lifecycleRead.getRoundSampleSet(tx, row.workspaceId, row.roundId)) === null)) {
      throw invalid({ path: ['roundId'], code: 'not_found' });
    }
    return row;
  };

  const create: MenuActionDeclaration = {
    spec: base('investigationCreate', 'none'),
    authorize,
    validate: (input) => validateExplorerInput('investigationCreate', input),
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const parsed = parseCreate(input);
      if (!parsed.ok) throw new Error('action investigationCreate: validate passed but parse failed');
      const value = parsed.value;
      if (value.origin === 'round' && (await deps.lifecycleRead.getRoundSampleSet(tx, ws, value.roundId)) === null) {
        throw invalid({ path: ['roundId'], code: 'not_found' });
      }
      const row = await insertInvestigation(tx, {
        workspaceId: ws,
        ownerActorId: actor.actor_id,
        title: value.title,
        origin: value.origin,
        roundId: value.origin === 'round' ? value.roundId : null,
        sampleSet: value.origin === 'standalone' ? value.sampleSet : null,
      });
      await audit.record(tx, {
        workspace_id: ws,
        actor_id: actor.actor_id,
        event_type: 'explorer.investigation.created',
        subject_type: 'investigation',
        subject_id: row.id,
        summary: 'log investigation created',
        detail: {
          origin: value.origin,
          roundId: value.origin === 'round' ? value.roundId : null,
          fileCount: value.origin === 'standalone' ? value.sampleSet.files.length : 0,
          filterKeys: [],
        },
      });
      return { data: { id: row.id, version: String(row.rowVersion) }, version: null };
    },
  };

  const update: MenuActionDeclaration = {
    spec: base('investigationUpdate', 'version'),
    authorize,
    validate: (input) => validateExplorerInput('investigationUpdate', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const parsed = parseUpdate(input);
      if (!parsed.ok) throw new Error('action investigationUpdate: validate passed but parse failed');
      const { id, title, filters } = parsed.value;
      const row = await open(tx, actor, id);
      const version = await patchInvestigation(tx, actor.workspace_id, row.id, {
        ...(title !== undefined ? { title } : {}),
        ...(filters !== undefined ? { filters } : {}),
      });
      await audit.record(tx, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        event_type: 'explorer.investigation.updated',
        subject_type: 'investigation',
        subject_id: row.id,
        summary: 'log investigation updated',
        detail: {
          changed: [...(title !== undefined ? ['title'] : []), ...(filters !== undefined ? ['filters'] : [])],
          filterKeys: filters !== undefined ? Object.keys(filters) : [],
        },
      });
      return { data: { version: String(version) }, version: String(version) };
    },
  };

  const evidenceAdd: MenuActionDeclaration = {
    spec: base('evidenceAdd', 'version'),
    authorize,
    validate: (input) => validateExplorerInput('evidenceAdd', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const parsed = parseEvidenceAdd(input);
      if (!parsed.ok) throw new Error('action evidenceAdd: validate passed but parse failed');
      const row = await open(tx, actor, parsed.value.id);
      const next = addEvidence(storedEvidence(row.evidence), parsed.value.ref);
      if (!next.ok) throw invalid({ path: ['ref'], code: next.code });
      const version = await patchInvestigation(tx, actor.workspace_id, row.id, { evidence: next.evidence });
      await audit.record(tx, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        event_type: 'explorer.evidence.added',
        subject_type: 'investigation',
        subject_id: row.id,
        summary: 'log investigation evidence added',
        detail: { evidenceCount: next.evidence.length, noteLength: [...(parsed.value.ref.note ?? '')].length },
      });
      return { data: { version: String(version) }, version: String(version) };
    },
  };

  const evidenceRemove: MenuActionDeclaration = {
    spec: base('evidenceRemove', 'version'),
    authorize,
    validate: (input) => validateExplorerInput('evidenceRemove', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const parsed = parseEvidenceRemove(input);
      if (!parsed.ok) throw new Error('action evidenceRemove: validate passed but parse failed');
      const row = await open(tx, actor, parsed.value.id);
      const next = removeEvidence(storedEvidence(row.evidence), parsed.value.ref);
      if (!next.ok) throw invalid({ path: ['ref'], code: next.code });
      const version = await patchInvestigation(tx, actor.workspace_id, row.id, { evidence: next.evidence });
      await audit.record(tx, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        event_type: 'explorer.evidence.removed',
        subject_type: 'investigation',
        subject_id: row.id,
        summary: 'log investigation evidence removed',
        detail: { evidenceCount: next.evidence.length },
      });
      return { data: { version: String(version) }, version: String(version) };
    },
  };

  const archive: MenuActionDeclaration = {
    spec: base('investigationArchive', 'version'),
    authorize,
    validate: (input) => validateExplorerInput('investigationArchive', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const parsed = parseArchive(input);
      if (!parsed.ok) throw new Error('action investigationArchive: validate passed but parse failed');
      const row = await open(tx, actor, parsed.value.id);
      const version = await patchInvestigation(tx, actor.workspace_id, row.id, { status: 'archived' });
      await audit.record(tx, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        event_type: 'explorer.investigation.archived',
        subject_type: 'investigation',
        subject_id: row.id,
        summary: 'log investigation archived',
        detail: { evidenceCount: storedEvidence(row.evidence).length },
      });
      return { data: { version: String(version) }, version: String(version) };
    },
  };

  return [create, update, evidenceAdd, evidenceRemove, archive];
}
