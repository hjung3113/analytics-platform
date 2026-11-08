// `logExplorer.evidenceHandoff` (#1474 X-h, design log-explorer §5.2): hands body-free evidence locations of the caller's own
// investigation to a validation Round or a knowledge draft. Right: `explorer.handoff` (workspace-scoped, menu permission
// `explorer:handoff`) plus the receiver's own capability, which the receiver judges again. The explorer never writes receiver
// tables: it calls the receiver's barrel service inside this action's transaction, so any refusal (a `MenuActionInvalidError`
// from the receiver, a Source refusal here) rolls everything back: the investigation is unchanged and no audit row exists.
//
// Source half of the `unresolved` judgment is the explorer's (receivers do not know the Source): per ref one guarded
// `getWindow(before 0, after 0)`. `ok` = resolved, `source_absent` = unresolved; anything else (denied, unsupported, error, timeout,
// no port configured) refuses `['refs'] source_unavailable` — an unknown state is never stored as «원본 없음». The window body is
// discarded at once: nothing from it is stored, returned or audited. Pointers only.

import type { Tx } from '../../db/tx.js';
import { viewerOf } from '../log-knowledge/index.js';
import { createAuditService } from '../core/audit/audit-service.js';
import {
  type ActionHandlerResult,
  type FieldError,
  type MenuActionDeclaration,
  MenuActionInvalidError,
} from '../menu-dispatch/types.js';
import { applyAdminModuleBypass } from '../permissions/check-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import type { HandoffDeps, InvestigationDeps } from './deps.js';
import { storedEvidence } from './domain/evidence.js';
import {
  type HandoffInput,
  hashMismatchOf,
  parseHandoff,
  selectStoredRefs,
} from './domain/handoff.js';
import { getOwned } from './repositories/investigation-read.js';
import type { InvestigationRow } from './repositories/investigation-write.js';

export const EXPLORER_HANDOFF_PERMISSION = 'explorer.handoff';
export const EXPLORER_HANDOFF_MENU_PERMISSION = 'explorer:handoff';
export const EXPLORER_HANDOFF_INPUT_KEYS = ['id', 'refs', 'target'] as const;

export { HANDOFF_SOURCE_TOTAL_MS } from './handoff-source.js';
import { resolveHandoffRefs } from './handoff-source.js';

const invalid = (...errors: FieldError[]) => new MenuActionInvalidError(errors);

interface SampleLike {
  sourceOwner: string;
  files: { fileRef: string; sha256: string }[];
}

/** What the investigation actions share with the handoff: the locked-own-row helpers and the declaration base. */
export interface HandoffShared {
  base: (id: string, inputKeys: readonly string[], permission: string) => MenuActionDeclaration['spec'];
  currentVersion: (tx: Tx, actor: PlatformActor, input: Record<string, unknown>) => Promise<string | null>;
  open: (tx: Tx, actor: PlatformActor, id: string) => Promise<InvestigationRow>;
}

