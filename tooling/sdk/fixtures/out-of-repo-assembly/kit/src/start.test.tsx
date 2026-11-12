import { cleanup, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { setRole } from '@ap/mock-server';
import { startKitApp } from './start';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  setRole('engineer');
});

async function mountHost(): Promise<void> {
  const container = document.createElement('div');
  document.body.append(container);
  await startKitApp(container);
}

it('the Host mounts the shell with a cross-package probe (ui button, components audit timeline)', async () => {
  setRole('viewer');
  await mountHost();
  const probe = await screen.findByTestId('kit-probe');
  expect(probe.getAttribute('data-permissions')).toBeTruthy();
  expect((await screen.findAllByText('kit button')).length).toBeGreaterThan(0);
});

it('public synthetic menu renders for the public session (kernel permission)', async () => {
  setRole('viewer');
  await mountHost();
  expect((await screen.findAllByText('키트 개요')).length).toBeGreaterThan(0);
  expect(screen.queryAllByText('사내 업무')).toHaveLength(0);
});

it('in-house menu appears for the in-house session (kit:inhouse-view)', async () => {
  setRole('engineer');
  await mountHost();
  expect((await screen.findAllByText('키트 개요')).length).toBeGreaterThan(0);
  expect((await screen.findAllByText('사내 업무')).length).toBeGreaterThan(0);
});
