/** Mock server handler for the execution-detail occurrence endpoint. */
import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';
import { occurrenceEndpoint } from '../endpoints';
import { lookupOccurrence } from '../pages/cycleData';

export const executionOccurrence: AnyMockEndpoint = defineMockEndpoint(occurrenceEndpoint, {
  handle: ({ equipment, params }) => lookupOccurrence(equipment, params.equipmentId, params.anchor, params.metricVersion),
  isEmpty: data => data.access === 'missing',
  metricVersion: ({ params }) => params.metricVersion,
});
