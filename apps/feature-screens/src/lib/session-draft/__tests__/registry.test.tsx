import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { noticeHost, noticeMessages, registerNoticeHost } from '@/test/notice-host';
import {
  SESSION_DRAFT_TTL_MS,
  beginSessionDraftOwner,
  discardSessionDraft,
  registerSessionDraft,
  resetSessionDraftsForTests,
  snapshotSessionDrafts,
  takeSessionDraft,
} from '../registry';
import { draftRecord, draftString, useSessionDraft } from '../useSessionDraft';

const draftKeys = () => Object.keys(sessionStorage).filter((key) => key.startsWith('draft:')).sort();

beforeAll(registerNoticeHost);
beforeEach(() => {
  sessionStorage.clear();
  resetSessionDraftsForTests();
  noticeHost.notify.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  sessionStorage.clear();
});

describe('session draft registry', () => {
  it('stores nothing until a snapshot; a snapshot stores each registered draft under the user id', () => {
    registerSessionDraft('a', () => 'one');
    registerSessionDraft('b', () => ({ text: 'two' }));
    registerSessionDraft('empty', () => null);
    expect(draftKeys()).toEqual([]);
    snapshotSessionDrafts('u1');
    expect(draftKeys()).toEqual(['draft:u1:a', 'draft:u1:b']);
  });

  it('snapshots in registration order: a later registration of the same key wins', () => {
    const order: string[] = [];
    registerSessionDraft('k', () => { order.push('first'); return 'first'; });
    registerSessionDraft('k', () => { order.push('second'); return 'second'; });
    snapshotSessionDrafts('u1');
    expect(order).toEqual(['first', 'second']);
    beginSessionDraftOwner('u1');
    expect(takeSessionDraft('k')).toBe('second');
  });

  it('an unregistered draft is never snapshotted', () => {
    const unregister = registerSessionDraft('k', () => 'gone');
    unregister();
    snapshotSessionDrafts('u1');
    expect(draftKeys()).toEqual([]);
  });

  it('without a user nothing is stored', () => {
    registerSessionDraft('k', () => 'text');
    snapshotSessionDrafts(null);
    expect(draftKeys()).toEqual([]);
  });

  it('the same user takes the draft once; another user\'s session deletes it unread', () => {
    registerSessionDraft('k', () => 'text');
    snapshotSessionDrafts('u1');
    beginSessionDraftOwner('u1');
    expect(takeSessionDraft('k')).toBe('text');
    expect(takeSessionDraft('k')).toBeNull();

    snapshotSessionDrafts('u1');
    beginSessionDraftOwner('u2');
    expect(draftKeys()).toEqual([]);
    expect(takeSessionDraft('k')).toBeNull();
  });

  it('a draft older than the TTL is deleted unread', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    registerSessionDraft('k', () => 'text');
    snapshotSessionDrafts('u1');
    vi.setSystemTime(Date.now() + SESSION_DRAFT_TTL_MS + 1);
    beginSessionDraftOwner('u1');
    expect(draftKeys()).toEqual([]);
    expect(takeSessionDraft('k')).toBeNull();
  });

  it('discard deletes the current owner\'s draft', () => {
    registerSessionDraft('k', () => 'text');
    snapshotSessionDrafts('u1');
    beginSessionDraftOwner('u1');
    discardSessionDraft('k');
    expect(draftKeys()).toEqual([]);
  });

  it('a throwing storage never throws out of the registry', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    registerSessionDraft('k', () => 'text');
    expect(() => snapshotSessionDrafts('u1')).not.toThrow();
    expect(() => beginSessionDraftOwner('u1')).not.toThrow();
    expect(takeSessionDraft('k')).toBeNull();
    expect(() => discardSessionDraft('k')).not.toThrow();
  });
});

function Form({ initial = '' }: { initial?: string }) {
  const [text, setText] = useState(initial);
  useSessionDraft({
    key: 'form',
    read: () => (text === '' ? null : { text }),
    parse: (value) => {
      const record = draftRecord(value);
      return record === null ? null : draftString(record, 'text');
    },
    restore: setText,
  });
  return <input aria-label="text" value={text} onChange={(event) => setText(event.target.value)} />;
}

describe('useSessionDraft', () => {
  it('registers the latest value while mounted and leaves nothing registered after unmount', () => {
    const view = render(<Form initial="typed" />);
    snapshotSessionDrafts('u1');
    expect(draftKeys()).toEqual(['draft:u1:form']);
    sessionStorage.clear();
    view.unmount();
    snapshotSessionDrafts('u1');
    expect(draftKeys()).toEqual([]);
  });

  it('restores the same user\'s draft on mount, deletes it and shows the notice once', () => {
    const first = render(<Form initial="kept text" />);
    snapshotSessionDrafts('u1');
    first.unmount();
    beginSessionDraftOwner('u1');
    const second = render(<Form />);
    expect((second.getByLabelText('text') as HTMLInputElement).value).toBe('kept text');
    expect(draftKeys()).toEqual([]);
    expect(noticeMessages('info')).toEqual(['세션이 만료되어 작성 중이던 내용을 복원했습니다']);
  });

  it('a form still works when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    beginSessionDraftOwner('u1');
    const view = render(<Form initial="typed" />);
    act(() => snapshotSessionDrafts('u1'));
    expect((view.getByLabelText('text') as HTMLInputElement).value).toBe('typed');
    expect(noticeHost.notify).not.toHaveBeenCalled();
  });
});
