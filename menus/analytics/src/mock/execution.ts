/** Mock server handler for the execution-detail occurrence endpoint. */
import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';
import { CYCLE_SERIES_VERSIONS, isAnchor, OCCURRENCE_ENTITY_TYPES, occurrenceEndpoint } from '../endpoints';
import { lookupOccurrence } from './cycle';

export const executionOccurrence: AnyMockEndpoint = defineMockEndpoint(occurrenceEndpoint, {
  handle: ({ equipment, params }) => {
    // The identity is (equipmentId, entityType, anchor) (06 §22): an entityType the page cannot open
    // or a malformed anchor is missing — never another entity's occurrence.
    if (!OCCURRENCE_ENTITY_TYPES.includes(params.entityType) || !isAnchor(params.anchor)) return { access: 'missing' };
    return lookupOccurrence(equipment, params.equipmentId, params.anchor, params.metricVersion);
  },
  isEmpty: data => data.access === 'missing',
  metricVersion: ({ params }) => params.metricVersion,
  // 06 §6.1: the server checks the version belongs to the metric; an unknown one is an error, never a silent v3 (#123).
  validate: ({ params }) => (CYCLE_SERIES_VERSIONS.includes(params.metricVersion) ? null : `metricVersion ${params.metricVersion} is not a cycle_time version`),
});
