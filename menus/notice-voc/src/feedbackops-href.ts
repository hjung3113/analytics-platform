/**
 * Platform → FeedbackOps deep-link builder wrapper (issue #60 §4). Fails closed: a missing origin is
 * `missing`, a rejected origin or id is `invalid` — never coerced (no lowercase, no added scheme, no
 * stripped path) and never thrown, so a bad env value must not break the screen or the app startup.
 */
import { ContractError, buildFeedbackOpsLink, type FeedbackOpsTarget } from '@ap/contracts';

export type FeedbackOpsHref = { ok: true; href: string } | { ok: false; reason: 'missing' | 'invalid' };

export function feedbackOpsHref(origin: string | null, target: FeedbackOpsTarget): FeedbackOpsHref {
  if (origin === null || origin === '') return { ok: false, reason: 'missing' };
  try {
    return { ok: true, href: buildFeedbackOpsLink({ origin, target }) };
  } catch (error) {
    if (error instanceof ContractError && (error.code === 'feedbackops_origin' || error.code === 'feedbackops_id')) {
      return { ok: false, reason: 'invalid' };
    }
    throw error;
  }
}
