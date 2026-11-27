import { createRandom, id } from './random';

/**
 * `shared-resource`: virtual physical events on shared resources, and the objects taking part in each, N:M through
 * an explicit link table only (#3204). Generic counterexamples only; no real schema, name or distribution. Grains: an
 * event row is one physical event on one resource; a link row is one (event, object) participation and may name an
 * event that does not exist (an unresolved relation).
 */
export type EventRow = { eventId: string; resourceKey: string; startAt: string; endAt: string };
export type LinkRow = { eventId: string; objectKey: string };

export type SharedResourceParams = {
  events: number;
  resources: number;
  objects: number;
  participantsPerEvent: { min: number; max: number };
  /** Bias of resource and object choice toward a few (0 = uniform). */
  skew: number;
  unresolvedLinkRate: number;
  spanDays: number;
};

/** Arbitrary test values, not measured from any real system. */
export const SHARED_RESOURCE_DEFAULTS: SharedResourceParams = {
  events: 40, resources: 4, objects: 12, participantsPerEvent: { min: 1, max: 3 }, skew: 1, unresolvedLinkRate: 0.05, spanDays: 7,
};

const BASE = Date.UTC(2030, 0, 1);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const iso = (ms: number): string => new Date(ms).toISOString();

type Draft = { resource: number; start: number; end: number; objects: number[]; orphanLink?: number };

/**
 * The fixed counterexamples, before any random event, all on resource 1: two objects in one event, an overlapping
 * event that shares one of them, a nested event inside the first, an event crossing midnight, a zero-length event,
 * and a link to a missing event.
 */
function counterexamples(): Draft[] {
  const day = BASE + DAY;
  return [
    { resource: 0, start: day + 60 * MINUTE, end: day + 120 * MINUTE, objects: [0, 1] },
    { resource: 0, start: day + 90 * MINUTE, end: day + 150 * MINUTE, objects: [1, 2] },
    { resource: 0, start: day + 70 * MINUTE, end: day + 80 * MINUTE, objects: [3] },
    { resource: 0, start: day + DAY - 15 * MINUTE, end: day + DAY + 15 * MINUTE, objects: [0] },
    { resource: 0, start: day + 2 * DAY, end: day + 2 * DAY, objects: [4], orphanLink: 5 },
  ];
}

export function generateSharedResource(seedText: string, params: SharedResourceParams): { events: EventRow[]; links: LinkRow[] } {
  const random = createRandom(seedText);
  const drafts = counterexamples();
  for (let i = drafts.length; i < params.events; i++) {
    const start = BASE + random.int(0, params.spanDays * DAY - 1);
    const count = Math.min(params.objects, random.int(params.participantsPerEvent.min, params.participantsPerEvent.max));
    const objects = new Set<number>();
    while (objects.size < count) objects.add(random.pick(params.objects, params.skew));
    const orphan = random.chance(params.unresolvedLinkRate) ? random.pick(params.objects, params.skew) : undefined;
    drafts.push({ resource: random.pick(params.resources, params.skew), start, end: start + random.int(0, 180) * MINUTE, objects: [...objects].sort((a, b) => a - b), orphanLink: orphan });
  }
  const events: EventRow[] = [];
  const links: LinkRow[] = [];
  drafts.slice(0, params.events).forEach((draft, index) => {
    const eventId = id('E', index + 1, 6);
    events.push({ eventId, resourceKey: id('Q', draft.resource + 1, 2), startAt: iso(draft.start), endAt: iso(draft.end) });
    for (const object of draft.objects) links.push({ eventId, objectKey: id('O', object + 1, 4) });
    // An unresolved reference points into a range no event id uses.
    if (draft.orphanLink !== undefined) links.push({ eventId: id('E', 900_000 + index + 1, 6), objectKey: id('O', draft.orphanLink + 1, 4) });
  });
  return { events, links };
}
