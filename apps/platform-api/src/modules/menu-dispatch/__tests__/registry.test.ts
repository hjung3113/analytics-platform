import { describe, expect, it } from 'vitest';

import { platformVocab } from '../../platform-port/__tests__/platform-vocab.js';
import { MenuDispatchRegistrationError, SITE_BOUND_KEYS, createMenuDispatchRegistry } from '../registry.js';
import { createSyntheticScopeResolver } from '../scope-resolver.js';
import { registryOf, testAction, testEndpoint } from './test-declarations.js';

const refused = (build: () => unknown) => {
  try {
    build();
  } catch (error) {
    expect(error).toBeInstanceOf(MenuDispatchRegistrationError);
    return (error as Error).message;
  }
  throw new Error('registration was accepted');
};

describe('menu dispatch registration validation', () => {
  it('accepts a consistent endpoint + action pair', () => {
    const endpoint = testEndpoint().declaration;
    const action = testAction({ invalidates: ['test.rows'] }).declaration;
    const registry = registryOf([endpoint], [action]);
    expect(registry.endpointIds).toEqual(['test.rows']);
    expect(registry.actionIds).toEqual(['test.save']);
  });

  it.each([
    ['endpoint requiresScope names #1087', () => registryOf([testEndpoint({ requiresScope: true }).declaration]), /requiresScope.*#1087/],
    ['endpoint mergeTimeDomain names #1087', () => registryOf([testEndpoint({ mergeTimeDomain: true }).declaration]), /mergeTimeDomain.*#1087/],
    ['action requiresScope names #1087', () => registryOf([], [testAction({ requiresScope: true }).declaration]), /requiresScope.*#1087/],
    ['duplicate endpoint id', () => registryOf([testEndpoint().declaration, testEndpoint().declaration]), /registered twice/],
    ['duplicate action id', () => registryOf([], [testAction().declaration, testAction().declaration]), /registered twice/],
    ['invalidates an unregistered endpoint', () => registryOf([], [testAction({ invalidates: ['test.gone'] }).declaration]), /not a registered endpoint/],
    [
      'invalidates an endpoint of another menu',
      () => registryOf([testEndpoint({ menuId: 'other' }).declaration], [testAction({ invalidates: ['test.rows'] }).declaration]),
      /belongs to menu other/,
    ],
    [
      "version action without currentVersion",
      () => {
        const { declaration } = testAction({ concurrency: 'version' });
        const { currentVersion: _reader, ...withoutReader } = declaration;
        return registryOf([], [withoutReader]);
      },
      /needs a currentVersion/,
    ],
    ['maxRows zero', () => registryOf([testEndpoint({ limits: { maxRows: 0 } }).declaration]), /positive integer/],
    ['maxRows fraction', () => registryOf([testEndpoint({ limits: { maxRows: 1.5 } }).declaration]), /positive integer/],
    ['maxRows on a paged endpoint', () => registryOf([testEndpoint({ paramKeys: ['page', 'pageSize'], limits: { maxRows: 10 } }).declaration]), /paged endpoint/],
    ['maxRows on a cursor endpoint', () => registryOf([testEndpoint({ paramKeys: ['cursor'], limits: { maxRows: 10 } }).declaration]), /paged endpoint/],
    ['maxHours without time', () => registryOf([testEndpoint({ limits: { maxHours: 24 } }).declaration]), /context\.time/],
    ...(['roomNames', 'line', 'prcGroup', 'condition', 'selection', 'lot', 'recipe', 'ppid'] as const).map(
      (key): [string, () => unknown, RegExp] => [
        `scope-free endpoint applying ${key} (rule 6)`,
        () => registryOf([testEndpoint({ context: { [key]: 'apply' } }).declaration]),
        new RegExp(`site-bound context ${key}`),
      ],
    ),
    ['requiredContext not applied', () => registryOf([testEndpoint({ requiredContext: ['line'] }).declaration]), /requiredContext line/],
  ])('refuses %s', (_name, build, message) => {
    expect(refused(build)).toMatch(message);
  });

  it('accepts scope-free time/metric/reference of a site-bound key', () => {
    expect(() =>
      registryOf([
        testEndpoint({ context: { time: 'apply', metric: 'apply', selection: 'reference' } })
          .declaration,
      ]),
    ).not.toThrow();
  });

  it('keeps the site-bound key list equal to the contract list in vocab.json', () => {
    expect([...SITE_BOUND_KEYS]).toEqual(platformVocab().siteBoundContextKeys);
  });

  it('reports every problem at once, not only the first', () => {
    const message = refused(() =>
      createMenuDispatchRegistry([
        {
          endpoints: [testEndpoint({ requiresScope: true }).declaration],
          actions: [testAction({ invalidates: ['test.gone'] }).declaration],
        },
      ]),
    );
    expect(message).toMatch(/requiresScope/);
    expect(message).toMatch(/not a registered endpoint/);
  });

  it('accepts a version action with a reader and maxRows on a non-paged endpoint', () => {
    expect(() =>
      registryOf(
        [testEndpoint({ limits: { maxRows: 100 } }).declaration],
        [testAction({ concurrency: 'version' }).declaration],
      ),
    ).not.toThrow();
  });
});


describe('Scope resolver registration gate', () => {
  const scopeResolver = createSyntheticScopeResolver([]);

  it.each([
    { requiresScope: true },
    { mergeTimeDomain: true },
    { requiresScope: true, mergeTimeDomain: true, context: { roomNames: 'apply' as const } },
  ])('accepts endpoint %j only with a resolver', (spec) => {
    const declaration = testEndpoint(spec).declaration;
    expect(() => createMenuDispatchRegistry([{ endpoints: [declaration] }], { scopeResolver }))
      .not.toThrow();
    expect(() => createMenuDispatchRegistry([{ endpoints: [declaration] }], {}))
      .toThrow(MenuDispatchRegistrationError);
  });

  it('accepts a scoped action only with a resolver', () => {
    const declaration = testAction({ requiresScope: true }).declaration;
    const registry = createMenuDispatchRegistry([{ actions: [declaration] }], { scopeResolver });
    expect(registry.action('test.save')).toBe(declaration);
    expect(() => createMenuDispatchRegistry([{ actions: [declaration] }], {}))
      .toThrow(/requiresScope.*#1087/);
  });

  it('retains other endpoint and action validation with a resolver', () => {
    const message = refused(() => createMenuDispatchRegistry([{
      endpoints: [testEndpoint({ context: { roomNames: 'apply' } }).declaration],
      actions: [testAction({ requiresScope: true, invalidates: ['missing'] }).declaration],
    }], { scopeResolver }));
    expect(message).toContain('scope-free endpoint cannot apply site-bound context roomNames');
    expect(message).toContain('invalidates missing, which is not a registered endpoint');
  });
});
