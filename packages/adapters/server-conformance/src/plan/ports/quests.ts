import type { ApiResponse, Quest, QuestSearchPage } from '@ap/contracts';
import { QUEST_QUERY_MAX, QUEST_SEARCH_PAGE_SIZE_MAX } from '@ap/contracts';
import type { ConformanceCheck, ServerConformanceHarness } from '../../types';
import { assessmentProblem, describeResponse, missingEnvelopeKey } from '../../helpers';

const QUEST_KEYS = ['id', 'status', 'title'];
const PAGE_KEYS = ['hasMore', 'items', 'page', 'supported'];
const isPlain = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The envelope rules of a non-mart read: both keys present, trust null, assessments empty. */
function envelopeProblem(r: ApiResponse<unknown>, name: string): string | null {
  const missing = missingEnvelopeKey(r, 'assessments') ?? missingEnvelopeKey(r, 'trust');
  if (missing) return `${name}: ${missing}`;
  if (r.trust !== null || r.assessments.length > 0) return `${name}: Quests are not mart data — trust null, assessments []`;
  return assessmentProblem(r.assessments, r.outcome);
}
function questProblem(quest: unknown, name: string): string | null {
  if (!isPlain(quest) || JSON.stringify(Object.keys(quest).sort()) !== JSON.stringify(QUEST_KEYS)) return `${name}: a Quest carries exactly id, title, status`;
  if (![quest['id'], quest['title'], quest['status']].every(v => typeof v === 'string') || quest['id'] === '') return `${name}: a Quest has a non-empty id and string title and status`;
  return null;
}
function pageProblem(r: ApiResponse<QuestSearchPage>, name: string): string | null {
  if (r.outcome !== 'ok') return `${name}: expected ok, got ${describeResponse(r)}`;
  const envelope = envelopeProblem(r, name);
  if (envelope) return envelope;
  const page = r.data;
  if (!isPlain(page) || JSON.stringify(Object.keys(page).sort()) !== JSON.stringify(PAGE_KEYS)) return `${name}: data is exactly supported, items, page, hasMore`;
  if (typeof page.supported !== 'boolean' || typeof page.hasMore !== 'boolean' || !Number.isInteger(page.page) || page.page < 0 || !Array.isArray(page.items)) return `${name}: supported and hasMore are booleans, page an integer from 0, items an array`;
  for (const item of page.items) { const bad = questProblem(item, name); if (bad) return bad; }
  if (!page.supported && (page.items.length > 0 || page.hasMore)) return `${name}: an unsupported search has no items and no next page`;
  return null;
}

/**
 * Quest read-only port (#1328, ADR-0106). `not_found` is outcome `empty` with data null, `unavailable` is outcome `error`; search answers
 * `supported: false` for a BRAVO that cannot search, `supported: true` with no items for "no match", and `error` only for unavailable or bad input.
 * The checks that need a Quest the server really holds, a way to make it unavailable, or a way to make it unable to search take their fixture
 * from `ports.quests` and end as a run-time skip without it.
 */
