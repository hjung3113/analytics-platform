import { describe, expect, it } from 'vitest';
import { hostLinks } from './links';
import { UUID_PATTERN } from './uuid';
import { operatorHostLinks } from './operator-links';
import { surveyBuilderRoute, surveyChildTarget, surveyFollowUpRoute, surveyOperatorTargets, surveyResultsRoute, surveysRoute } from './survey-routes';

const SYSTEM = '33333333-3333-4333-8333-333333333333';
const AREA = '55555555-5555-4555-8555-555555555555';
const SURVEY = '99999999-9999-4999-8999-999999999999';

const query = (to: string) => Object.fromEntries(new URLSearchParams(to.slice(to.indexOf('?') + 1)));
const { targetOf } = hostLinks(...surveyOperatorTargets);

describe('Surveys table', () => {
  it.each([
    ['scoped', `/surveys?managedSystem=${SYSTEM}`, { managedSystem: SYSTEM }],
    ['area and status', `/surveys?filter.analytics_area=${AREA}&status=open`, { area: AREA, status: 'open' }],
    ['unset area', '/surveys?filter.analytics_area=unset', { area: 'unset' }],
    ['follow-up', '/surveys?follow_up=needed', { follow_up: 'needed' }],
    ['selection', `/surveys?selected=${SURVEY}`, { focus: SURVEY }],
  ])('maps the %s link to fo-surveys and back to the same FO search', (_name, to, page) => {
    const target = surveysRoute.target(to);
    expect(target).toEqual({ menuId: 'fo-surveys', page });
    expect(surveysRoute.toFoSearch(target!.page!)).toEqual(query(to));
  });

  it('reads a bare /surveys as the list with no page keys', () => {
    expect(surveysRoute.target('/surveys')).toEqual({ menuId: 'fo-surveys', page: {} });
  });

  it('reads /surveys/<id> as the selection', () => {
    expect(surveysRoute.target(`/surveys/${SURVEY}`)).toEqual({ menuId: 'fo-surveys', page: { focus: SURVEY } });
    expect(surveysRoute.toFoSearch({ focus: SURVEY })).toEqual({ selected: SURVEY });
  });

  it('reads managedSystem=all as an explicit clear', () => {
    expect(surveysRoute.target('/surveys?managedSystem=all')?.page).toEqual({ managedSystem: null });
  });

  it.each([
    ['returnTo', '/surveys?returnTo=%2Fhome'],
    ['platformReturn', '/surveys?platformReturn=x'],
    ['an unknown key', '/surveys?unknown=1'],
    ['a non-uuid id', '/surveys/not-a-uuid'],
    ['a participate path', '/surveys/participate'],
    ['an id plus selected', `/surveys/${SURVEY}?selected=${SURVEY}`],
    ['a deeper path', `/surveys/${SURVEY}/results`],
    ['a hash', '/surveys#x'],
    ['a duplicated key', `/surveys?status=open&status=open`],
  ])('leaves a link with %s unlinked', (_name, to) => {
    expect(surveysRoute.target(to)).toBeNull();
  });

  it('pins the page keys', () => {
    expect([...surveysRoute.pageKeys].sort()).toEqual(['area', 'focus', 'follow_up', 'managedSystem', 'status']);
  });
});

describe('Survey child targets', () => {
  it.each([
    ['builder', `/surveys/${SURVEY}?builder=true`, 'fo-survey-builder', {}],
    ['results', `/surveys/${SURVEY}/results`, 'fo-survey-results', {}],
    ['follow-up', `/surveys/${SURVEY}/follow-up`, 'fo-survey-follow-up', {}],
    ['builder with scope', `/surveys/${SURVEY}?builder=true&managedSystem=${SYSTEM}&filter.analytics_area=${AREA}&status=open&follow_up=needed`, 'fo-survey-builder',
      { managedSystem: SYSTEM, area: AREA, status: 'open', follow_up: 'needed' }],
    ['results with scope', `/surveys/${SURVEY}/results?filter.analytics_area=unset&status=open`, 'fo-survey-results', { area: 'unset', status: 'open' }],
    ['follow-up with scope', `/surveys/${SURVEY}/follow-up?follow_up=needed`, 'fo-survey-follow-up', { follow_up: 'needed' }],
  ])('maps the %s link', (_name, to, menuId, page) => {
    expect(surveyChildTarget(to)).toEqual({ menuId, params: { surveyId: SURVEY }, page });
  });

  it('reads managedSystem=all as an explicit clear', () => {
    expect(surveyChildTarget(`/surveys/${SURVEY}/results?managedSystem=all`)?.page).toEqual({ managedSystem: null });
  });

  it.each([
    ['returnTo', `/surveys/${SURVEY}/results?returnTo=%2Fhome`],
    ['platformReturn', `/surveys/${SURVEY}?builder=true&platformReturn=x`],
    ['an unknown key', `/surveys/${SURVEY}/results?unknown=1`],
    ['a non-uuid id', '/surveys/not-a-uuid/results'],
    ['a non-uuid builder id', '/surveys/not-a-uuid?builder=true'],
    ['builder=false', `/surveys/${SURVEY}?builder=false`],
    ['builder with no value', `/surveys/${SURVEY}?builder=`],
    ['builder on a child path', `/surveys/${SURVEY}/results?builder=true`],
    ['a bare detail path', `/surveys/${SURVEY}`],
    ['a duplicated key', `/surveys/${SURVEY}?builder=true&builder=true`],
    ['a duplicated scope key', `/surveys/${SURVEY}/results?status=open&status=open`],
    ['a hash', `/surveys/${SURVEY}/results#x`],
    ['a deeper path', `/surveys/${SURVEY}/results/x`],
    ['respond', `/surveys/${SURVEY}/respond`],
  ])('leaves a link with %s unlinked', (_name, to) => {
    expect(surveyChildTarget(to)).toBeNull();
  });
});

