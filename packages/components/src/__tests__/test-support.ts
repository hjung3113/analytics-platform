import { createElement, Fragment } from 'react';
import { render } from '@testing-library/react';
import { House } from 'lucide-react';
import { I18nProvider, PlatformProvider, createRegistry, useI18n, usePlatform } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AnalysisChart, type ChartSpec } from '../AnalysisChart';

export function ChangeContext() {
  const { setGlobal } = usePlatform();
  const { setLang } = useI18n();
  return createElement(Fragment, null,
    createElement('button', { onClick: () => setLang('en') }, 'english'),
    createElement('button', { onClick: () => setGlobal({ scopeId: 'FDRY' }) }, 'context'));
}
export function mount(spec: ChartSpec, canExport = false, hasRoute = true, controls = true, interactions = true) {
  window.history.replaceState(null, '', hasRoute ? '/?v=1&scopeId=MEM' : '/missing?v=1&scopeId=MEM');
  const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: 'overview', label: { ko: 'G', en: 'G' }, icon: House, space: 'analytics' }], menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: { export: canExport, compare: interactions, annotate: interactions, savedView: false }, pageKeys: [] }] });
  const session = testSession(['platform:view']);
  const adapter = testAdapter({ session: () => session });
  const wrap = (next: ChartSpec) => createElement(I18nProvider, null,
    createElement(PlatformProvider, { adapter, registry, children: createElement(Fragment, null,
      controls && createElement(ChangeContext),
      createElement(AnalysisChart, { chartId: 'test', title: 'Chart', unit: 'ea', spec: next })) }));
  const view = render(wrap(spec));
  return { ...view, update: (next: ChartSpec) => view.rerender(wrap(next)) };
}
