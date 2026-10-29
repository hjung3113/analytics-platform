// Request-shape and params judgment of `POST /api/v1/menu-query` (real-server-checklist §3 steps 1–2),
// DB-free. The server judges against its own copy of the endpoint declarations, never against the
// request: today exactly one endpoint is served, `home.notices` (ADR-0095 §1). Every other endpoint id
// is an `error`, not a proxy to a fake: analytical endpoints are NOT IMPLEMENTED here.

import { unsafeText } from '../platform-port/text-safety.js';

export const HOME_NOTICES_ENDPOINT = 'home.notices';

export type MenuQueryJudgment =
  | { ok: true; endpoint: typeof HOME_NOTICES_ENDPOINT; targetScopeId: string | null }
  | { ok: false; message: string };

const isPlain = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const onlyKeys = (value: Record<string, unknown>, allowed: readonly string[]) =>
  Object.keys(value).every((key) => allowed.includes(key)) &&
  allowed.every((key) => Object.hasOwn(value, key));

const fail = (message: string): MenuQueryJudgment => ({ ok: false, message });

export function judgeMenuQuery(body: unknown): MenuQueryJudgment {
  if (!isPlain(body) || !onlyKeys(body, ['endpoint', 'context', 'params'])) {
    return fail('Malformed menu query');
  }
  if (body.endpoint !== HOME_NOTICES_ENDPOINT) return fail('Unknown endpoint');
  // `home.notices` applies no Context key: any key, including `scopeId: null`, is outside the declaration.
  if (!isPlain(body.context) || Object.keys(body.context).length > 0) {
    return fail('home.notices applies no context');
  }
  const params = body.params;
  if (!isPlain(params) || !onlyKeys(params, ['targetScopeId'])) {
    return fail('home.notices takes only targetScopeId');
  }
  const target = params.targetScopeId;
  if (target !== null && (typeof target !== 'string' || unsafeText(target))) {
    return fail('targetScopeId must be a string or null');
  }
  return { ok: true, endpoint: HOME_NOTICES_ENDPOINT, targetScopeId: target };
}
