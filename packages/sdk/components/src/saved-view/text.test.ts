import { expect, it } from 'vitest';
import type { SavedView } from '@ap/contracts';
import { approvalText, contentLines, failureText, visibilityText } from './text';

const view: SavedView = {
  id: 'engineer|cycle-time|1', schemaVersion: 1, kind: 'menu-view', name: '일일 점검', ownerId: 'engineer', version: 1, updatedAt: 0,
  menuId: 'cycle-time', menuSchemaVersion: 1, context: { relativePeriod: { hours: 24 }, roomNames: ['PHOTO', 'ETCH'] },
  page: [], chartOptions: {}, layout: null, panels: null, visibility: { kind: 'private' }, approval: 'none',
};

it('uses the view picker wording for approval and share targets', () => {
  expect(approvalText('none', 'ko')).toBe('신청 안 함');
  expect(visibilityText({ kind: 'people', userIds: ['a', 'b'] }, 'ko')).toBe('사람 2명');
  expect(visibilityText({ kind: 'groups', groupIds: ['night', 'photo'] }, 'ko', { night: '야간조', photo: '포토팀' })).toBe('야간조, 포토팀');
});

it('uses the view picker context summary in saved view details', () => {
  expect(contentLines(view, text => text.ko, 'ko')).toEqual(['메뉴 뷰', '최근 24h (상대 기간)', '공정 2']);
});

it('provides the shared saved view failure sentence', () => {
  expect(failureText({ ok: false, reason: 'unavailable' }, text => text.ko)).toBe('지금은 저장할 수 없습니다. 입력은 그대로이니 다시 시도하세요.');
  expect(failureText({ ok: false, reason: 'conflict' }, text => text.en)).toBe('It changed elsewhere first. Your input is kept; refresh and save again.');
  expect(failureText({ ok: false, reason: 'forbidden' }, text => text.ko)).toBe('저장할 권한이 없습니다. 입력은 그대로입니다.');
  expect(failureText({ ok: false, reason: 'invalid' }, text => text.en)).toBe('This content cannot be saved. Your input is kept.');
});

it('shows stored date-only period endpoints as written instead of throwing', () => {
  const dateOnly = { ...view, context: { from: '2026-10-01', to: '2026-10-07' } };
  expect(contentLines(dateOnly, text => text.ko, 'ko')).toEqual(['메뉴 뷰', '고정 기간 2026-10-01 → 2026-10-07']);
});
