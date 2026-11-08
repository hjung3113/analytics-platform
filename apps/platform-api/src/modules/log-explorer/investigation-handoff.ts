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
import { PLATFORM_SOURCE_LIMITS } from './domain/limits.js';
import {
  type HandoffInput,
  hashMismatchOf,
  parseHandoff,
  resolutionOf,
  selectStoredRefs,
} from './domain/handoff.js';
import type { EvidenceRef } from './domain/evidence-ref.js';
import { guardSourceReadPort } from './ports/guarded.js';
import type { SourceReadPort } from './ports/source-read.js';
import type { InvestigationRow } from './repositories/investigation-write.js';

export const EXPLORER_HANDOFF_PERMISSION = 'explorer.handoff';
export const EXPLORER_HANDOFF_MENU_PERMISSION = 'explorer:handoff';
export const EXPLORER_HANDOFF_INPUT_KEYS = ['id', 'refs', 'target'] as const;

/** Wall-clock cap of all Source existence checks of one handoff (the transaction is open meanwhile). */
export const HANDOFF_SOURCE_TOTAL_MS = 30_000;
const SOURCE_PARALLEL = 10;

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
  const port: SourceReadPort | null = handoff.sourceReadPort ? guardSourceReadPort(handoff.sourceReadPort) : null;

  const sampleSetOf = async (tx: Tx, row: InvestigationRow): Promise<SampleLike> => {
    const set =
      row.origin === 'round' && row.roundId !== null
        ? await deps.lifecycleRead.getRoundSampleSet(tx, row.workspaceId, row.roundId)
        : (row.sampleSet as SampleLike | null);
    if (!set) throw invalid({ path: ['roundId'], code: 'not_found' });
    return set;
  };

  /** One guarded existence check per ref; `null` = not known. The answer's rows are dropped on the spot. */
  async function resolveRefs(actor: PlatformActor, sourceOwner: string, refs: readonly EvidenceRef[]): Promise<boolean[]> {
    if (!(await handoff.sourceOwnerAccess.allows(actor, sourceOwner))) throw invalid({ path: ['refs'], code: 'source_forbidden' });
    if (port === null) throw invalid({ path: ['refs'], code: 'source_unavailable' });
    const controller = new AbortController();
    const startedAt = Date.now();
    const timer = setTimeout(() => controller.abort(), HANDOFF_SOURCE_TOTAL_MS);
    const out: boolean[] = [];
    try {
      for (let from = 0; from < refs.length; from += SOURCE_PARALLEL) {
        const batch = refs.slice(from, from + SOURCE_PARALLEL);
        const remaining = HANDOFF_SOURCE_TOTAL_MS - (Date.now() - startedAt);
        if (remaining <= 0) throw invalid({ path: ['refs'], code: 'source_unavailable' });
        const answers = await Promise.all(
          batch.map(async (ref): Promise<boolean | null> => {
            try {
              const answer = await port.getWindow(
                { sourceOwner, fileRef: ref.fileRef, line: ref.line, before: 0, after: 0 },
                { signal: controller.signal, timeBudgetMs: Math.min(PLATFORM_SOURCE_LIMITS.timeBudgetMs, remaining) },
              );
              return resolutionOf(answer.status);
            } catch {
              return null;
            }
          }),
        );
        for (const resolved of answers) {
          if (resolved === null) throw invalid({ path: ['refs'], code: 'source_unavailable' });
          out.push(resolved);
        }
      }
    } finally {
      clearTimeout(timer);
    }
    return out;
  }

  return {
    spec: shared.base('evidenceHandoff', EXPLORER_HANDOFF_INPUT_KEYS, EXPLORER_HANDOFF_MENU_PERMISSION),
    authorize: async (actor, tx) =>
      applyAdminModuleBypass(
        actor.role_level,
        EXPLORER_HANDOFF_PERMISSION,
        await deps.checkService.checkCapability(actor, EXPLORER_HANDOFF_PERMISSION, { workspace_id: actor.workspace_id }, { tx }),
      ).allow,
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

      const sample = await sampleSetOf(tx, row);
      const resolved = await resolveRefs(actor, sample.sourceOwner, refs);
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
