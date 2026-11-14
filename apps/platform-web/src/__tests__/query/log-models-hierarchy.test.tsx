import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testSession } from '@ap/kernel/testing';
import { stubHierarchyGeometry } from '@ap/components/testing';
import { AppShell } from '@ap/shell';
import { createAssembly } from '#platform-assembly';
import { registry } from '../../menus';
import { EQUIPMENT_AXES } from '../../equipmentAxes';

const project = '14470000-0000-4000-8000-000000000101';
const vendor = '14470000-0000-4000-8000-000000000011';
const process = '14470000-0000-4000-8000-000000000021';
let restore: () => void;
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage());
  localStorage.setItem('platform:sidebar-collapsed', '0'); localStorage.setItem('platform:role', 'admin');
  restore = stubHierarchyGeometry();
});
afterEach(() => { cleanup(); restore(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mount(path = '/log-dev/log-models?v=1') {
  window.history.replaceState(null, '', path);
  const assembly = await createAssembly({ registry });
  if (!('adapter' in assembly)) throw new Error('Expected a platform assembly');
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={registry} equipmentAxes={EQUIPMENT_AXES} adapter={{ ...assembly.adapter, session: () => session }}><AppShell><input aria-label="editor" /></AppShell></PlatformProvider></I18nProvider>);
  return within(await screen.findByRole('group', { name: '모델 계층' }));
}
it('renders the product tree from the assembled log-models mock and resolves the model target through Kernel', async () => {
  const tree = await mount();
  await tree.findByRole('link', { name: '한빛설비' });
  fireEvent.click(tree.getByRole('button', { name: '한빛설비 펼치기' }));
  await tree.findByRole('link', { name: '식각' });
  fireEvent.click(tree.getByRole('button', { name: '식각 펼치기' }));
  const model = await tree.findByRole('link', { name: '식각 모델' });
  expect(model.getAttribute('href')).toContain(`/log-dev/log-model-project/${project}`);
  fireEvent.click(model);
  await waitFor(() => expect(window.location.pathname).toBe(`/log-dev/log-model-project/${project}`));
  expect(new URLSearchParams(window.location.search).get('node')).toBe(`v/${vendor}/p/${process}/m/14470000-0000-4000-8000-000000000001`);
  await waitFor(() => expect(tree.getByRole('treeitem', { name: '식각 모델' }).getAttribute('aria-current')).toBe('location'));
});
it('restores the ancestor and current process from an object-filter deep link on a fresh mount', async () => {
  const tree = await mount(`/log-dev/log-models?v=1&vendorId=${vendor}&processId=${process}`);
  await tree.findByRole('link', { name: '식각' });
  await waitFor(() => expect(tree.getByRole('treeitem', { name: '식각' }).getAttribute('aria-current')).toBe('location'));
  expect(tree.getByRole('treeitem', { name: '한빛설비' }).getAttribute('aria-expanded')).toBe('true');
});

it.each(['', '/s/14470000-0000-4000-8000-000000000031'])('restores a project placement and its ancestors on a fresh mount (%s)', async suffix => {
  const node = `v/${vendor}/p/${process}/m/14470000-0000-4000-8000-000000000001${suffix}`;
  const tree = await mount(`/log-dev/log-model-project/${project}?v=1&node=${encodeURIComponent(node)}`);
  const label = suffix ? '3.2.1' : '식각 모델';
  await waitFor(() => expect(tree.getByRole('treeitem', { name: label }).getAttribute('aria-current')).toBe('location'));
  expect(tree.getByRole('treeitem', { name: '식각' }).getAttribute('aria-expanded')).toBe('true');
});
it('marks the unassigned model after its full-path list target is selected', async () => {
  const tree = await mount();
  fireEvent.click(await tree.findByRole('button', { name: '한빛설비 펼치기' }));
  fireEvent.click(await tree.findByRole('button', { name: '미분류 펼치기' }));
  fireEvent.click(await tree.findByRole('link', { name: '연마 모델' }));
  await waitFor(() => expect(tree.getByRole('treeitem', { name: '연마 모델' }).getAttribute('aria-current')).toBe('location'));
  expect(Object.fromEntries(new URLSearchParams(window.location.search))).toMatchObject({ vendorId: vendor, processId: 'none', modelId: '14470000-0000-4000-8000-000000000003' });
});