describe('surveyOperatorTargets', () => {
  it('keeps the reporter targets first, then the children, then the list', () => {
    expect(targetOf('/surveys/participate')).toEqual({ menuId: 'surveys' });
    expect(targetOf(`/surveys/${SURVEY}/respond`)).toEqual({ menuId: 'survey-respond', params: { surveyId: SURVEY } });
    expect(targetOf(`/surveys/${SURVEY}?builder=true`)?.menuId).toBe('fo-survey-builder');
    expect(targetOf(`/surveys/${SURVEY}`)).toEqual({ menuId: 'fo-surveys', page: { focus: SURVEY } });
    expect(targetOf('/surveys?follow_up=needed')).toEqual({ menuId: 'fo-surveys', page: { follow_up: 'needed' } });
  });

  it.each([
    '/surveys', '/surveys?managedSystem=all', `/surveys/${SURVEY}`, `/surveys/${SURVEY}?builder=true`, `/surveys/${SURVEY}/results`, `/surveys/${SURVEY}/follow-up`,
    `/surveys?filter.analytics_area=${AREA}&status=open&follow_up=needed`, `/surveys/${SURVEY}/results?managedSystem=${SYSTEM}&status=open`,
    '/surveys/participate', `/surveys/${SURVEY}/respond`,
  ])('operatorHostLinks links %s', to => {
    expect(operatorHostLinks.canLink(to)).toBe(true);
  });

  it.each(['/admin/managed-systems', '/admin/settings#coverage', '/surveys/not-a-uuid', `/surveys/${SURVEY}/results?returnTo=%2Fhome`])('operatorHostLinks leaves %s unlinked', to => {
    expect(operatorHostLinks.canLink(to)).toBe(false);
  });
});

describe('survey child route tables', () => {
  // A stand-in for FeedbackOps' detail search schema (the menu page tests run the real one): `status` accepts `open` only, `managedSystem` a UUID or `all`.
  const accepts = (foKey: string, value: string) => foKey === 'status' ? value === 'open' : foKey === 'managedSystem' ? value === 'all' || UUID_PATTERN.test(value) : true;
  const rejected = (route: typeof surveyBuilderRoute, params: Record<string, string>) => route.rejectedKey(key => params[key] ?? null, accepts);

  it('maps the child page keys to the FO search both ways, builder fixed to true', () => {
    const page = { managedSystem: SYSTEM, area: AREA, status: 'open', follow_up: 'needed', focus: SURVEY };
    expect(surveyBuilderRoute.toFoSearch(page)).toEqual({ builder: 'true', managedSystem: SYSTEM, 'filter.analytics_area': AREA, status: 'open', follow_up: 'needed' });
    expect(surveyResultsRoute.toFoSearch(page)).toEqual({ managedSystem: SYSTEM, 'filter.analytics_area': AREA, status: 'open', follow_up: 'needed' });
    expect(surveyFollowUpRoute.toFoSearch(page)).toEqual({ managedSystem: SYSTEM, 'filter.analytics_area': AREA, status: 'open', follow_up: 'needed' });
    expect(surveyResultsRoute.preset({ 'filter.analytics_area': AREA, builder: 'true' })).toEqual({ area: AREA });
  });

  it('lists the table page keys: the scope on every child, plus focus on follow-up only', () => {
    expect([...surveyBuilderRoute.pageKeys].sort()).toEqual(['area', 'follow_up', 'managedSystem', 'status']);
    expect([...surveyResultsRoute.pageKeys].sort()).toEqual(['area', 'follow_up', 'managedSystem', 'status']);
    expect([...surveyFollowUpRoute.pageKeys].sort()).toEqual(['area', 'focus', 'follow_up', 'managedSystem', 'status']);
  });

  it('each table targets only its own menu', () => {
    expect(surveyBuilderRoute.target(`/surveys/${SURVEY}?builder=true`)?.menuId).toBe('fo-survey-builder');
    expect(surveyBuilderRoute.target(`/surveys/${SURVEY}/results`)).toBeNull();
    expect(surveyResultsRoute.target(`/surveys/${SURVEY}/results`)?.menuId).toBe('fo-survey-results');
    expect(surveyFollowUpRoute.target(`/surveys/${SURVEY}/results`)).toBeNull();
  });

  it('rejects a list-context value FeedbackOps refuses, and a focus that is not a UUID (follow-up only)', () => {
    expect(rejected(surveyResultsRoute, { status: 'closed' })).toEqual({ key: 'status', value: 'closed' });
    expect(rejected(surveyBuilderRoute, { managedSystem: 'x' })).toEqual({ key: 'managedSystem', value: 'x' });
    expect(rejected(surveyFollowUpRoute, { focus: 'x' })).toEqual({ key: 'focus', value: 'x' });
    expect(rejected(surveyFollowUpRoute, { focus: SURVEY, status: 'open', managedSystem: 'all' })).toBeNull();
    expect(rejected(surveyResultsRoute, { focus: 'x' })).toBeNull();
  });
});
