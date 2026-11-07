// Who a call is counted against, and the daily body budget (design log-explorer §4.1). Pure rules over the `UsageStore` counters.
// A TOKEN call is counted against its token AND its Actor (so a second token of the same Actor cannot restart the budget) and is held to
// 50 MB of response bodies a day each. A SESSION call is only counted (for the admin usage read), never limited here.

import { TOKEN_DAILY_BODY_BUDGET_BYTES } from '@ap/contract-schemas';

import type { AuthContext } from '../../../lib/auth-context.js';
import type { UsageStore, UsageSubject } from '../usage-store.js';

export interface CallSubjects {
  /** Counted for the admin usage read: the token and the Actor of a token call, the Actor of a session call. */
  counted: UsageSubject[];
  /** Held to the daily body budget: a token call only. */
  budgeted: UsageSubject[];
}

export function subjectsOf(actorId: string, auth: AuthContext): CallSubjects {
  if (auth.kind === 'token') {
    const both: UsageSubject[] = [
      { kind: 'token', id: auth.tokenId },
      { kind: 'actor', id: actorId },
    ];
    return { counted: both, budgeted: both };
  }
  return { counted: [{ kind: 'session', id: actorId }], budgeted: [] };
}

/** True when one of the subjects has already used the whole day's body budget. */
export async function budgetSpent(store: UsageStore, workspaceId: string, subjects: readonly UsageSubject[]): Promise<boolean> {
  for (const subject of subjects) {
    if ((await store.get(workspaceId, subject, 'bytes')) >= TOKEN_DAILY_BODY_BUDGET_BYTES) return true;
  }
  return false;
}

/** A held reservation: the UTC day is pinned once, so every write and every refund of it meets the same counters even across midnight. */
export interface BodyReservation {
  day: string;
  subjects: readonly UsageSubject[];
  bytes: number;
}

/**
 * Takes `bytes` of the day's budget from every subject, all or nothing: null (and nothing kept) when any of them would pass the budget.
 * The body is only handed out after this answered a reservation, so an over-budget answer is refused whole, never cut.
 */
export async function reserveBody(store: UsageStore, workspaceId: string, subjects: readonly UsageSubject[], bytes: number): Promise<BodyReservation | null> {
  const day = store.today();
  const reservation: BodyReservation = { day, subjects, bytes };
  const taken: UsageSubject[] = [];
  for (const subject of subjects) {
    if (await store.add(workspaceId, subject, 'bytes', bytes, TOKEN_DAILY_BODY_BUDGET_BYTES, day)) taken.push(subject);
    else {
      await refundSubjects(store, workspaceId, taken, day, bytes);
      return null;
    }
  }
  return reservation;
}

/** Gives a reservation back, on the day it was taken. */
export const refundBody = (store: UsageStore, workspaceId: string, reservation: BodyReservation): Promise<void> =>
  refundSubjects(store, workspaceId, reservation.subjects, reservation.day, reservation.bytes);

async function refundSubjects(store: UsageStore, workspaceId: string, subjects: readonly UsageSubject[], day: string, bytes: number): Promise<void> {
  for (const subject of subjects) await store.add(workspaceId, subject, 'bytes', -bytes, undefined, day);
}
