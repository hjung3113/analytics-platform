import {
  apiTokenPageSchema, issuedApiTokenSchema, revokedApiTokenSchema, listActorsResponseSchema,
  type ApiTokenItem, type IssueApiTokenInput,
} from '@ap/feature-shared';
import { apiRequest } from './client';
import { apiPath } from './path';

const path = (service: boolean) => `/api-tokens${service ? '/service' : ''}`;
export async function fetchApiTokens(service: boolean, cursor: string | undefined, noExpiry: boolean, signal: AbortSignal, kind?: 'personal' | 'service') {
  const query = new URLSearchParams({ limit: '25' });
  if (cursor) query.set('cursor', cursor);
  if (service && kind) query.set('kind', kind);
  if (service && noExpiry) query.set('noExpiry', 'true');
  return (await apiRequest('GET', `${path(service)}?${query}`, apiTokenPageSchema, { signal })).data;
}
/** Server page-size maximum of the token lists (`MAX_PAGE_SIZE`, platform-api `api-tokens/service.ts`). */
export const API_TOKEN_MAX_PAGE_SIZE = 200;
/** Hard bound on the pages {@link fetchAllServiceTokens} reads (2,000 tokens). */
export const SERVICE_TOKEN_DRAIN_PAGE_CAP = 10;
/** The service token list had more pages than {@link SERVICE_TOKEN_DRAIN_PAGE_CAP}: the result is incomplete. */
export class ServiceTokenDrainIncompleteError extends Error {
  constructor() { super('service token list exceeds the page cap'); this.name = 'ServiceTokenDrainIncompleteError'; }
}
/** Every service token of the workspace, independent of any list page or filter (#2013). Service tokens are the only
 * tokens a system Actor can own and use (personal tokens of a system Actor fail authentication), so `kind=service`
 * drops no relevant row. Throws {@link ServiceTokenDrainIncompleteError} when the cap is reached before the last page. */
export async function fetchAllServiceTokens(signal: AbortSignal) {
  const items: ApiTokenItem[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < SERVICE_TOKEN_DRAIN_PAGE_CAP; page += 1) {
    const query = new URLSearchParams({ limit: String(API_TOKEN_MAX_PAGE_SIZE), kind: 'service' });
    if (cursor) query.set('cursor', cursor);
    const data = (await apiRequest('GET', `${path(true)}?${query}`, apiTokenPageSchema, { signal })).data;
    items.push(...data.items);
    if (!data.nextCursor) return items;
    cursor = data.nextCursor;
  }
  throw new ServiceTokenDrainIncompleteError();
}
// Deliberately invoked from an event handler, never a query/mutation cache: this response contains a secret.
export async function issueApiToken(service: boolean, body: IssueApiTokenInput) {
  return (await apiRequest('POST', path(service), issuedApiTokenSchema, { body })).data;
}
export async function revokeApiToken(service: boolean, id: string) {
  return (await apiRequest('POST', `${path(service)}${apiPath`/${id}/revoke`}`, revokedApiTokenSchema)).data;
}
export async function fetchSystemActors(signal: AbortSignal) {
  return (await apiRequest('GET', '/actors?workspace=current&actorType=system', listActorsResponseSchema, { signal })).data.actors;
}
