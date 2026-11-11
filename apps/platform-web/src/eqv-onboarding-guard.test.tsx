// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Suspense, type ComponentType } from 'react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ActionResponse, ApiResponse, MenuAction, MenuQuery } from '@ap/contracts';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { useLeaveRequest } from '@ap/kernel/host';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { EQUIPMENT_AXES } from './equipmentAxes';
import { registry } from './menus';

// The unsaved Mapping guard of 설비 온보딩 (#1658, kernel §6.4, ADR-0115): a step tab or Back is a push to another address, so dirty Board
// edits ask first. The shell's leave dialog is drawn by a stand-in over `useLeaveRequest` (a menu test cannot import the host entry).
vi.setConfig({ testTimeout: 30000 });

const seedDir = join(process.cwd(), '../../menus/tools/topview-studio/src/mock/onboarding');
const seed = <T,>(name: string): T => JSON.parse(readFileSync(join(seedDir, name), 'utf8')) as T;
const G1 = '23e9e214b396bfaa4539e7b30c5f8f9163fbac6c50201430231f641ff7c822ba';
const ok = (data: unknown): ApiResponse<never> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'fixture' }) as ApiResponse<never>;
const empty = (): ApiResponse<never> => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }) as ApiResponse<never>;
const rules = seed<Record<string, unknown>>('rules.json');
const bindings = seed<Record<string, { bindings: unknown[] }>>('bindings.json')['eq-synth-01']!;
const READS: Record<string, (p: Record<string, string>) => ApiResponse<never>> = {
  'eqv.equipmentScopes': () => ok({ equipmentId: 'eq-synth-01', vendorId: 'synth-maker', modelId: 'synth-model' }),
  'eqv.sampleWindows': () => ok({ rows: seed<Record<string, unknown[]>>('windows.json')['eq-synth-01'] }),
  'eqv.observedInventory': () => ok(seed<Record<string, unknown>>('inventories.json')[G1]),
  'eqv.typeDictionary': (p) => (p.level === 'model' ? ok({ document: seed<Record<string, unknown>>('dictionaries.json')['model/synth-maker/synth-model'], version: '1' }) : empty()),
  'eqv.aliasRules': (p) => { const doc = rules[p.level === 'model' ? 'model/synth-maker/synth-model' : `equipment/${p.equipmentId}`]; return p.level !== 'maker' && doc ? ok({ document: doc, version: '1' }) : empty(); },
  // The server's answer shapes (`apps/platform-api/src/modules/eqv/onboarding-endpoints.ts`).
  'eqv.bindings': () => ok({ document: bindings, version: String(bindings.bindings.length) }),
  'eqv.mappingVersion': (p) => ok({ layoutRevision: null, publishedAt: '2026-11-10T00:00:00.000Z', document: seed<Record<string, Record<string, unknown>>>('mappings.json')['eq-synth-01']![p.hash!] }),
  'eqv.fleet': () => ok({ rows: [] }),
  'eqv.baselineInventory': () => empty(),
  'eqv.layoutDraft': (p) => ok({ id: 'row', layoutId: p.layoutId, version: '1', document: seed('layout-eq-synth-01.json'), updatedAt: '2026-11-10T00:00:00.000Z' }),
  'eqv.layoutRevisions': () => ok({ rows: [] }),
  'eqv.bundledTemplates': () => ok({ rows: seed('templates.json') }),
};
const session = testSession(['platform:view', 'eqv-studio:view', 'eqv:view', 'eqv-studio:rules-edit', 'eqv-studio:mapping-publish'], { user: { id: 'u', name: 'u', title: { ko: '사용자', en: 'User' } } });
const writes: MenuAction[] = [];
const adapter = testAdapter({
  menuQuery: async (req: MenuQuery) => READS[req.endpoint]!(req.params as Record<string, string>),
  menuAction: async (req: MenuAction) => { writes.push(req); return { outcome: 'ok', data: null, version: '2', fieldErrors: [], replayed: false, correlationId: 'fixture' } as unknown as ActionResponse<never>; },
  session: () => session,
});

function LeaveHost() {
  const request = useLeaveRequest();
  return request ? <div role="alertdialog" aria-label="이동 확인"><button onClick={request.cancel}>머무르기</button><button onClick={request.confirm}>나가기</button></div> : null;
}
const slow = { timeout: 8000 };
const Screen = registry.menuById('eqv-onboarding').component as unknown as ComponentType;
/** Opens the equipment's 데이터 step, then Mapping with the tab: a Kernel push, so Back has a stamped entry to return to. */
async function mount() {
  window.history.replaceState(null, '', '/tools/eqv-onboarding?v=1&equipment=eq-synth-01');
  render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter} equipmentAxes={EQUIPMENT_AXES}><Suspense fallback={null}><Screen /></Suspense><LeaveHost /></PlatformProvider></I18nProvider>);
  fireEvent.mouseDown(await screen.findByRole('tab', { name: /^Mapping/ }, slow), { button: 0 });
  await waitFor(() => expect(step()).toBe('mapping'), slow);
}
const step = () => new URLSearchParams(window.location.search).get('step');
const leaveDialog = () => screen.findByRole('alertdialog', { name: '이동 확인' }, slow);
const pm1 = () => screen.getByRole('option', { name: /^PM1,/ });
async function ignorePm1() {
  const list = await screen.findByRole('listbox', { name: 'Alias 목록' }, slow);
  fireEvent.click(pm1());
  fireEvent.keyDown(list, { key: 'i' });
  expect(await screen.findByText('저장 안 됨 · Model', {}, slow)).toBeTruthy();
}
afterEach(() => { cleanup(); writes.length = 0; });

describe('unsaved Mapping guard of 설비 온보딩', () => {
  it('a step tab asks: Stay keeps the tab and the edits; Leave moves and drops them, writing nothing', async () => {
    await mount();
    await ignorePm1();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^Inventory/ }), { button: 0 });
    fireEvent.click(within(await leaveDialog()).getByRole('button', { name: '머무르기' }));
    expect(step()).toBe('mapping');
    expect(within(pm1()).getByText(/무시/)).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^Inventory/ }), { button: 0 });
    fireEvent.click(within(await leaveDialog()).getByRole('button', { name: '나가기' }));
    await waitFor(() => expect(step()).toBe('inventory'), slow);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^Mapping/ }), { button: 0 });
    await screen.findByRole('listbox', { name: 'Alias 목록' }, slow);
    expect(within(pm1()).queryByText(/무시/)).toBeNull();
    expect(writes).toEqual([]);
  });

  it('Back asks too: Stay keeps the Mapping tab and the edits', async () => {
    await mount();
    await ignorePm1();
    act(() => window.history.back());
    fireEvent.click(within(await leaveDialog()).getByRole('button', { name: '머무르기' }));
    await waitFor(() => expect(step()).toBe('mapping'), slow);
    expect(within(pm1()).getByText(/무시/)).toBeTruthy();
  });
});
