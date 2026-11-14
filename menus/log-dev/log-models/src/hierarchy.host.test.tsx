// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Cpu } from 'lucide-react';
import { groupId, spaceId, type ApiResponse, type HierarchyNode, type HierarchyPage, type MenuQuery } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, usePlatform } from '@ap/kernel';
import { memoryStorage, settleQueries, testAdapter, testSession } from '@ap/kernel/testing';
import { HierarchyNav, useHierarchyNavState } from '@ap/components';
import { stubHierarchyGeometry } from '@ap/components/testing';
import { TooltipProvider } from '@ap/ui';
import { GATE_DECIDE, ISSUE_CONTRIBUTE, ISSUE_LINK, PROJECT_MANAGE, ROUND_MANAGE } from './endpoints';
import { ModelHierarchySource, modelHierarchyIcon } from './hierarchy';
import { manifests } from './index';

const V1 = '11111111-1111-4111-8111-111111111111';
const P1 = '22222222-2222-4222-8222-222222222222';
const V2 = '33333333-3333-4333-8333-333333333333';
const ok = (data: unknown): ApiResponse<never> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'hierarchy-host' }) as ApiResponse<never>;

const registry = createRegistry({
  permissions: [PROJECT_MANAGE, ROUND_MANAGE, GATE_DECIDE, ISSUE_CONTRIBUTE, ISSUE_LINK],
  spaces: [{ id: spaceId('logDev'), label: { ko: '로그', en: 'Log' }, description: { ko: '개발 모델 관리', en: 'Model development' }, homeMenuId: 'log-models' }],
  groups: [{ id: groupId('logModels'), label: { ko: '모델', en: 'Models' }, icon: Cpu, space: spaceId('logDev') }],
  menus: manifests,
});

let platform!: ReturnType<typeof usePlatform>;
function HostProbe({ children }: { children?: ReactNode }) {
  platform = usePlatform();
  return <>{children}</>;
}

function SidebarModelNav() {
  const state = useHierarchyNavState('log-models');
  return (
    <ModelHierarchySource>
      {source => (
        <HierarchyNav
          menuId="log-models"
          label="모델 계층"
          mode="tree"
          source={source}
          state={state}
          levelIcon={modelHierarchyIcon}
        />
      )}
    </ModelHierarchySource>
  );
}

let restoreGeometry: () => void;
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  restoreGeometry = stubHierarchyGeometry();
  Element.prototype.scrollIntoView = vi.fn();
  window.history.replaceState(null, '', '/logDev/log-models?v=1&scopeId=S1');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  restoreGeometry();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const click = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const changeInput = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const settle = async () => {
  await act(async () => {
    await settleQueries();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
};

describe('ModelHierarchySource integration (#2028 C1)', () => {
  it('keeps expanded branches, search query and cached pages across ordinary route/page updates, and resets/aborts on Scope change', async () => {
    const queries: Array<{ op: unknown; parentId: unknown; scopeId: string | null }> = [];
    let pendingSignal: AbortSignal | undefined;
    let resolvePending: ((value: ApiResponse<never>) => void) | undefined;

    const vendor1: HierarchyNode = { id: `v/${V1}`, kind: 'vendor', label: 'Vendor S1', hasChildren: true };
    const vendor2: HierarchyNode = { id: `v/${V2}`, kind: 'vendor', label: 'Vendor Pending', hasChildren: true };
    const proc1: HierarchyNode = { id: `v/${V1}/p/${P1}`, parentId: `v/${V1}`, kind: 'process', label: 'Process S1', hasChildren: false };
    const vendorS2: HierarchyNode = { id: `v/${V2}`, kind: 'vendor', label: 'Vendor S2', hasChildren: false };

    const session = testSession(['platform:view']);
    let currentScope: string | null = 'S1';
    const adapter = testAdapter({
      session: () => session,
      menuQuery: (q: MenuQuery<Record<string, unknown>>, signal?: AbortSignal) => {
        const p = q.params as Record<string, unknown>;
        queries.push({ op: p.op, parentId: p.parentId ?? null, scopeId: currentScope });
        if (p.op === 'children' && p.parentId === null) {
          const page: HierarchyPage = currentScope === 'S1' ? { nodes: [vendor1, vendor2] } : { nodes: [vendorS2] };
          return Promise.resolve(ok(page));
        }
        if (p.op === 'children' && p.parentId === `v/${V1}`) {
          return Promise.resolve(ok({ nodes: [proc1] } satisfies HierarchyPage));
        }
        if (p.op === 'children' && p.parentId === `v/${V2}`) {
          pendingSignal = signal;
          return new Promise<ApiResponse<never>>(resolve => { resolvePending = resolve; });
        }
        if (p.op === 'search') {
          return Promise.resolve(ok({ nodes: [proc1] } satisfies HierarchyPage));
        }
        if (p.op === 'ancestors') {
          return Promise.resolve(ok([vendor1]));
        }
        return Promise.resolve(ok({ nodes: [] }));
      },
    });

    await act(async () => {
      root.render(
        <I18nProvider>
          <PlatformProvider registry={registry} adapter={adapter}>
            <TooltipProvider>
              <HostProbe>
                <SidebarModelNav />
              </HostProbe>
            </TooltipProvider>
          </PlatformProvider>
        </I18nProvider>,
      );
    });
    await settle();

    expect(container.textContent).toContain('Vendor S1');

    // Expand Vendor S1 so branch expansion and child page are populated.
    const expandV1 = container.querySelector<HTMLButtonElement>('button[aria-label="Vendor S1 펼치기"]')!;
    expect(expandV1).toBeTruthy();
    await click(expandV1);
    await settle();
    expect(container.textContent).toContain('Process S1');

    // Type a search string (preserving expansion in snapshot while searching).
    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await changeInput(search, 'proc');
    expect(search.value).toBe('proc');

    // Trigger an ordinary same-Scope page/route update so HostPlatform re-renders ModelHierarchySource with a fresh fetch closure.
    const callsBeforeUpdate = queries.length;
    await act(async () => {
      platform.setPage({ q: 'etch' });
    });
    await settle();

    expect(search.value).toBe('proc');
    expect(queries.length).toBe(callsBeforeUpdate);

    // Clear search and verify the previously expanded branch & cached child remain without re-fetching.
    await changeInput(search, '');
    await settle();
    expect(container.textContent).toContain('Process S1');
    expect(queries.length).toBe(callsBeforeUpdate);

    // Start an in-flight request on Vendor Pending, then change Scope.
    const expandV2 = container.querySelector<HTMLButtonElement>('button[aria-label="Vendor Pending 펼치기"]')!;
    await click(expandV2);
    await settle();
    expect(pendingSignal).toBeTruthy();
    expect(pendingSignal!.aborted).toBe(false);

    currentScope = 'S2';
    await act(async () => {
      platform.setGlobal({ scopeId: 'S2' });
    });
    await settle();

    // Changing Scope aborts the in-flight request, resets old state, and loads the new Scope.
    expect(pendingSignal!.aborted).toBe(true);
    expect(container.textContent).toContain('Vendor S2');
    expect(container.textContent).not.toContain('Vendor S1');
    expect(container.textContent).not.toContain('Process S1');

    // Late resolution of the aborted S1 request is ignored.
    await act(async () => {
      resolvePending!(ok({ nodes: [{ id: 'late-s1', kind: 'process', label: 'Late S1 Child', hasChildren: false }] }));
      await settleQueries();
    });
    expect(container.textContent).not.toContain('Late S1 Child');
  });
});
