// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { surveyBuilderRoute, surveyFollowUpRoute, surveyResultsRoute, surveysRoute } from '@ap/feature-bridge';
import { manifests } from './index';

const FRONTEND = '../../../apps/feature-screens/src/';
const read = (path: string) => readFileSync(fileURLToPath(new URL(`${FRONTEND}${path}`, import.meta.url)), 'utf8');
const PARTICIPATION_COPY = read('lib/copy/survey-participation.ts');
const byId = (id: string) => manifests.find(entry => entry.id === id)!;

describe('Surveys manifests', () => {
  it('declares Survey 관리 first and primary, then the three hidden children, all in foSurveys', () => {
    expect(manifests.map(entry => entry.id)).toEqual(['fo-surveys', 'fo-survey-builder', 'fo-survey-results', 'fo-survey-follow-up']);
    expect(manifests.filter(entry => entry.primary).map(entry => entry.id)).toEqual(['fo-surveys']);
    expect(manifests.every(entry => entry.group === 'foSurveys')).toBe(true);
    expect(manifests.map(entry => entry.path)).toEqual([
      '/feedbackops/surveys', '/feedbackops/surveys/:surveyId/builder', '/feedbackops/surveys/:surveyId/results', '/feedbackops/surveys/:surveyId/follow-up',
    ]);
  });

  it('hides the children under fo-surveys, which has no path params', () => {
    for (const id of ['fo-survey-builder', 'fo-survey-results', 'fo-survey-follow-up']) expect(byId(id)).toMatchObject({ navHidden: true, parent: 'fo-surveys' });
    expect(byId('fo-surveys').navHidden).toBeUndefined();
    expect(byId('fo-surveys').path).not.toContain(':');
  });

  it.each([
    ['fo-surveys', surveysRoute],
    ['fo-survey-builder', surveyBuilderRoute],
    ['fo-survey-results', surveyResultsRoute],
    ['fo-survey-follow-up', surveyFollowUpRoute],
  ])('%s declares its route table page keys plus returnTo, and the space permission', (id, route) => {
    // `returnTo` is navigation state the FO space carries (#760), not a route-table filter key.
    const menu = byId(id);
    expect([...menu.pageKeys!].sort()).toEqual([...route.pageKeys, 'returnTo'].sort());
    expect(menu).toMatchObject({ permission: 'feedbackops:access', requiresScope: false, pageType: 'management' });
    expect(menu.navViews).toBeUndefined();
  });

  it('never aliases the reporter 설문 paths (/surveys, /surveys/:id/respond)', () => {
    for (const entry of manifests) {
      expect(entry.path).not.toMatch(/^\/surveys/);
      expect(entry.aliases ?? []).toEqual([]);
    }
  });

  it('keeps the Survey management ko label equal to the FeedbackOps participation copy', () => {
    expect(byId('fo-surveys').label.ko).toBe(new RegExp("\\bmanage: '([^']+)'").exec(PARTICIPATION_COPY)?.[1]);
  });
});
