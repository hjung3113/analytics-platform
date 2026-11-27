import { createRandom, id, type Random } from './random';

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
const MINUTES_PER_DAY = 24 * 60;
const DAY = MINUTES_PER_DAY * MINUTE;
const iso = (ms: number): string => new Date(ms).toISOString();

type Draft = { resource: number; start: number; end: number; objects: number[]; orphanLink?: number };

/**
 * The fixed counterexamples, events 1–5 before any random event, all on resource 1: two objects in one event, an
 * overlapping event that shares one of them, a nested event inside the first, an event crossing midnight, a
 * zero-length event, and a link to a missing event. They use objects 1–6 whatever `objects` says.
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

/** One random event from its own stream, every draw in a fixed order; a taken object moves on to the next free one. */
function randomDraft(random: Random, params: SharedResourceParams): Draft {
  const start = BASE + random.int(0, params.spanDays * MINUTES_PER_DAY - 1) * MINUTE;
  const end = start + random.int(0, 180) * MINUTE;
  const count = Math.min(params.objects, random.int(params.participantsPerEvent.min, params.participantsPerEvent.max));
  const objects = new Set<number>();
  for (let i = 0; i < count; i++) {
    let object = random.pick(params.objects, params.skew);
    while (objects.has(object)) object = (object + 1) % params.objects;
    objects.add(object);
  }
  const orphanObject = random.pick(params.objects, params.skew);
  const orphan = random.chance(params.unresolvedLinkRate);
  return { resource: random.pick(params.resources, params.skew), start, end, objects: [...objects].sort((a, b) => a - b), orphanLink: orphan ? orphanObject : undefined };
}

/**
 * Event by event: event `index` comes from its own stream (`seedText#index`), so it never depends on the events
 * before it. Unresolved references point past every event id the dataset uses.
 */
export function* sharedResourceRows(seedText: string, params: SharedResourceParams): Generator<{ events: EventRow[]; links: LinkRow[] }> {
  const fixed = counterexamples();
  const orphanBase = Math.max(900_000, params.events);
  for (let index = 0; index < params.events; index++) {
    const draft = fixed[index] ?? randomDraft(createRandom(`${seedText}#${index}`), params);
    const eventId = id('E', index + 1, 6);
    const links = draft.objects.map((object) => ({ eventId, objectKey: id('O', object + 1, 4) }));
    if (draft.orphanLink !== undefined) links.push({ eventId: id('E', orphanBase + index + 1, 6), objectKey: id('O', draft.orphanLink + 1, 4) });
    yield { events: [{ eventId, resourceKey: id('Q', draft.resource + 1, 2), startAt: iso(draft.start), endAt: iso(draft.end) }], links };
  }
}

export function generateSharedResource(seedText: string, params: SharedResourceParams): { events: EventRow[]; links: LinkRow[] } {
  const events: EventRow[] = [];
  const links: LinkRow[] = [];
  for (const part of sharedResourceRows(seedText, params)) {
    events.push(...part.events);
    links.push(...part.links);
  }
  return { events, links };
}
