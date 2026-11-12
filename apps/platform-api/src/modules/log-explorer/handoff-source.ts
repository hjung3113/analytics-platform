// Shared body-free Source existence checks. Reads pass no transaction; the action lifts only its own transaction's idle budget.
import type { SourceSampleSet } from '@ap/contract-schemas';
import { sql } from 'drizzle-orm';
import type { Tx } from '../../db/tx.js';
import { MenuActionInvalidError } from '../menu-dispatch/types.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import type { HandoffDeps } from './deps.js';
import type { EvidenceRef } from './domain/evidence-ref.js';
import { resolutionOf } from './domain/handoff.js';
import { PLATFORM_SOURCE_LIMITS } from './domain/limits.js';
import { guardSourceReadPort } from './ports/guarded.js';
/** Wall-clock cap of all Source existence checks of one handoff read or action. */
export const HANDOFF_SOURCE_TOTAL_MS = 30_000;
const SOURCE_PARALLEL = 10;
/** Headroom the transaction's idle budget keeps over the Source cap, so the Source budget always expires first. */
const IDLE_HEADROOM_MS = 15_000;

const invalid = (...errors: ConstructorParameters<typeof MenuActionInvalidError>[0]) => new MenuActionInvalidError(errors);
/** One guarded existence check per ref; `null` = not known. The answer's rows are dropped on the spot. */
export async function resolveHandoffRefs(handoff: HandoffDeps, actor: PlatformActor, sourceOwner: string, refs: readonly EvidenceRef[], tx?: Tx, signal?: AbortSignal, trustedSampleSet?: SourceSampleSet): Promise<boolean[]> {
  if (signal?.aborted) throw invalid({ path: ['refs'], code: 'source_unavailable' });
  const port = handoff.sourceReadPort ? guardSourceReadPort(handoff.sourceReadPort) : null;
  const totalMs = handoff.sourceTotalMs ?? HANDOFF_SOURCE_TOTAL_MS;
  if (!(await handoff.sourceOwnerAccess.allows(actor, sourceOwner))) throw invalid({ path: ['refs'], code: 'source_forbidden' });
  if (port === null) throw invalid({ path: ['refs'], code: 'source_unavailable' });
  // The transaction sits idle while the Source answers. The runtime pool's idle-in-transaction budget (default 30 s) may be
  // as short as the Source cap, and its clock started earlier: the DB would then cut the connection before the Source budget
  // expires and the answer would be a connection loss, not `refs: source_unavailable`. Lift it for this transaction only
  // (it ends with it) above the Source cap, so the Source budget always expires first.
  if (tx) await tx.execute(sql.raw(`SET LOCAL idle_in_transaction_session_timeout = ${Math.trunc(totalMs + IDLE_HEADROOM_MS)}`));
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) controller.abort();
  const startedAt = Date.now();
  const timer = setTimeout(() => controller.abort(), totalMs);
  const out: boolean[] = [];
  try {
    for (let from = 0; from < refs.length; from += SOURCE_PARALLEL) {
      const batch = refs.slice(from, from + SOURCE_PARALLEL);
      const remaining = totalMs - (Date.now() - startedAt);
      if (controller.signal.aborted || remaining <= 0) throw invalid({ path: ['refs'], code: 'source_unavailable' });
      const answers = await Promise.all(
        batch.map(async (ref): Promise<boolean | null> => {
          try {
            const answer = await port.getWindow(
              { sourceOwner, fileRef: ref.fileRef, line: ref.line, before: 0, after: 0 },
              { signal: controller.signal, timeBudgetMs: Math.min(PLATFORM_SOURCE_LIMITS.timeBudgetMs, remaining), ...(trustedSampleSet ? { trustedSampleSet } : {}) },
            );
            return resolutionOf(answer.status);
          } catch {
            return null;
          }
        }),
      );
      if (controller.signal.aborted) throw invalid({ path: ['refs'], code: 'source_unavailable' });
      for (const resolved of answers) {
        if (resolved === null) throw invalid({ path: ['refs'], code: 'source_unavailable' });
        out.push(resolved);
      }
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  return out;
}
