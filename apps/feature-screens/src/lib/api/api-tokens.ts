import {
  apiTokenPageSchema, issuedApiTokenSchema, revokedApiTokenSchema, listActorsResponseSchema,
  type IssueApiTokenInput,
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
