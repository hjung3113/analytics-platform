// DB-free declarations for the judgment tests: a configurable endpoint and action. The handlers record
// that they were reached, so a test can assert that a refusal came before the handler.

import { createMenuDispatchRegistry } from '../registry.js';
import type {
  ActionHandlerResult,
  EndpointDeclarationSpec,
  EndpointResult,
  FieldError,
  MenuActionDeclaration,
  MenuEndpointDeclaration,
} from '../types.js';

export const endpointSpec = (over: Partial<EndpointDeclarationSpec> = {}): EndpointDeclarationSpec => ({
  id: 'test.rows',
  menuId: 'test',
  paramKeys: ['q'],
  permission: 'test:view',
  requiresScope: false,
  context: {},
  mergeTimeDomain: false,
  ...over,
});

export function testEndpoint(
  over: Partial<EndpointDeclarationSpec> = {},
  hooks: {
    allow?: boolean;
    result?: EndpointResult;
    validate?: MenuEndpointDeclaration['validate'];
  } = {},
) {
  const calls = { handled: 0, authorized: 0 };
  const declaration: MenuEndpointDeclaration = {
    spec: endpointSpec(over),
    authorize: async () => {
      calls.authorized += 1;
      return hooks.allow ?? true;
    },
    validate: hooks.validate ?? (() => ({ ok: true })),
    handle: async () => {
      calls.handled += 1;
      return hooks.result ?? { outcome: 'ok', data: [{ id: 1 }] };
    },
  };
  return { declaration, calls };
}

export function testAction(
  over: Partial<MenuActionDeclaration['spec']> = {},
  hooks: {
    allow?: boolean;
    validate?: (input: Record<string, unknown>) => readonly FieldError[];
    version?: string | null;
    write?: ActionHandlerResult;
  } = {},
) {
  const calls = { handled: 0 };
  const declaration: MenuActionDeclaration = {
    spec: {
      id: 'test.save',
      menuId: 'test',
      inputKeys: ['name'],
      permission: 'test:write',
      requiresScope: false,
      concurrency: 'none',
      invalidates: [],
      ...over,
    },
    authorize: async () => hooks.allow ?? true,
    validate: hooks.validate ?? (() => []),
    currentVersion: async () => (hooks.version === undefined ? '1' : hooks.version),
    handle: async () => {
      calls.handled += 1;
      return hooks.write ?? { data: { saved: true }, version: '2' };
    },
  };
  return { declaration, calls };
}

export const registryOf = (
  endpoints: MenuEndpointDeclaration[] = [],
  actions: MenuActionDeclaration[] = [],
) => createMenuDispatchRegistry([{ endpoints, actions }]);
