import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spaceId } from '@ap/contracts';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { scopeControlSlot } from '@ap/feature-bridge/scope-control';
import { LAZY_MOUNT_WAIT } from '@ap/feature-bridge/testing';
import { manifests } from './index';
import { mountAt } from './test-support';

type PickerProps = { capability?: string; onChange: (id: string | undefined) => void };
const picker = vi.hoisted(() => ({ props: [] as PickerProps[] }));
vi.mock('@ap/feature-screens/operator-screens/scope-picker', () => ({
  ManagedSystemScopeControl: (props: PickerProps) => { picker.props.push(props); return <div data-testid="picker" />; },
}));

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); picker.props.length = 0; setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

// #2632: the sidebar picker marks «범위 밖» by `survey.read`, the capability the Survey list routes scope by, not the VOC default.
describe('목록 범위 capability on the Survey menus', () => {
  it.each(['survey-management', 'survey-builder', 'survey-results', 'survey-follow-up'])('passes survey.read to the picker on %s', async id => {
    const menu = manifests.find(entry => entry.id === id)!;
    const Control = scopeControlSlot.For(spaceId('flow'), menu)!;
    mountAt(menu.path, { extra: <Control /> });
    await screen.findByTestId('picker', undefined, LAZY_MOUNT_WAIT);
    expect(picker.props.at(-1)?.capability).toBe('survey.read');
  });
});
