// The receiving side of an evidence-location handoff to a knowledge draft (#1474 X-h). Service functions, not menu actions: the
// log explorer's handoff action calls them inside its own transaction, so any refusal (a `MenuActionInvalidError`) rolls the whole
// handoff back. The receiver re-judges everything: the actor's right `knowledge.draft.create` (denied → `['target'] forbidden`, the
// only form a service can throw), the owner / subject checks and the author-only rule (the draft cores shared with the draft
// actions, `draft-core.ts`), the input shape and the pointers. Pointers only: no excerpt, no body.
//
//  - `create`: a new `needs_check` draft (status `draft`, author only) from the title and observation a person wrote in the handoff
//    dialog, the owner (model | software version) and the pointers. Item content rules apply (`['title']`, `['observation']`).
//  - `append`: a new revision of the caller's own, not-final draft with the pointers added (de-duplicated by `(sourceRef, locator,
//    contentHash)`); `expectedVersion` is the draft's row version (a mismatch is `['expectedVersion'] conflict`); a draft the caller
//    cannot see is `['target','draftId'] not_found`, one visible but not theirs `forbidden_not_author`, a final one `illegal_transition`.
//  - Pointer mapping and the `[해시 불일치]` marker: `domain/evidence-intake.ts`. `sourceResolved=false` is refused, nothing written.
//  - Audit: the existing `knowledge.draft.created` / `knowledge.draft.updated` with one extra detail key `handoff`.

import type { Tx } from '../../db/tx.js';
import { isUuid } from '../../lib/input/fields.js';
import { findWorkspaceActor } from '../auth/index.js';
import { type FieldError, MenuActionInvalidError } from '../menu-dispatch/types.js';
import { type CheckService, applyAdminModuleBypass } from '../permissions/check-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import { parseProposal } from './domain/draft-input.js';
import { isFinalDraftStatus } from './domain/draft-transitions.js';
import {
  type DraftEvidenceOrigin,
  type DraftEvidenceRefInput,
  mergePointers,
  pointerKey,
  parseDraftEvidenceOrigin,
  parseDraftEvidenceRefs,
  parseSourceOwner,
} from './domain/evidence-intake.js';
import { EVIDENCE_MAX, type EvidencePointer } from './domain/item-input.js';
import { DRAFT_PERMISSION } from './draft-actions.js';
import { authorAuthNow, draftCores } from './draft-core.js';
import { latestProposal } from './repositories/draft-write.js';

export interface DraftEvidenceIntakeDeps {
  checkService: CheckService;
}

export interface DraftEvidenceCreateInput {
  owner: { modelId: string } | { softwareId: string };
  title: string;
  observation: string;
  refs: readonly DraftEvidenceRefInput[];
  sourceOwner: string;
  origin: { kind: 'log_explorer'; id: string };
}

export interface DraftEvidenceAppendInput {
  draftId: string;
  expectedVersion: string;
  refs: readonly DraftEvidenceRefInput[];
  sourceOwner: string;
  origin: { kind: 'log_explorer'; id: string };
}

export interface DraftEvidenceResult {
  draftId: string;
  /** The draft's row version after the call (the next `expectedVersion`). */
  version: string;
  payloadDigest: string;
}

export interface DraftEvidenceIntake {
  create(tx: Tx, actor: PlatformActor, input: DraftEvidenceCreateInput): Promise<DraftEvidenceResult>;
  append(tx: Tx, actor: PlatformActor, input: DraftEvidenceAppendInput): Promise<DraftEvidenceResult>;
  /** Whether the actor holds the receiving right (for the sender's own `authorize` pre-check); judges nothing else. */
  canIntake(tx: Tx, actor: PlatformActor): Promise<boolean>;
}

const invalid = (...errors: FieldError[]) => new MenuActionInvalidError(errors);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The cores speak in action paths (`['proposal', …]`, `['id']`); the intake speaks in its own input (`['target', …]`, `['title']`). */
function remap(errors: readonly FieldError[]): FieldError[] {
  return errors.map((e) => {
    const [head, second, ...rest] = e.path;
    if (head === 'id') return { path: ['target', 'draftId', ...(second ? [second, ...rest] : [])], code: e.code };
    if (head !== 'proposal') return e;
    if (second === 'ownerModelId') return { path: ['target', 'modelId'], code: e.code };
    if (second === 'ownerSoftwareId') return { path: ['target', 'softwareId'], code: e.code };
    return { path: [second ?? 'proposal', ...rest], code: e.code };
  });
}

