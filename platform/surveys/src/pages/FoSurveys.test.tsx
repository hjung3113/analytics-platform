import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { useHostSeam } from '@/lib/host/host-seam';
import { mountAt, warmPages } from '../test-support';

type Parts = Record<string, unknown>;
type Selection = { selectedId: string | null; onSelect: (id: string | null) => void };
/** The five FeedbackOps entries are doubles that record how the pages drive them; the value checks (FeedbackOps' real surveys-search schemas) are not mocked. */
const fo = vi.hoisted(() => ({
  list: [] as { renderDetail: (selectedId: string | null, slot: unknown) => unknown }[],
  detailArgs: [] as { surveyId: string; onClose: () => void }[],
  builder: [] as { surveyId: string; onBack: () => void }[],
  results: [] as string[],
  followUp: [] as { surveyId: string; selection?: Selection; renderDetail?: (parts: Parts) => ReactNode }[],
  requestClose: vi.fn(),
}));
vi.mock('@ap/feature-screens/operator-screens/surveys', () => ({
  SurveysScreen: (props: { renderDetail: (selectedId: string | null, slot: unknown) => unknown }) => {
    fo.list.push(props);
    const seam = useHostSeam();
    return <div data-testid="list" data-here={seam.useHere!()} data-owns-title={String(seam.hostOwnsTitle)} />;
  },
}));
vi.mock('@ap/feature-screens/operator-screens/survey-detail', () => ({
  useSurveyDetailParts: (args: { surveyId: string; onClose: () => void }) => {
    fo.detailArgs.push(args);
    return { title: `Survey ${args.surveyId}`, body: <p>상세 본문 {args.surveyId}</p>, view: { kind: 'loading' } };
  },
}));
vi.mock('@ap/feature-screens/operator-screens/survey-builder', () => ({
  SurveyBuilderScreen: (props: { surveyId: string; onBack: () => void }) => {
    fo.builder.push(props);
    const seam = useHostSeam();
    return <div data-testid="builder" data-here={seam.useHere!()}><button type="button" onClick={props.onBack}>빌더 뒤로</button></div>;
  },
}));
vi.mock('@ap/feature-screens/operator-screens/survey-results', () => ({
  SurveyResultsScreen: (props: { surveyId: string }) => {
    fo.results.push(props.surveyId);
    const seam = useHostSeam();
    return <div data-testid="results" data-here={seam.useHere!()} />;
  },
}));
vi.mock('@ap/feature-screens/operator-screens/survey-follow-up', () => ({
  SurveyFollowUpScreen: (props: { surveyId: string; selection?: Selection; renderDetail?: (parts: Parts) => ReactNode }) => {
    fo.followUp.push(props);
    const seam = useHostSeam();
    const selected = props.selection?.selectedId ?? null;
    return <div data-testid="follow-up" data-here={seam.useHere!()} data-selected={selected ?? ''}>
      {selected !== null && props.renderDetail?.({ title: `응답 ${selected}`, body: <p>응답 본문 {selected}</p>, requestClose: fo.requestClose })}
      <button type="button" onClick={() => props.selection?.onSelect(RESPONSE_B)}>응답 선택</button>
      <button type="button" onClick={() => props.selection?.onSelect(null)}>선택 해제</button>
    </div>;
  },
}));

const SYSTEM = '33333333-3333-4333-8333-333333333333';
const AREA = '55555555-5555-4555-8555-555555555555';
const SURVEY_A = '99999999-9999-4999-8999-99999999999a';
const SURVEY_B = '99999999-9999-4999-8999-99999999999b';
const RESPONSE_A = '77777777-7777-4777-8777-77777777777a';
const RESPONSE_B = '77777777-7777-4777-8777-77777777777b';
const LIST = '/feedbackops/fo-surveys';
const child = (menu: string, id: string) => `/feedbackops/${menu}/${id}`;
const request = vi.fn();
const hereOf = (testId: string) => new URL(screen.getByTestId(testId).getAttribute('data-here')!, 'http://x');
const hop = (url: string) => { window.history.replaceState(null, '', url); act(() => { window.dispatchEvent(new PopStateEvent('popstate')); }); };

