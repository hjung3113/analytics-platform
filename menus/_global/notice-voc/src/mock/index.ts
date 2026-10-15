/**
 * Mock server half of the my-VOC endpoints (#131; first shipped as adapter methods in #60). Registered by the app
 * composition root via `@ap/menu-notice-voc/mock`; pages never import this module. Not mart data (`mart: false`):
 * no Data Trust, and the mart dev scenarios (empty, partial, too_large, unknown_status) do not apply — the pinned
 * role's permission still outranks every scenario.
 */
import { defineMockEndpoint, MockRequestError, type AnyMockEndpoint, type RoleId } from '@ap/mock-server';
import { myVocHistoryEndpoint, mySurveyHistoryEndpoint, type MySurveyPage, type MyVocPage } from '../endpoints';
import { MY_VOC_PAGE_SIZE, MY_VOC_ROWS } from './fixtures';

/** Offset this token continues from, or null when it is not exactly a token the pinned role can continue. */
function cursorOffset(token: string, role: RoleId): number | null {
  const m = /^mock:([a-z]+):(\d+)$/.exec(token);
  // A token naming another actor is invalid, never rewound to page 1: it must not hand over their slice.
  if (!m || m[1] !== role) return null;
  // Accept only tokens the mock actually issues: nextCursor is always a full page past the served window,
  // so a valid continue point is a positive multiple of MY_VOC_PAGE_SIZE below the row count, written
  // canonically — `:0` would rewind to page 1, `:1` is off the page grid, and `:0002` was never issued.
  const digits = m[2];
  if (digits.length > 1 && digits.startsWith('0')) return null;
  const offset = Number(digits);
  return offset > 0 && offset % MY_VOC_PAGE_SIZE === 0 && offset < MY_VOC_ROWS[role].length ? offset : null;
}

export const noticeVocMock: readonly AnyMockEndpoint[] = [
  /**
   * The session actor's filed VOCs, newest openedAt first. Cursor, not offset: the client never sends
   * limit/sort/filter. An unknown, empty or other-actor cursor is outcome 'error', never page 1.
   */
  defineMockEndpoint(myVocHistoryEndpoint, {
    mart: false,
    handle: ({ params, actor }): MyVocPage => {
      const rows = MY_VOC_ROWS[actor];
      const offset = params.cursor === null ? 0 : cursorOffset(params.cursor, actor);
      if (offset === null) throw new MockRequestError('Invalid cursor');
      return {
        items: rows.slice(offset, offset + MY_VOC_PAGE_SIZE),
        nextCursor: offset + MY_VOC_PAGE_SIZE < rows.length ? `mock:${actor}:${offset + MY_VOC_PAGE_SIZE}` : null,
      };
    },
    isEmpty: page => page.items.length === 0,
  }),
  /** No FeedbackOps read of survey submissions exists yet: always the declared unknown assessment, never a row. */
  defineMockEndpoint(mySurveyHistoryEndpoint, {
    mart: false,
    handle: (): MySurveyPage => ({ items: [] }),
  }),
];