const POINTER_FIELD: Readonly<Record<string, string>> = { sourceRef: 'fileRef', contentHash: 'fileSha256', locator: 'line', note: 'note' };

/**
 * Maps the proposal parser's `evidence.<k>.<field>` errors back to the caller's `refs.<i>.<field>`; `originOf[k]` is the index of
 * `refs` that produced evidence `k` (`null` for a pointer already stored in the draft: reported at `['refs']`).
 */
function pointerErrors(errors: readonly FieldError[], originOf: readonly (number | null)[]): FieldError[] {
  return errors.map((e) => {
    if (e.path[0] !== 'evidence') return e;
    const k = Number(e.path[1]);
    const i = originOf[k];
    if (e.path[1] === undefined || !Number.isInteger(k)) return { path: ['refs'], code: e.code };
    if (i === undefined || i === null) return { path: ['refs'], code: e.code };
    const field = e.path[2] === undefined ? undefined : POINTER_FIELD[e.path[2]];
    return { path: field ? ['refs', String(i), field] : ['refs', String(i)], code: e.code };
  });
}

async function remapped<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof MenuActionInvalidError) throw new MenuActionInvalidError(remap(error.fieldErrors));
    throw error;
  }
}

function parseOwner(raw: unknown): { ok: true; value: { ownerModelId: string } | { ownerSoftwareId: string } } | { ok: false; errors: FieldError[] } {
  if (raw === undefined || raw === null) return { ok: false, errors: [{ path: ['owner'], code: 'required' }] };
  if (!isRecord(raw)) return { ok: false, errors: [{ path: ['owner'], code: 'malformed' }] };
  const errors: FieldError[] = [];
  for (const key of Object.keys(raw)) if (key !== 'modelId' && key !== 'softwareId') errors.push({ path: ['owner', key], code: 'malformed' });
  const hasModel = raw.modelId !== undefined && raw.modelId !== null;
  const hasSoftware = raw.softwareId !== undefined && raw.softwareId !== null;
  if (hasModel === hasSoftware) errors.push({ path: ['owner'], code: 'required_one' });
  const field = hasModel ? 'modelId' : 'softwareId';
  const value = raw[field];
  if ((hasModel || hasSoftware) && (typeof value !== 'string' || !isUuid(value))) errors.push({ path: ['owner', field], code: 'malformed' });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: hasModel ? { ownerModelId: (value as string).toLowerCase() } : { ownerSoftwareId: (value as string).toLowerCase() } };
}

