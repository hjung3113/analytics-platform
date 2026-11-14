import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  APPROVAL_TRANSITIONS,
  canTransition,
  validateSavedView,
  type DeniedSavedView,
  type GroupMember,
  type MigrateResult,
  type Result,
  type SavedView,
  type SavedViewEntry,
  type SavedViewPatch,
  type SavedViewStore,
  type SavedViewSupport,
  type ViewApproval,
} from '@ap/contracts';

const conditionSet = { schemaVersion: 1, kind: 'condition-set', name: '야간 A동', context: { from: '2026-10-01T00:00:00', to: '2026-10-02T00:00:00', lineNames: ['L1'] } };
const menuView = {
  schemaVersion: 1,
  kind: 'menu-view',
  name: '생산성 보기',
  menuId: 'productivity',
  menuSchemaVersion: 3,
  context: { relativePeriod: { hours: 24 } },
  page: [['grain', 'hour']],
  chartOptions: { stacked: true },
  layout: { split: [1, 2] },
  panels: { anything: 1 },
};

describe('validateSavedView (21.1 두 저장 단위)', () => {
  it.each([['조건 세트', conditionSet], ['메뉴 뷰', menuView]])('%s 통과', (_n, input) => {
    expect(validateSavedView(input).ok).toBe(true);
  });

  it.each(['page', 'chartOptions', 'layout', 'panels'])('조건 세트에 %s가 있으면 거부', key => {
    expect(validateSavedView({ ...conditionSet, [key]: {} })).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it.each(['menuId', 'menuSchemaVersion', 'page', 'chartOptions', 'layout', 'panels'])('메뉴 뷰에 %s가 없으면 거부', key => {
    const { [key]: _omit, ...rest } = menuView as Record<string, unknown>;
    expect(validateSavedView(rest).ok).toBe(false);
  });

  it.each([
    ['알 수 없는 schemaVersion', { ...conditionSet, schemaVersion: 2 }],
    ['알 수 없는 kind', { ...conditionSet, kind: 'board' }],
    ['빈 이름', { ...conditionSet, name: '' }],
    ['공백만 있는 이름', { ...conditionSet, name: '  \t ' }],
    ['객체가 아님', 'view'],
  ])('%s 거부', (_n, input) => {
    expect(validateSavedView(input).ok).toBe(false);
  });

  it.each(['hover', 'hoverPoint', 'zoom', 'zoomRange', 'modalOpen', 'openModal', 'draftName', 'draftContext', 'rows', 'rawData', 'dockview', 'engineState'])(
    '저장하면 안 되는 키 %s는 최상위·chartOptions·layout 어디서든 거부',
    key => {
      expect(validateSavedView({ ...menuView, [key]: 1 }).ok).toBe(false);
      expect(validateSavedView({ ...menuView, chartOptions: { [key]: 1 } }).ok).toBe(false);
      expect(validateSavedView({ ...menuView, layout: { nested: [{ [key]: 1 }] } }).ok).toBe(false);
      expect(validateSavedView({ ...conditionSet, context: { [key]: 1 } }).ok).toBe(false);
    },
  );

  it('도킹 엔진 접두 키를 거부한다', () => {
    for (const key of ['dockLayout', 'dock_state', 'DockLayout']) {
      expect(validateSavedView({ ...menuView, chartOptions: { [key]: 1 } }).ok).toBe(false);
    }
  });

  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  it.each([
    ['함수', () => 1],
    ['undefined', undefined],
    ['순환', cycle],
    ['NaN', Number.NaN],
    ['Date', new Date(0)],
  ])('직렬화 불가능한 %s는 chartOptions·panels 모두에서 거부', (_n, value) => {
    expect(validateSavedView({ ...menuView, chartOptions: { x: value } }).ok).toBe(false);
    expect(validateSavedView({ ...menuView, panels: { x: value } }).ok).toBe(false);
  });

  it.each([['문자열', 'x'], ['null', null], ['배열', [1, [2]]], ['엔진 이름 키를 가진 객체', { rows: [1], hover: 2 }]])('panels는 불투명: %s 통과', (_n, panels) => {
    expect(validateSavedView({ ...menuView, panels }).ok).toBe(true);
  });
});

describe('canTransition (승인 상태 전이표)', () => {
  const table: [ViewApproval, 'request' | 'approve' | 'reject' | 'revoke', boolean][] = [
    ['none', 'request', true], ['rejected', 'request', true], ['pending', 'request', false], ['approved', 'request', false],
    ['pending', 'approve', true], ['none', 'approve', false], ['approved', 'approve', false], ['rejected', 'approve', false],
    ['pending', 'reject', true], ['none', 'reject', false], ['approved', 'reject', false],
    ['approved', 'revoke', true], ['none', 'revoke', false], ['pending', 'revoke', false], ['rejected', 'revoke', false],
  ];
  it.each(table)('%s + %s -> %s', (approval, action, expected) => {
    expect(canTransition(approval, action)).toBe(expected);
  });
  it('승인 신청은 visibility를 입력으로 받지 않는다', () => {
    expectTypeOf(canTransition).parameters.toEqualTypeOf<[ViewApproval, 'request' | 'approve' | 'reject' | 'revoke']>();
    expectTypeOf<SavedViewStore['requestOfficial']>().parameters.toEqualTypeOf<[string, { expectedVersion: number }]>();
  });
});

const FORBIDDEN = ['hover', 'hoverPoint', 'zoom', 'zoomRange', 'modalOpen', 'openModal', 'draftName', 'draftContext', 'rows', 'rawData', 'dockview', 'engineState'];

describe('validateSavedView page 논리 키 (C1)', () => {
  it.each(FORBIDDEN)('금지 키 %s는 Pair[]·Record 두 표현 모두 거부', key => {
    expect(validateSavedView({ ...menuView, page: [[key, 'x']] })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(validateSavedView({ ...menuView, page: { [key]: ['x'] } })).toMatchObject({ ok: false, reason: 'invalid' });
  });
  it('정상 키 drillRoom은 두 표현 모두 통과', () => {
    expect(validateSavedView({ ...menuView, page: [['drillRoom', 'R1']] }).ok).toBe(true);
    expect(validateSavedView({ ...menuView, page: { drillRoom: ['R1'] } }).ok).toBe(true);
  });
  it.each([['쌍이 아닌 원소', [1]], ['길이 3', [['a', 'b', 'c']]], ['숫자 값', [['a', 1]]], ['Record 숫자 값', { grain: 42 }], ['Record 비문자열 배열', { grain: [1] }]])('모양 위반 %s 거부', (_n, page) => {
    expect(validateSavedView({ ...menuView, page }).ok).toBe(false);
  });
});

describe('validateSavedView context (C2)', () => {
  const withCtx = (context: unknown) => validateSavedView({ ...conditionSet, context });
  it.each([
    ['Scope', { scopeId: 'other-site' }],
    ['알 수 없는 키', { foo: 1 }],
    ['selection 숫자', { selection: 42 }],
    ['condition 값이 숫자', { condition: { team: 7 } }],
    ['condition 빈 배열', { condition: { team: [] } }],
    ['relativePeriod 문자열', { relativePeriod: { hours: '24' } }],
    ['relativePeriod 비유한', { relativePeriod: { hours: Number.NaN } }],
    ['from 숫자', { from: 1 }],
    ['lineNames 비문자열 배열', { lineNames: [1] }],
    ['membershipBasis 다른 값', { membershipBasis: 'now' }],
  ])('%s 거부', (_n, context) => {
    expect(withCtx(context)).toMatchObject({ ok: false, reason: 'invalid' });
  });
  it.each([
    ['빈 Context', {}],
    ['부분 Context', { from: '2026-10-01T00:00:00', to: null, prcGroups: ['P1'], membershipBasis: 'asOf', condition: { team: ['A'] }, roomNames: null }],
    ['명시 빈 Selection', { selection: [] }],
    ['상대 기간', { relativePeriod: { hours: 24 } }],
  ])('%s 통과', (_n, context) => {
    expect(withCtx(context).ok).toBe(true);
  });
});

describe('APPROVAL_TRANSITIONS와 canTransition (C3)', () => {
  const states: ViewApproval[] = ['none', 'pending', 'approved', 'rejected'];
  it.each(Object.keys(APPROVAL_TRANSITIONS) as ('request' | 'approve' | 'reject' | 'revoke')[])('%s: 모든 상태에서 공개 표와 함수가 일치', action => {
    const from: readonly ViewApproval[] = APPROVAL_TRANSITIONS[action].from;
    for (const s of states) expect(canTransition(s, action)).toBe(from.includes(s));
  });
  it('request는 none과 rejected에서 시작', () => {
    expect([...APPROVAL_TRANSITIONS.request.from]).toEqual(['none', 'rejected']);
  });
});

describe('타입 계약', () => {
  it('visibility와 approval은 별도 필드다', () => {
    expectTypeOf<SavedView>().toHaveProperty('visibility');
    expectTypeOf<SavedView>().toHaveProperty('approval');
    expectTypeOf<SavedView['approval']>().toEqualTypeOf<ViewApproval>();
  });
  it('변경 결과 Result는 네 실패 사유를 낸다', () => {
    expectTypeOf<Extract<Result<1>, { ok: false }>['reason']>().toEqualTypeOf<'conflict' | 'forbidden' | 'unavailable' | 'invalid'>();
  });
  it('저장소가 모든 메서드를 갖고 조회는 capability를 담는다', () => {
    expectTypeOf<SavedViewStore>().toHaveProperty('list');
    expectTypeOf<SavedViewStore>().toHaveProperty('get');
    expectTypeOf<SavedViewStore>().toHaveProperty('save');
    expectTypeOf<SavedViewStore>().toHaveProperty('update');
    expectTypeOf<SavedViewStore>().toHaveProperty('remove');
    expectTypeOf<SavedViewStore>().toHaveProperty('setDefault');
    expectTypeOf<SavedViewStore>().toHaveProperty('getDefaultId');
    expectTypeOf<SavedViewStore>().toHaveProperty('setVisibility');
    expectTypeOf<SavedViewStore>().toHaveProperty('requestOfficial');
    expectTypeOf<SavedViewStore>().toHaveProperty('decide');
    expectTypeOf<SavedViewStore>().toHaveProperty('revoke');
    expectTypeOf<SavedViewStore>().toHaveProperty('listGroups');
    expectTypeOf<SavedViewStore>().toHaveProperty('createGroup');
    expectTypeOf<SavedViewStore>().toHaveProperty('updateGroup');
    expectTypeOf<SavedViewStore>().toHaveProperty('searchPeople');
    expectTypeOf<SavedViewStore>().toHaveProperty('listApprovalRequests');
    expectTypeOf<SavedViewPatch>().toHaveProperty('menuSchemaVersion');
    expectTypeOf<SavedViewEntry>().toHaveProperty('capabilities');
  });
  it('denied 변형에는 name·payload가 없다', () => {
    expectTypeOf<DeniedSavedView>().toEqualTypeOf<{ id: string; denied: true; reason: string }>();
    expectTypeOf<DeniedSavedView>().not.toHaveProperty('name');
    expectTypeOf<DeniedSavedView>().not.toHaveProperty('context');
  });
  it('SavedViewSupport·GroupMember', () => {
    expectTypeOf<SavedViewSupport>().toHaveProperty('menuId');
    expectTypeOf<SavedViewSupport>().toHaveProperty('menuSchemaVersion');
    expectTypeOf<SavedViewSupport>().toHaveProperty('contextKeys');
    expectTypeOf<SavedViewSupport>().toHaveProperty('pageKeys');
    expectTypeOf<SavedViewSupport>().toHaveProperty('serialize');
    expectTypeOf<SavedViewSupport>().toHaveProperty('migrate');
    expectTypeOf<NonNullable<SavedViewSupport['migrate']>>().returns.toEqualTypeOf<MigrateResult>();
    expectTypeOf<GroupMember['affiliation']>().toEqualTypeOf<string>();
    expectTypeOf<SavedView['schemaVersion']>().toEqualTypeOf<1>();
  });
});
