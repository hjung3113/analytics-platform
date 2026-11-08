// The receiving side of an evidence-location handoff to a validation round (#1474 X-h). A service function, not a menu
// action: the log explorer's handoff action calls `attach` inside its own transaction, so any refusal here (a
// `MenuActionInvalidError`) rolls the whole handoff back. This module re-judges everything itself: the actor's right
// `lifecycle.round.manage` (denied → `['target'] forbidden`, the only form a service can throw), the round (the actor's
// workspace, `open`), the input shape, and the status of each pointer. Pointers only: no excerpt, no body.
//
// Each pointer's `fileRef` must be in the round's `sample_set`. Status is decided here: `sourceResolved=false` → `unresolved`;
// else a `fileSha256` that differs from the sample set's → `hash_mismatch`; else `match`. A pointer already stored for the
// round (same fileRef, line, hash) is counted in `alreadyAttached` and not written again; its first status stays (append-only).
// `byStatus` counts the newly attached pointers. `seq` is gapless per round under the round row lock; one round holds at most
// 1000 pointers (`['refs'] round_full`). Audit `lifecycle.round.evidence_ref_attached` only when something was attached.

import { viewerOf } from '../log-knowledge/index.js';
import type { Tx } from '../../db/tx.js';
import { createAuditService } from '../core/audit/audit-service.js';
import { type FieldError, MenuActionInvalidError } from '../menu-dispatch/types.js';
import { type CheckService, applyAdminModuleBypass } from '../permissions/check-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import {
  type EvidenceRefOrigin,
  type EvidenceRefStatus,
  ROUND_EVIDENCE_REF_MAX,
  evidenceRefStatus,
  evidenceRefTripleKey,
  parseEvidenceRefOrigin,
  parseEvidenceRefs,
  sampleSetMisses,
} from './domain/evidence-ref-intake.js';
import type { RoundEvidenceRefInput } from './domain/evidence-ref-intake.js';
import { isUuid } from '../../lib/input/fields.js';
import { insertEvidenceRef, listStoredRefTriples, nextEvidenceRefSeq } from './repositories/evidence-ref-write.js';
import { lockRound } from './repositories/lifecycle-write.js';
import { LIFECYCLE_ROUND_PERMISSION } from './round-actions.js';
import type { SampleSet } from './domain/sample-set.js';

export interface RoundEvidenceRefIntakeDeps {
  checkService: CheckService;
}

export interface RoundEvidenceRefAttachInput {
  roundId: string;
  refs: readonly RoundEvidenceRefInput[];
  origin: { kind: 'log_explorer'; id: string };
}

export interface RoundEvidenceRefAttachResult {
  attached: number;
  alreadyAttached: number;
  /** The newly attached pointers by status. */
  byStatus: Record<EvidenceRefStatus, number>;
}

export interface RoundEvidenceRefIntake {
  attach(tx: Tx, actor: PlatformActor, input: RoundEvidenceRefAttachInput): Promise<RoundEvidenceRefAttachResult>;
  /** Whether the actor holds the receiving right (for the sender's own `authorize` pre-check); judges nothing else. */
  canAttach(tx: Tx, actor: PlatformActor): Promise<boolean>;
}

const invalid = (...errors: FieldError[]) => new MenuActionInvalidError(errors);

export function roundEvidenceRefIntake(deps: RoundEvidenceRefIntakeDeps): RoundEvidenceRefIntake {
  const audit = createAuditService();

  const canAttach = async (tx: Tx, actor: PlatformActor): Promise<boolean> =>
    applyAdminModuleBypass(
      actor.role_level,
      LIFECYCLE_ROUND_PERMISSION,
      await deps.checkService.checkCapability(actor, LIFECYCLE_ROUND_PERMISSION, { workspace_id: actor.workspace_id }, { tx }),
    ).allow;

  return {
    canAttach,
    async attach(tx, actor, input) {
      if (!(await canAttach(tx, actor))) throw invalid({ path: ['target'], code: 'forbidden' });
      const ws = actor.workspace_id;
      const errors: FieldError[] = [];
      const roundId = typeof input.roundId === 'string' && isUuid(input.roundId) ? input.roundId.toLowerCase() : null;
      if (!roundId) errors.push({ path: ['target', 'roundId'], code: input.roundId === undefined ? 'required' : 'malformed' });
      const refs = parseEvidenceRefs(input.refs);
      if (!refs.ok) errors.push(...refs.errors);
      const origin = parseEvidenceRefOrigin(input.origin);
      if (!origin.ok) errors.push(...origin.errors);
      if (errors.length > 0 || !roundId || !refs.ok || !origin.ok) throw new MenuActionInvalidError(errors);

      const round = await lockRound(tx, ws, roundId, viewerOf(actor));
      if (!round) throw invalid({ path: ['target', 'roundId'], code: 'not_found' });
      if (round.status !== 'open') throw invalid({ path: ['target', 'roundId'], code: 'round_closed' });

      const sampleSet = round.sampleSet as SampleSet;
      const misses = sampleSetMisses(refs.value, sampleSet);
      if (misses.length > 0) throw new MenuActionInvalidError(misses);

      const stored = await listStoredRefTriples(tx, ws, round.id);
      const storedKeys = new Set(stored.map(evidenceRefTripleKey));
      const fresh = refs.value.filter((ref) => !storedKeys.has(evidenceRefTripleKey(ref)));
      if (stored.length + fresh.length > ROUND_EVIDENCE_REF_MAX) throw invalid({ path: ['refs'], code: 'round_full' });

      const shaOf = new Map(sampleSet.files.map((f) => [f.fileRef, f.sha256]));
      const byStatus: Record<EvidenceRefStatus, number> = { match: 0, hash_mismatch: 0, unresolved: 0 };
      let seq = fresh.length > 0 ? await nextEvidenceRefSeq(tx, ws, round.id) : 0;
      let attached = 0;
      for (const ref of fresh) {
        const status = evidenceRefStatus(ref, shaOf.get(ref.fileRef) ?? '');
        const inserted = await insertEvidenceRef(tx, {
          workspaceId: ws,
          roundId: round.id,
          seq,
          fileRef: ref.fileRef,
          line: ref.line,
          fileSha256: ref.fileSha256,
          note: ref.note,
          status,
          originKind: origin.value.kind,
          originId: origin.value.id,
          handedOffBy: actor.actor_id,
        });
        if (!inserted) continue;
        seq += 1;
        attached += 1;
        byStatus[status] += 1;
      }
      const alreadyAttached = refs.value.length - attached;
      if (attached > 0) await recordAttached(tx, actor, round, { attached, alreadyAttached, byStatus }, origin.value);
      return { attached, alreadyAttached, byStatus };
    },
  };

  async function recordAttached(
    tx: Tx,
    actor: PlatformActor,
    round: { id: string; projectId: string; seq: number },
    counts: RoundEvidenceRefAttachResult,
    origin: EvidenceRefOrigin,
  ) {
    await audit.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: 'lifecycle.round.evidence_ref_attached',
      subject_type: 'validation_round',
      subject_id: round.id,
      summary: 'validation round evidence locations attached',
      detail: {
        projectId: round.projectId,
        seq: round.seq,
        attached: counts.attached,
        alreadyAttached: counts.alreadyAttached,
        match: counts.byStatus.match,
        hashMismatch: counts.byStatus.hash_mismatch,
        unresolved: counts.byStatus.unresolved,
        originKind: origin.kind,
        originId: origin.id,
      },
    });
  }
}
