import type { ModuleManifest, ModuleScreenMeta } from '@ap/contracts';

const unsupported = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const screen = (id: string, path: string, over: Partial<ModuleScreenMeta>): ModuleScreenMeta => ({
  id, group: 'fixture:main', label: { ko: id, en: id }, description: { ko: '', en: '' }, path, permission: 'fixture:view', requiresScope: false,
  context: unsupported, pageType: 'catalog', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], ...over,
});

/** A module that exists only to exercise the host port (ADR-0053): it is not mounted in any app. */
export const manifest: ModuleManifest = {
  module: { id: 'fixture', label: { ko: '픽스처', en: 'Fixture' }, contract: 1, languages: ['ko', 'en'] },
  requires: ['query'],
  optional: ['detailSlot', 'write'],
  config: ['apiBase'],
  groups: [{ id: 'fixture:main', label: { ko: '픽스처', en: 'Fixture' } }],
  screens: [
    screen('list', '', { primary: true, pageKeys: ['page'] }),
    screen('item', 'items/:id', { navHidden: true, parent: 'list', pageKeys: ['tab'] }),
  ],
};
