// Legacy feature identity reader. The platform host owns login/logout.
// Per AGENTS.md the frontend never enforces backend permissions; these helpers
// only surface what the server says.

import { MeRequestError, type MeResponse } from './me';
import { UnauthenticatedError } from './unauthenticated';

// MeResponse and MeRequestError live in the bridge-safe `me.ts`; re-exported so every caller keeps this import path.
export { MeRequestError, type MeResponse, UnauthenticatedError };

export async function fetchMe(signal?: AbortSignal): Promise<MeResponse> {
  const init: RequestInit = { credentials: 'same-origin' };
  if (signal) init.signal = signal;
  const res = await fetch('/me', init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (!res.ok) throw new MeRequestError(res.status, res.headers.get('retry-after') ?? undefined);
  return (await res.json()) as MeResponse;
}
