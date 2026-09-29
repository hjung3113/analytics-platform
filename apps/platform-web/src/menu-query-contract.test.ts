import { describe, expect, it } from 'vitest';
import {
  type AnyEndpointSpec,
  defineEndpoint,
  emptyGlobal,
  projectContext,
  type ContextKey,
  type EndpointSpec,
  type GlobalContext,
} from '@ap/contracts';

const endpoint = (
  context: Partial<Record<ContextKey, 'apply' | 'reference'>>,
  requiresScope = false,
) => defineEndpoint<{ granularity: string }, unknown>({
  id: 'analytics.test',
  menuId: 'productivity-overview',
  paramKeys: [],
  permission: 'analytics:view',
  requiresScope,
  context,
  kinds: [],
  mergeTimeDomain: false,
});

declare function useMenuQueryShape<P, T>(spec: EndpointSpec<P, T>, params: NoInfer<P>): T;

const idSetFields = [
  { contextKey: 'roomNames', globalKey: 'roomNames' },
  { contextKey: 'selection', globalKey: 'selection' },
  { contextKey: 'lot', globalKey: 'lotIds' },
  { contextKey: 'recipe', globalKey: 'recipeIds' },
] as const;

describe('menu query contracts', () => {
  it('projects only apply capabilities and omits reference and undeclared keys', () => {
    const g: GlobalContext = {
      ...emptyGlobal,
      scopeId: 'ICH',
      from: '2026-09-25T09:00:00',
      to: '2026-09-26T09:00:00',
      roomNames: ['PHOTO'],
      condition: { axis: 'team', id: 'A1' },
      selection: ['EQ-1'],
      lotIds: ['LOT-1'],
      ppid: 'PP-1',
      recipeIds: ['RCP-1'],
      metricId: 'cycle_time',
      metricVersion: 'v3',
    };
    const projected = projectContext(endpoint({
      time: 'apply',
      roomNames: 'reference',
      condition: 'apply',
      selection: 'reference',
      lot: 'apply',
      ppid: 'apply',
      recipe: 'apply',
      metric: 'apply',
    }, true), g);

    expect(projected).toStrictEqual({
      scopeId: 'ICH',
      from: '2026-09-25T09:00:00',
      to: '2026-09-26T09:00:00',
      condition: { axis: 'team', id: 'A1' },
      lotIds: ['LOT-1'],
      ppid: 'PP-1',
      recipeIds: ['RCP-1'],
      metricId: 'cycle_time',
      metricVersion: 'v3',
    });
    expect(projected).not.toHaveProperty('roomNames');
    expect(projected).not.toHaveProperty('selection');

    const executionDetail = projectContext(endpoint({
      roomNames: 'reference',
      condition: 'reference',
      selection: 'reference',
    }, true), g);
    expect(executionDetail).toStrictEqual({ scopeId: 'ICH' });
    expect(executionDetail).not.toHaveProperty('roomNames');
    expect(executionDetail).not.toHaveProperty('condition');
    expect(executionDetail).not.toHaveProperty('selection');
  });

  it.each(idSetFields)('preserves null and [] for $globalKey', ({ contextKey, globalKey }) => {
    const context: Partial<Record<ContextKey, 'apply' | 'reference'>> = { [contextKey]: 'apply' };
    const spec = endpoint(context);

    expect(projectContext(spec, { ...emptyGlobal, [globalKey]: null })).toStrictEqual({ [globalKey]: null });
    expect(projectContext(spec, { ...emptyGlobal, [globalKey]: [] })).toStrictEqual({ [globalKey]: [] });
  });

  it('emits metricId and metricVersion together, preserving a null half', () => {
    expect(projectContext(endpoint({ metric: 'apply' }), {
      ...emptyGlobal,
      metricId: 'cycle_time',
      metricVersion: null,
    })).toStrictEqual({ metricId: 'cycle_time', metricVersion: null });
    expect(projectContext(endpoint({ metric: 'apply' }), {
      ...emptyGlobal,
      metricId: null,
      metricVersion: 'v3',
    })).toStrictEqual({ metricId: null, metricVersion: 'v3' });

    for (const capability of [undefined, 'reference'] as const) {
      const context = capability ? { metric: capability } : {};
      const projected = projectContext(endpoint(context), { ...emptyGlobal, metricId: 'cycle_time', metricVersion: 'v3' });
      expect(projected).not.toHaveProperty('metricId');
      expect(projected).not.toHaveProperty('metricVersion');
    }
  });

  it('emits both time fields for apply even when a value is null', () => {
    const projected = projectContext(endpoint({ time: 'apply' }), {
      ...emptyGlobal,
      from: null,
      to: '2026-09-26T09:00:00',
    });

    expect(projected).toStrictEqual({ from: null, to: '2026-09-26T09:00:00' });
  });

  it('includes required scope even when null and omits undeclared scope and time keys', () => {
    expect(projectContext(endpoint({}, true), emptyGlobal)).toStrictEqual({ scopeId: null });

    const unscoped = projectContext(endpoint({}), {
      ...emptyGlobal,
      scopeId: 'ICH',
      from: '2026-09-25T09:00:00',
      to: '2026-09-26T09:00:00',
    });
    expect(Object.keys(unscoped)).toStrictEqual([]);
    expect('scopeId' in unscoped).toBe(false);
    expect('from' in unscoped).toBe(false);
    expect('to' in unscoped).toBe(false);
  });

  it('emits keys in the fixed query identity order', () => {
    const projected = projectContext(endpoint({
      time: 'apply',
      roomNames: 'apply',
      condition: 'apply',
      selection: 'apply',
      lot: 'apply',
      ppid: 'apply',
      recipe: 'apply',
      metric: 'apply',
    }, true), {
      ...emptyGlobal,
      scopeId: 'ICH',
    });

    expect(Object.keys(projected)).toStrictEqual([
      'scopeId', 'from', 'to', 'roomNames', 'condition', 'selection', 'lotIds', 'ppid', 'recipeIds', 'metricId', 'metricVersion',
    ]);
  });

  it('does not mutate the input GlobalContext', () => {
    const g: GlobalContext = {
      ...emptyGlobal,
      roomNames: ['PHOTO'],
      selection: [],
      condition: { axis: 'makerModel', maker: 'AMX', model: 'XP8' },
    };
    const before: GlobalContext = {
      ...g,
      roomNames: [...g.roomNames!],
      selection: [...g.selection!],
      condition: { ...g.condition! } as GlobalContext['condition'],
    };

    projectContext(endpoint({ roomNames: 'apply', selection: 'apply', condition: 'apply' }), g);

    expect(g).toStrictEqual(before);
  });

  it('keeps defineEndpoint as an identity and supports heterogeneous specs and typed params', () => {
    const specA = {
      id: 'analytics.granularity',
      menuId: 'productivity-overview',
      paramKeys: ['granularity'] as const,
      permission: 'analytics:view' as const,
      requiresScope: false,
      context: { time: 'apply' as const },
      kinds: [],
      mergeTimeDomain: false,
    };
    const endpointA = defineEndpoint<{ granularity: 'hour' | 'day' }, { total: number }>(specA);
    const endpointB = defineEndpoint<{ cursor?: string }, { rows: string[] }>({
      id: 'analytics.cursor',
      menuId: 'productivity-overview',
      paramKeys: ['cursor'],
      permission: 'analytics:view',
      requiresScope: false,
      context: {},
      kinds: [],
      mergeTimeDomain: false,
    });
    const endpoints: readonly AnyEndpointSpec[] = [endpointA, endpointB];

    expect(endpointA).toBe(specA);
    expect(endpoints).toHaveLength(2);
    expect(projectContext(endpointA, emptyGlobal)).toStrictEqual({ from: null, to: null });

    const checkUseMenuQueryTypes = () => {
      const total: { total: number } = useMenuQueryShape(endpointA, { granularity: 'hour' });
      // @ts-expect-error a declared hour/day endpoint rejects week
      useMenuQueryShape(endpointA, { granularity: 'week' });
      void total;
    };
    void checkUseMenuQueryTypes;
  });
});