export function planQuestChecks(harness: ServerConformanceHarness): ConformanceCheck[] {
  const { adapter } = harness;
  const unknownId = () => harness.ports.quests?.unknownId ?? `__conformance_unknown_quest_${crypto.randomUUID()}`;
  return [
    {
      id: 'port · getQuest answers a known Quest as ok with exactly id, title and status',
      uses: ['getQuest'],
      mode: 'granted',
      run: async () => {
        const known = harness.ports.quests?.knownId;
        if (known === undefined) return { skipped: 'ports.quests.knownId is not provided: no Quest the server holds, so an always-not_found getQuest cannot be told apart from a working one' };
        const r = await adapter.getQuest(known);
        if (r.outcome !== 'ok') return `getQuest(${known}): expected ok, got ${describeResponse(r)}`;
        const envelope = envelopeProblem(r, 'getQuest');
        if (envelope) return envelope;
        const bad = questProblem(r.data, 'getQuest');
        if (bad) return bad;
        if ((r.data as Quest).id !== known) return `getQuest(${known}) answered the Quest ${(r.data as Quest).id}`;
        return null;
      },
    },
    {
      id: 'port · getQuest of an unknown id is not_found: outcome empty with data null, nothing thrown',
      uses: ['getQuest'],
      mode: 'granted',
      run: async () => {
        const r = await adapter.getQuest(unknownId());
        if (r.outcome !== 'empty') return `getQuest(unknown): expected empty (not_found), got ${describeResponse(r)}`;
        if (r.data !== null) return 'getQuest(unknown): an empty answer carries no data';
        return envelopeProblem(r, 'getQuest(unknown)');
      },
    },
    {
      id: 'port · getQuest while BRAVO is unavailable is outcome error with data null, nothing thrown',
      uses: ['getQuest'],
      mode: 'granted',
      run: async () => {
        const id = harness.ports.quests?.unavailableId;
        if (id === undefined) return { skipped: 'ports.quests.unavailableId is not provided: no id that makes BRAVO unavailable, so the unavailable case cannot be exercised' };
        const r = await adapter.getQuest(id);
        if (r.outcome !== 'error') return `getQuest(${id}): expected error (unavailable), got ${describeResponse(r)}`;
        if (r.data !== null) return 'getQuest(unavailable): an error answer carries no data';
        return envelopeProblem(r, 'getQuest(unavailable)');
      },
    },
    {
      id: 'port · searchQuests pages: an exact page shape, at most pageSize items, a later page differs from the first',
      uses: ['searchQuests'],
      mode: 'granted',
      run: async () => {
        const first = await adapter.searchQuests({ page: 0, pageSize: 1 });
        const bad = pageProblem(first, 'searchQuests(page 0)');
        if (bad) return bad;
        if (first.data!.page !== 0) return `searchQuests(page 0) answered page ${first.data!.page}`;
        if (first.data!.items.length > 1) return 'searchQuests(pageSize 1) answered more than one item';
        if (!first.data!.supported) return null;
        if (!first.data!.hasMore) return null;
        const second = await adapter.searchQuests({ page: 1, pageSize: 1 });
        const secondBad = pageProblem(second, 'searchQuests(page 1)');
        if (secondBad) return secondBad;
        if (second.data!.page !== 1) return `searchQuests(page 1) answered page ${second.data!.page}`;
        if (second.data!.items[0]?.id === first.data!.items[0]?.id) return 'page 1 repeats page 0 — page is 0-based and moves forward';
        return null;
      },
    },
    {
      id: 'port · searchQuests with a query that matches nothing is ok with no items and no next page',
      uses: ['searchQuests'],
      mode: 'granted',
      run: async () => {
        const r = await adapter.searchQuests({ query: `__conformance_no_match_${crypto.randomUUID()}`, page: 0, pageSize: 5 });
        const bad = pageProblem(r, 'searchQuests(no match)');
        if (bad) return bad;
        if (r.data!.items.length > 0 || r.data!.hasMore) return 'a query that matches nothing returned items';
        return null;
      },
    },
    {
      id: 'port · searchQuests on a BRAVO that cannot search answers ok with supported false, not an error',
      uses: ['searchQuests'],
      mode: 'granted',
      run: async () => {
        const query = harness.ports.quests?.unsupportedQuery;
        if (query === undefined) return { skipped: 'ports.quests.unsupportedQuery is not provided: no query that makes the search unsupported, so the supported:false answer cannot be exercised' };
        const r = await adapter.searchQuests({ query, page: 0, pageSize: 5 });
        const bad = pageProblem(r, 'searchQuests(unsupported)');
        if (bad) return bad;
        if (r.data!.supported) return 'expected supported false for the unsupported fixture';
        return null;
      },
    },
    {
      id: 'port · searchQuests rejects an invalid query, page or page size as outcome error with data null',
      uses: ['searchQuests'],
      mode: 'granted',
      run: async () => {
        const attempts: [string, unknown][] = [
          ['a query over the limit', { query: 'x'.repeat(QUEST_QUERY_MAX + 1), page: 0, pageSize: 5 }],
          ['a negative page', { page: -1, pageSize: 5 }],
          ['page size 0', { page: 0, pageSize: 0 }],
          ['a page size over the limit', { page: 0, pageSize: QUEST_SEARCH_PAGE_SIZE_MAX + 1 }],
          ['an identity field', { page: 0, pageSize: 5, userId: 'someone-else' }],
        ];
        for (const [name, input] of attempts) {
          const r = await adapter.searchQuests(input as never);
          if (r.outcome !== 'error') return `${name}: expected error, got ${describeResponse(r)}`;
          if (r.data !== null) return `${name}: an error answer carries no data`;
        }
        return null;
      },
    },
  ];
}
