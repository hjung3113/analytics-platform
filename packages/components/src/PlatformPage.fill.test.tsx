import { cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { PlatformPage, type PlatformPageProps } from './PlatformPage';

const features = { export: false, savedView: false, annotate: false, compare: false };
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features, pageKeys: [] }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const mount = (props: Partial<PlatformPageProps> = {}) => render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><PlatformPage {...props}><p>본문</p></PlatformPage></PlatformProvider></I18nProvider>);
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('PlatformPage layout', () => {
  it('fill: the root takes its container\'s height and the body may shrink under it', () => {
    mount({ layout: 'fill' });
    const root = document.querySelector<HTMLElement>('[data-platform-page]')!;
    expect(root).toHaveAttribute('data-page-layout', 'fill');
    expect(root).toHaveClass('h-full', 'min-h-0', 'flex', 'flex-col');
    const body = document.querySelector<HTMLElement>('[data-platform-page-content]')!;
    expect(body).toHaveClass('min-h-0', 'flex-1');
    expect(body).toContainElement(screen.getByText('본문'));
  });

  it('fill: the children sit in a remaining-height slot below the outcome banners, so the body never exceeds its height', () => {
    mount({ layout: 'fill' });
    const body = document.querySelector<HTMLElement>('[data-platform-page-content]')!;
    expect(body).toHaveClass('flex', 'flex-col');
    const slot = document.querySelector<HTMLElement>('[data-platform-page-fill]')!;
    expect(slot).toHaveClass('min-h-0', 'flex-1');
    expect(slot.parentElement).toBe(body);
    expect(slot).toContainElement(screen.getByText('본문'));
  });

  it.each<[string, Partial<PlatformPageProps>]>([['no prop', {}], ['flow', { layout: 'flow' }]])('%s: unchanged — grows with its content', (_name, props) => {
    mount(props);
    const root = document.querySelector<HTMLElement>('[data-platform-page]')!;
    expect(root).not.toHaveAttribute('data-page-layout');
    expect(root.className).toBe('flex min-h-full flex-col');
    expect(document.querySelector('[data-platform-page-content]')!.className).toBe('flex-1 px-8 pb-9 pt-7');
    expect(document.querySelector('[data-platform-page-fill]')).toBeNull();
  });
});