export function evidenceHandoffAction(deps: InvestigationDeps, handoff: HandoffDeps, shared: HandoffShared): MenuActionDeclaration {
  const audit = createAuditService();

  const sampleSetOf = async (tx: Tx, row: InvestigationRow, actor: PlatformActor): Promise<SampleLike> => {
    const set =
      row.origin === 'round' && row.roundId !== null
        ? await deps.lifecycleRead.getRoundSampleSet(tx, row.workspaceId, row.roundId, viewerOf(actor))
        : (row.sampleSet as SampleLike | null);
    if (!set) throw invalid({ path: ['roundId'], code: 'not_found' });
    return set;
  };


  return {
    spec: shared.base('evidenceHandoff', EXPLORER_HANDOFF_INPUT_KEYS, EXPLORER_HANDOFF_MENU_PERMISSION),
    // Judged before an idempotency replay too, so the receiver's right is part of it: read from the raw input without throwing
    // (an unknown or missing kind adds nothing; `validate` refuses it later). Only the selected receiver's right is required.
    authorize: async (actor, tx, input) => {
      const own = applyAdminModuleBypass(
        actor.role_level,
        EXPLORER_HANDOFF_PERMISSION,
        await deps.checkService.checkCapability(actor, EXPLORER_HANDOFF_PERMISSION, { workspace_id: actor.workspace_id }, { tx }),
      ).allow;
      if (!own) return false;
      const target: unknown = input?.target;
      const kind = typeof target === 'object' && target !== null ? (target as { kind?: unknown }).kind : undefined;
      if (kind === 'round') return handoff.roundIntake.canAttach(tx, actor);
      if (kind === 'knowledgeDraft') return handoff.draftIntake.canIntake(tx, actor);
      return true;
    },
    async canReplay(tx, actor, input, saved) {
      const parsed = parseHandoff(input);
      if (!parsed.ok) return false;
      const row = await getOwned(tx, actor.workspace_id, actor.actor_id, parsed.value.id);
      if (!row) return false;
      if (row.origin === 'round' && (!row.roundId || !await deps.lifecycleRead.getRoundSampleSet(tx, row.workspaceId, row.roundId, viewerOf(actor)))) return false;
      const target = parsed.value.target;
      if (target.kind === 'round') return (await deps.lifecycleRead.getRoundSampleSet(tx, actor.workspace_id, target.roundId, viewerOf(actor))) !== null;
      // For create, judge the draft produced by the original request, not just the original owner input.
      const answer = saved.data as { targetId?: unknown } | null;
      const draftId = target.mode === 'append' ? target.draftId : answer?.targetId;
      return typeof draftId === 'string' && await handoff.draftIntake.canRead(tx, actor, draftId);
    },
    validate: (input) => {
      const parsed = parseHandoff(input);
      return parsed.ok ? [] : parsed.errors;
    },
    currentVersion: shared.currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const parsed = parseHandoff(input);
      if (!parsed.ok) throw new Error('action evidenceHandoff: validate passed but parse failed');
      const request: HandoffInput = parsed.value;
      const row = await shared.open(tx, actor, request.id);

      const selected = selectStoredRefs(request.refs, storedEvidence(row.evidence));
      if (!selected.ok) throw new MenuActionInvalidError(selected.errors);
      const refs = selected.value;

      // The receiver's right is a plain refusal before any Source work (the receiver judges it again inside).
      const target = request.target;
      const holds = target.kind === 'round' ? await handoff.roundIntake.canAttach(tx, actor) : await handoff.draftIntake.canIntake(tx, actor);
      if (!holds) throw invalid({ path: ['target'], code: 'forbidden' });

      const sample = await sampleSetOf(tx, row, actor);
      const resolved = await resolveHandoffRefs(handoff, actor, sample.sourceOwner, refs, tx);
      const resolvedCount = resolved.filter(Boolean).length;
      const origin = { kind: 'log_explorer' as const, id: row.id };
      const common = { refCount: refs.length, resolvedCount, unresolvedCount: refs.length - resolvedCount };

      let data: Record<string, unknown>;
      let detail: Record<string, unknown>;
      if (target.kind === 'round') {
        const result = await handoff.roundIntake.attach(tx, actor, {
          roundId: target.roundId,
          refs: refs.map((ref, i) => ({ ...ref, sourceResolved: resolved[i] ?? false })),
          origin,
        });
        data = { targetKind: 'round', targetId: target.roundId, handedOff: result.attached, alreadyAttached: result.alreadyAttached, byStatus: result.byStatus };
        detail = {
          targetKind: 'round',
          targetId: target.roundId,
          ...common,
          attached: result.attached,
          alreadyAttached: result.alreadyAttached,
          match: result.byStatus.match,
          hashMismatch: result.byStatus.hash_mismatch,
          unresolved: result.byStatus.unresolved,
        };
      } else {
        const pointers = refs.map((ref, i) => ({
          ...ref,
          sourceResolved: resolved[i] ?? false,
          hashMismatch: hashMismatchOf(ref, sample.files),
        }));
        const hashMismatchCount = pointers.filter((p) => p.hashMismatch).length;
        const result =
          target.mode === 'create'
            ? await handoff.draftIntake.create(tx, actor, {
                owner: target.owner,
                title: target.title,
                observation: target.observation,
                refs: pointers,
                sourceOwner: sample.sourceOwner,
                origin,
              })
            : await handoff.draftIntake.append(tx, actor, {
                draftId: target.draftId,
                expectedVersion: target.draftExpectedVersion,
                refs: pointers,
                sourceOwner: sample.sourceOwner,
                origin,
              });
        data = { targetKind: 'knowledgeDraft', targetId: result.draftId, handedOff: refs.length, draftVersion: result.version };
        detail = { targetKind: 'knowledgeDraft', targetId: result.draftId, ...common, hashMismatchCount };
      }

      await audit.record(tx, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        event_type: 'explorer.evidence_handed_off',
        subject_type: 'investigation',
        subject_id: row.id,
        summary: 'log investigation evidence locations handed off',
        detail,
      });
      // The investigation row is not modified: the version returned is the current one.
      return { data, version: String(row.rowVersion) };
    },
  };
}