export function draftEvidenceIntake(deps: DraftEvidenceIntakeDeps): DraftEvidenceIntake {
  const core = draftCores(deps);

  const canIntake = async (tx: Tx, actor: PlatformActor): Promise<boolean> =>
    applyAdminModuleBypass(
      actor.role_level,
      DRAFT_PERMISSION,
      await deps.checkService.checkCapability(actor, DRAFT_PERMISSION, { workspace_id: actor.workspace_id }, { tx }),
    ).allow;

  const handoffOf = (origin: DraftEvidenceOrigin, refCount: number) => ({ originKind: origin.kind, originId: origin.id, refCount });

  /** Shape of the pointers, the source owner and the origin; all errors at once. */
  function parseCommon(input: { refs: unknown; sourceOwner: unknown; origin: unknown }, errors: FieldError[]) {
    const owner = parseSourceOwner(input.sourceOwner);
    if (!owner.ok) errors.push(...owner.errors);
    const origin = parseDraftEvidenceOrigin(input.origin);
    if (!origin.ok) errors.push(...origin.errors);
    // Without a valid source owner the pointers cannot be built; their shape is still judged with a placeholder.
    const refs = parseDraftEvidenceRefs(input.refs, owner.ok ? owner.value : '-');
    if (!refs.ok) errors.push(...refs.errors);
    return { origin: origin.ok ? origin.value : null, pointers: refs.ok ? refs.value : null };
  }

  return {
    canIntake,

    async create(tx, actor, input) {
      if (!(await canIntake(tx, actor))) throw invalid({ path: ['target'], code: 'forbidden' });
      const errors: FieldError[] = [];
      const owner = parseOwner(input.owner);
      if (!owner.ok) errors.push(...owner.errors.map((e) => ({ ...e, path: e.path[0] === 'owner' ? ['target', ...e.path.slice(1)] : e.path })));
      const { origin, pointers } = parseCommon(input, errors);
      const draft = owner.ok
        ? parseProposal('create', {
            ...owner.value,
            typeCode: 'needs_check',
            title: input.title,
            observation: input.observation,
            evidence: pointers ?? [],
          })
        : null;
      if (draft && !draft.ok) {
        // Without valid pointers the evidence list is a placeholder: its errors are not the caller's.
        const own = remap(draft.errors);
        errors.push(...(pointers ? pointerErrors(own, pointers.map((_, i) => i)) : own.filter((e) => e.path[0] !== 'evidence')));
      }
      if (errors.length > 0 || !owner.ok || !origin || !pointers || !draft || !draft.ok) throw new MenuActionInvalidError(errors);
      const proposal = draft;
      const authKind = authorAuthNow();
      const found = await findWorkspaceActor(tx, { workspaceId: actor.workspace_id, actorId: actor.actor_id });
      const result = await remapped(() =>
        core.createDraft(tx, actor, {
          proposalType: 'create',
          targetItemId: null,
          proposal: proposal.value,
          authKind,
          actorType: found?.actor_type ?? '',
          validatorRef: undefined,
          handoff: handoffOf(origin, pointers.length),
        }),
      );
      return toResult(result);
    },

    async append(tx, actor, input) {
      if (!(await canIntake(tx, actor))) throw invalid({ path: ['target'], code: 'forbidden' });
      const errors: FieldError[] = [];
      if (input.draftId === undefined || input.draftId === null) errors.push({ path: ['target', 'draftId'], code: 'required' });
      else if (typeof input.draftId !== 'string' || !isUuid(input.draftId)) errors.push({ path: ['target', 'draftId'], code: 'malformed' });
      if (input.expectedVersion === undefined || input.expectedVersion === null || input.expectedVersion === '') errors.push({ path: ['expectedVersion'], code: 'required' });
      else if (typeof input.expectedVersion !== 'string') errors.push({ path: ['expectedVersion'], code: 'malformed' });
      const { origin, pointers } = parseCommon(input, errors);
      if (errors.length > 0 || !origin || !pointers) throw new MenuActionInvalidError(errors);

      const ws = actor.workspace_id;
      return remapped(async () => {
        // Visibility and authorship are judged BEFORE the version (the draft cores' rule): a stranger learns no version.
        const before = await core.lockOwn(tx, actor, input.draftId.toLowerCase());
        if (!before) throw invalid({ path: ['id'], code: 'not_found' });
        if (String(before.rowVersion) !== input.expectedVersion) throw invalid({ path: ['expectedVersion'], code: 'conflict' });
        if (isFinalDraftStatus(before.status)) throw invalid({ path: ['id'], code: 'illegal_transition' });
        const latest = (await latestProposal(tx, ws, before)) as { evidence?: EvidencePointer[] } & Record<string, unknown>;
        const stored = latest.evidence ?? [];
        const { merged } = mergePointers(stored, pointers);
        if (merged.length > EVIDENCE_MAX) throw invalid({ path: ['refs'], code: 'too_many' });
        const parsed = parseProposal(before.proposalType as 'create' | 'revise', { ...latest, evidence: merged });
        if (!parsed.ok) {
          // merged = stored pointers, then the new incoming ones in order (a repeat is not added again).
          const seen = new Set(stored.map(pointerKey));
          const originOf: (number | null)[] = stored.map(() => null);
          pointers.forEach((p, i) => {
            if (seen.has(pointerKey(p))) return;
            seen.add(pointerKey(p));
            originOf.push(i);
          });
          throw new MenuActionInvalidError(pointerErrors(parsed.errors, originOf));
        }
        return toResult(await core.updateDraft(tx, actor, before, parsed.value, handoffOf(origin, pointers.length)));
      });
    },
  };
}

function toResult(answer: { data: unknown; version: string | null }): DraftEvidenceResult {
  const data = answer.data as { id: string; payloadDigest: string };
  return { draftId: data.id, version: answer.version ?? '', payloadDigest: data.payloadDigest };
}
