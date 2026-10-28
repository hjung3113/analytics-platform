import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { HostLink } from '@/lib/host/host-seam';
import { mountAt, warmPages } from '../test-support';

/**
 * The Survey screens' own outgoing links, as FeedbackOps emits them (bare `/surveys/<id>?builder=true`, `/surveys/<id>/results`, `/surveys/<id>/follow-up`, `/surveys`),
 * followed through the host seam's real `Link`: the list context must survive each hop and the way back (#764 p1). The screens are doubles that draw those hrefs; the
 * address checks (FeedbackOps' real surveys-search schemas) and the link seam are not mocked.
 */
vi.mock('@ap/feature-screens/operator-screens/surveys', () => ({
  SurveysScreen: () => <div data-testid="list"><HostLink to={`/surveys/${SURVEY_A}?builder=true`}>빌더 열기</HostLink></div>,
}));
vi.mock('@ap/feature-screens/operator-screens/survey-detail', () => ({ useSurveyDetailParts: () => ({ title: 'Survey', body: null, view: { kind: 'loading' } }) }));
vi.mock('@ap/feature-screens/operator-screens/survey-builder', () => ({
  SurveyBuilderScreen: (props: { onBack: () => void }) => <div data-testid="builder"><button type="button" onClick={props.onBack}>빌더 뒤로</button></div>,
}));
vi.mock('@ap/feature-screens/operator-screens/survey-results', () => ({
  SurveyResultsScreen: () => <div data-testid="results"><HostLink to={`/surveys/${SURVEY_A}/follow-up`}>후속 조치</HostLink></div>,
}));
vi.mock('@ap/feature-screens/operator-screens/survey-follow-up', () => ({
  SurveyFollowUpScreen: () => <div data-testid="follow-up"><HostLink to="/surveys">Surveys</HostLink><HostLink to={`/surveys/${SURVEY_A}/results`}>결과</HostLink></div>,
}));

const AREA = '55555555-5555-4555-8555-555555555555';
const SURVEY_A = '99999999-9999-4999-8999-99999999999a';
const LIST = '/feedbackops/fo-surveys';
const child = (menu: string) => `/feedbackops/${menu}/${SURVEY_A}`;
const params = () => new URLSearchParams(window.location.search);

beforeAll(warmPages, 60_000);
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); setFeatureApi({ basePath: '/api/fo', onSessionLost: vi.fn() }); });
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('the Survey list context through the screens\' real links', () => {
  it('list → builder → Back keeps area, status and follow_up and focuses the Survey', async () => {
    mountAt(`${LIST}?area=${AREA}&status=open&follow_up=needed&focus=${SURVEY_A}`);
    fireEvent.click(await screen.findByRole('link', { name: '빌더 열기' }));
    await screen.findByTestId('builder');
    expect(window.location.pathname).toBe(child('fo-survey-builder'));
    expect(params().get('area')).toBe(AREA);
    expect(params().get('status')).toBe('open');
    expect(params().get('follow_up')).toBe('needed');
    expect(params().has('focus')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '빌더 뒤로' }));
    await screen.findByTestId('list');
    expect(window.location.pathname).toBe(LIST);
    expect(Object.fromEntries(params())).toMatchObject({ area: AREA, status: 'open', follow_up: 'needed', focus: SURVEY_A });
  });

  it('results → follow-up → list keeps the context and the list link restores focus on this Survey', async () => {
    mountAt(`${child('fo-survey-results')}?area=${AREA}&status=open`);
    fireEvent.click(await screen.findByRole('link', { name: '후속 조치' }));
    await screen.findByTestId('follow-up');
    expect(window.location.pathname).toBe(child('fo-survey-follow-up'));
    expect(params().get('area')).toBe(AREA);
    expect(params().get('status')).toBe('open');
    fireEvent.click(screen.getByRole('link', { name: 'Surveys' }));
    await screen.findByTestId('list');
    expect(window.location.pathname).toBe(LIST);
    expect(Object.fromEntries(params())).toMatchObject({ area: AREA, status: 'open', focus: SURVEY_A });
  });
});