beforeAll(warmPages, 60_000);
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('fetch', request);
  fo.list.length = 0; fo.detailArgs.length = 0; fo.builder.length = 0; fo.results.length = 0; fo.followUp.length = 0; fo.requestClose.mockReset(); request.mockReset();
});
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('Survey 관리 without a FeedbackOps API (mock preview)', () => {
  it.each([
    [LIST, 'Survey 관리', 'list'],
    [child('fo-survey-builder', SURVEY_A), 'Survey 빌더', 'builder'],
    [child('fo-survey-results', SURVEY_A), 'Survey 결과', 'results'],
    [child('fo-survey-follow-up', SURVEY_A), 'Survey 후속 조치', 'follow-up'],
  ])('%s shows 실서버 필요 and mounts no screen', async (path, title, testId) => {
    mountAt(path);
    await screen.findByRole('heading', { name: title }, { timeout: 3000 });
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect(screen.queryByTestId(testId)).toBeNull();
  });
});

describe('Survey 관리 through the FeedbackOps bridge', () => {
  beforeEach(() => { setFeatureApi({ basePath: '/api/fo', onSessionLost: vi.fn() }); });

  it('mounts the list reading the page as the FO /surveys path with the host owning the title, and gives the screen no detail node', async () => {
    mountAt(`${LIST}?area=${AREA}&status=open&follow_up=needed&managedSystem=${SYSTEM}`);
    const list = await screen.findByTestId('list');
    expect(list.getAttribute('data-owns-title')).toBe('true');
    const here = hereOf('list');
    expect(here.pathname).toBe('/surveys');
    expect(Object.fromEntries(here.searchParams)).toEqual({ 'filter.analytics_area': AREA, status: 'open', follow_up: 'needed', managedSystem: SYSTEM });
    expect(fo.list.at(-1)!.renderDetail(SURVEY_A, {})).toBeUndefined();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fo.detailArgs).toEqual([]);
  });

  it('opens the Survey detail in the shell detail slot on focus, and the list reads it as selected', async () => {
    mountAt(`${LIST}?focus=${SURVEY_A}`);
    const dialog = await within(await screen.findByRole('complementary', { name: '상세 패널' })).findByRole('dialog');
    expect(within(dialog).getByText(`상세 본문 ${SURVEY_A}`)).toBeTruthy();
    expect(hereOf('list').searchParams.get('selected')).toBe(SURVEY_A);
    hop(`${LIST}?focus=${SURVEY_B}`);
    expect(await screen.findByText(`상세 본문 ${SURVEY_B}`)).toBeTruthy();
  });

  it('closing the drawer drops focus and keeps the rest', async () => {
    mountAt(`${LIST}?status=open&focus=${SURVEY_A}`);
    fireEvent.click(await screen.findByRole('button', { name: '상세 닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const params = new URLSearchParams(window.location.search);
    expect(params.has('focus')).toBe(false);
    expect(params.get('status')).toBe('open');
  });

  it('hands useSurveyDetailParts an onClose that clears focus (the not-found button)', async () => {
    mountAt(`${LIST}?focus=${SURVEY_A}&status=open`);
    await screen.findByRole('dialog');
    expect(fo.detailArgs.at(-1)).toMatchObject({ surveyId: SURVEY_A });
    act(() => { fo.detailArgs.at(-1)!.onClose(); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(new URLSearchParams(window.location.search).has('focus')).toBe(false);
  });
});

const REJECTED = [['status', 'closed'], ['follow_up', 'x'], ['area', 'x'], ['managedSystem', 'x'], ['focus', 'not-a-uuid']] as const;

describe('Survey 관리 with an invalid address value', () => {
  beforeEach(() => { setFeatureApi({ basePath: '/api/fo', onSessionLost: vi.fn() }); });

  it.each(REJECTED)('rejects an invalid %s=%s, keeps the address and requests nothing', async (key, value) => {
    const search = `?${key}=${encodeURIComponent(value)}`;
    mountAt(`${LIST}${search}`);
    expect(await screen.findByText(`주소의 ${key} 값이 올바르지 않습니다`, undefined, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByTestId('list')).toBeNull();
    expect(fo.list).toEqual([]);
    expect(fo.detailArgs).toEqual([]);
    expect(request).not.toHaveBeenCalled();
    expect(window.location.search).toBe(search);
  });
});

describe('the hidden Survey screens', () => {
  beforeEach(() => { setFeatureApi({ basePath: '/api/fo', onSessionLost: vi.fn() }); });

  it('mounts the builder reading the page as /surveys/<id>?builder=true with the list scope', async () => {
    mountAt(`${child('fo-survey-builder', SURVEY_A)}?status=open&managedSystem=${SYSTEM}`);
    await screen.findByTestId('builder');
    const here = hereOf('builder');
    expect(here.pathname).toBe(`/surveys/${SURVEY_A}`);
    expect(Object.fromEntries(here.searchParams)).toEqual({ builder: 'true', status: 'open', managedSystem: SYSTEM });
    expect(fo.builder.at(-1)!.surveyId).toBe(SURVEY_A);
  });

  it('the builder Back goes to the list with this Survey as focus and the list context kept', async () => {
    mountAt(`${child('fo-survey-builder', SURVEY_A)}?status=open&follow_up=needed`);
    fireEvent.click(await screen.findByRole('button', { name: '빌더 뒤로' }));
    await screen.findByTestId('list');
    const params = new URLSearchParams(window.location.search);
    expect(window.location.pathname).toBe(LIST);
    expect(params.get('focus')).toBe(SURVEY_A);
    expect(params.get('status')).toBe('open');
    expect(params.get('follow_up')).toBe('needed');
  });

  it('mounts the results reading the page as /surveys/<id>/results', async () => {
    mountAt(`${child('fo-survey-results', SURVEY_A)}?area=${AREA}`);
    await screen.findByTestId('results');
    const here = hereOf('results');
    expect(here.pathname).toBe(`/surveys/${SURVEY_A}/results`);
    expect(Object.fromEntries(here.searchParams)).toEqual({ 'filter.analytics_area': AREA });
    expect(fo.results).toContain(SURVEY_A);
  });

  it('mounts the follow-up reading the page as /surveys/<id>/follow-up, with nothing selected and no auto-select', async () => {
    mountAt(`${child('fo-survey-follow-up', SURVEY_A)}?follow_up=needed`);
    const screenEl = await screen.findByTestId('follow-up');
    expect(hereOf('follow-up').pathname).toBe(`/surveys/${SURVEY_A}/follow-up`);
    expect(screenEl.getAttribute('data-selected')).toBe('');
    expect(fo.followUp.at(-1)!.selection!.selectedId).toBeNull();
    expect(window.location.search).toBe('?follow_up=needed');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('controls the follow-up selection with focus: focus is the selected response, a pick writes it, null drops it, and the detail is the drawer', async () => {
    mountAt(`${child('fo-survey-follow-up', SURVEY_A)}?focus=${RESPONSE_A}&status=open`);
    expect((await screen.findByTestId('follow-up')).getAttribute('data-selected')).toBe(RESPONSE_A);
    const dialog = await within(await screen.findByRole('complementary', { name: '상세 패널' })).findByRole('dialog');
    expect(within(dialog).getByText(`응답 본문 ${RESPONSE_A}`)).toBeTruthy();
    // focus is a page key only; the FO search never carries it.
    expect(hereOf('follow-up').searchParams.has('focus')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '응답 선택' }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('focus')).toBe(RESPONSE_B));
    fireEvent.click(screen.getByRole('button', { name: '선택 해제' }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).has('focus')).toBe(false));
    expect(new URLSearchParams(window.location.search).get('status')).toBe('open');
  });

  it('the follow-up drawer close is the screen\'s requestClose', async () => {
    mountAt(`${child('fo-survey-follow-up', SURVEY_A)}?focus=${RESPONSE_A}`);
    fireEvent.click(await screen.findByRole('button', { name: '상세 닫기' }));
    expect(fo.requestClose).toHaveBeenCalledOnce();
  });

  it.each([
    ['fo-survey-builder', 'builder'],
    ['fo-survey-results', 'results'],
    ['fo-survey-follow-up', 'follow-up'],
  ])('%s refuses a non-UUID :surveyId as not found and requests nothing', async (menu, testId) => {
    mountAt(child(menu, 'not-a-uuid'));
    expect(await screen.findByText('Survey를 찾을 수 없습니다', undefined, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByTestId(testId)).toBeNull();
    expect(fo.builder).toEqual([]);
    expect(fo.results).toEqual([]);
    expect(fo.followUp).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    ['fo-survey-builder', 'status', 'closed', 'builder'],
    ['fo-survey-results', 'area', 'x', 'results'],
    ['fo-survey-results', 'managedSystem', 'x', 'results'],
    ['fo-survey-follow-up', 'follow_up', 'x', 'follow-up'],
    ['fo-survey-follow-up', 'focus', 'not-a-uuid', 'follow-up'],
  ])('%s rejects %s=%s, keeps the address and mounts no screen', async (menu, key, value, testId) => {
    const search = `?${key}=${encodeURIComponent(value)}`;
    mountAt(`${child(menu, SURVEY_A)}${search}`);
    expect(await screen.findByText(`주소의 ${key} 값이 올바르지 않습니다`, undefined, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByTestId(testId)).toBeNull();
    expect(fo.builder).toEqual([]);
    expect(fo.results).toEqual([]);
    expect(fo.followUp).toEqual([]);
    expect(request).not.toHaveBeenCalled();
    expect(window.location.search).toBe(search);
  });
});
