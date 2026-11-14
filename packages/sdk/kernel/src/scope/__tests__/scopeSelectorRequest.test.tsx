import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider, PlatformProvider, createRegistry } from '../../index';
import { useHostPlatform } from '../../host';
import { House } from 'lucide-react';
import { groupId, spaceId } from '@ap/contracts';
import { noContext, testAdapter, testSession, testSpace } from '../../testing';
import { createScopeSelectorRequest } from '../scopeSelectorRequest';

describe('Scope selector host request (#1938)', () => {
  it('opens the most recently mounted selector and reports availability changes', () => {
    const request = createScopeSelectorRequest();
    const changed = vi.fn();
    request.subscribe(changed);
    expect(request.available()).toBe(false);
    request.open(); // no selector: a no-op, not an error

    const first = vi.fn();
    const second = vi.fn();
    const offFirst = request.answer(first);
    expect(request.available()).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    const offSecond = request.answer(second);
    request.open();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();

    offSecond();
    offSecond(); // a repeated unregister removes nothing else
    request.open();
    expect(first).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
    offFirst();
    expect(request.available()).toBe(false);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('is one stable channel on the host value', () => {
    const registry = createRegistry({
      spaces: [testSpace()],
      groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
      menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
    });
    const seen: unknown[] = [];
    function Probe() {
      const { scopeSelector } = useHostPlatform();
      seen.push(scopeSelector);
      return <p>probe</p>;
    }
    const session = testSession(['platform:view']);
    const adapter = testAdapter({ session: () => session });
    const view = render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
    view.rerender(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
    expect(screen.getByText('probe')).toBeTruthy();
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen).size).toBe(1);
    expect(typeof (seen[0] as { open: unknown }).open).toBe('function');
  });
});
