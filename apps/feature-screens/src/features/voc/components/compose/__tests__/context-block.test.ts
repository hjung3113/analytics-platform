import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SHARED_ALLOWLISTS, type TipTapDoc } from '@ap/feature-shared';
import { appendContextBlock, type VocComposeContextBlock } from '../context-block';

// Exercise the real SDK serializer without adding a production SDK dependency to this frozen app.
const sdk = resolve(process.cwd(), '../../packages/sdk');
const { freezeVocContext } = await vi.importActual<{
  freezeVocContext: (input: Record<string, unknown>) => VocComposeContextBlock;
}>(resolve(sdk, 'shell/src/voc/vocContext.ts'));
const { emptyGlobal } = await vi.importActual<{ emptyGlobal: Record<string, null> }>(
  resolve(sdk, 'contracts/src/links/url.ts'),
);
const { createRegistry } = await vi.importActual<{
  createRegistry: (definition: Record<string, unknown>) => { menus: { id: string }[] };
}>(resolve(sdk, 'kernel/src/registry/registry.ts'));

const registry = createRegistry({
  spaces: [],
  groups: [{ id: 'analysis', label: { ko: '분석', en: 'Analysis' }, space: null }],
  menus: [{
    id: 'equipment', group: 'analysis', primary: true,
    label: { ko: '설비 분석', en: 'Equipment analysis' },
    description: { ko: '', en: '' }, path: '/analysis/equipment',
    permission: 'platform:view', requiresScope: false, context: {},
    pageType: 'analysis', features: { export: false, savedView: false, annotate: false, compare: false },
    pageKeys: [],
  }],
});
const doc: TipTapDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '합성 재현 내용' }] }] };
const notice = { type: 'paragraph', content: [{ type: 'text', text: '화면 링크가 너무 길어 첨부하지 못했습니다.' }] };

describe('VOC screen context attachment', () => {
  it('matches the server href limit at the attachment boundary', () => {
    const schema = SHARED_ALLOWLISTS['voc-description'].markAttrs.link?.href;
    expect(schema).toMatchObject({ kind: 'url', maxLen: 2048 });
    if (schema?.kind !== 'url') throw new Error('Expected the server href URL schema');
    const href = `https://app.test/${'a'.repeat(schema.maxLen - 'https://app.test/'.length)}`;
    const items = [{ label: '화면', value: '합성 분석' }];
    expect(appendContextBlock(doc, { items, href }).content).toContainEqual({
      type: 'paragraph', content: [{ type: 'text', text: '화면 열기', marks: [{ type: 'link', attrs: { href } }] }],
    });
    const overLimit = appendContextBlock(doc, { items, href: `${href}a` });
    expect(overLimit.content).toContainEqual(notice);
    expect(JSON.stringify(overLimit)).not.toContain('"type":"link"');
  });

  it.each([
    [63, 2045, false],
    [64, 2074, true],
  ])('attaches a link or a visible notice for %i selected equipment', (count, length, tooLong) => {
    const context = freezeVocContext({
      route: { menu: registry.menus[0], params: {}, viaAlias: false },
      platformScreen: null, registry, page: [], lang: 'ko', axes: [], asOf: '',
      // Synthetic deployment prefix makes these the issue's exact 2,045/2,074-character links.
      absoluteUrl: (path: string) => `https://app.test/${'p'.repeat(109)}${path}`,
      global: {
        ...emptyGlobal,
        from: '2026-10-20T09:00:00', to: '2026-10-23T18:00:00', lineNames: ['L1'],
        selection: Array.from({ length: count }, (_, i) => `EQ-${String(i + 1).padStart(4, '0')}`),
      },
    });
    expect(context.href).toHaveLength(length);
    const result = appendContextBlock(doc, context);
    expect(result.content?.[0]).toEqual(doc.content?.[0]);
    const link = { type: 'paragraph', content: [{ type: 'text', text: '화면 열기', marks: [{ type: 'link', attrs: { href: context.href } }] }] };
    if (tooLong) {
      expect(result.content).toContainEqual(notice);
      expect(result.content).not.toContainEqual(link);
    } else {
      expect(result.content).toContainEqual(link);
      expect(result.content).not.toContainEqual(notice);
    }
  });
});
