import { describe, expect, it } from 'vitest';

import { MenuDispatchRegistrationError, createMenuDispatchRegistry } from '../registry.js';
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
    ['requiredContext not applied', () => registryOf([testEndpoint({ requiredContext: ['line'] }).declaration]), /requiredContext line/],
  ])('refuses %s', (_name, build, message) => {
    expect(refused(build)).toMatch(message);
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
