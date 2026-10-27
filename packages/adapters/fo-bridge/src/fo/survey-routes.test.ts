import { describe, expect, it } from 'vitest';
import { hostLinks } from './links';
import { operatorHostLinks } from './operator-links';
import { surveyChildTarget, surveyOperatorTargets, surveysRoute } from './survey-routes';

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

  it('is not wired into operatorHostLinks yet (764p1)', () => {
    expect(operatorHostLinks.canLink('/surveys')).toBe(false);
    expect(operatorHostLinks.canLink(`/surveys/${SURVEY}?builder=true`)).toBe(false);
    expect(operatorHostLinks.canLink(`/surveys/${SURVEY}/results`)).toBe(false);
  });
});
