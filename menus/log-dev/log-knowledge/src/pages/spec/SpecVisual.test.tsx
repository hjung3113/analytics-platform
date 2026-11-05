// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { BookOpen } from 'lucide-react';
import { groupId, menuPermission, spaceId, type ApiResponse } from '@ap/contracts';
import { manifests } from '../../index';
import { type ModelSpecData, type SpecChangeRow, type SpecTargetKind } from '../../endpoints';
import SpecScreen from './SpecScreen';
const modelId = '00000003-0000-4000-8000-000000000008', sw = '00000004-0000-4000-8000-00000000000e', rev = '00000007-0000-4000-8000-000000000001';
const ok = (data: unknown) => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'visual-test' }) as ApiResponse<never>;
const basis: ModelSpecData = { revision: { id: rev, modelId, revisionNo: 4, state: 'published', schemaVersion: 1, sourceDocRef: { docLabel: 'Alpha log specification', docVersion: '2.1' }, contentSha256: null, publishedAt: null, publishedBy: null }, modules: [{ id: 'm1', moduleKey: 'ARM', name: 'Arm', parentModuleId: null }], events: [{ id: 'e1', moduleId: 'm1', eventKey: 'MOVE', name: 'Move', fields: [], triggerRule: 'on move', detailDocRef: null }], relations: [] };
const change: SpecChangeRow = { id: '00000007-0000-4000-8000-000000000002', softwareId: sw, softwareLabel: 'v1.0', endsBeforeSoftwareId: null, endsBeforeLabel: null, targetKind: 'event', targetKey: 'ARM/MOVE', changeKind: 'changed', change: { before: { name: 'Move', triggerRule: 'on move', detailDocRef: null }, after: { name: 'Move', triggerRule: 'after ready', detailDocRef: null } }, note: null, evidenceRef: 'Release notes §2', basedOnRevNo: 3, needsRevalidation: true, revalidationRevNo: 4, retiredAt: null, retiredBy: null, retiredByChangeId: null, createdAt: '2026-11-01T00:00:00Z', createdBy: 'admin', version: 1 };
const registry = createRegistry({ permissions: [menuPermission('knowledge:spec-publish'), menuPermission('knowledge:catalog-manage')], spaces: [{ id: spaceId('logDev'), label: { ko: '로그', en: 'Log' }, description: { ko: '로그 개발', en: 'Log development' }, homeMenuId: 'log-knowledge-models' }], groups: [{ id: groupId('logKnowledge'), label: { ko: '지식', en: 'Knowledge' }, icon: BookOpen, space: spaceId('logDev') }], menus: manifests });
let restoreGeometry: () => void;
beforeEach(() => { restoreGeometry = stubCompactTableGeometry(); HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup(); restoreGeometry(); vi.restoreAllMocks(); });
function Slot() { const slot = useDetailPanelSlotHost(); return <aside ref={slot.ref} />; }
function mount(search = '', lang: 'ko' | 'en' = 'ko', spec: unknown = basis, rows = [change]) {
  let language = lang;
  Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => language, setItem: (_key: string, next: 'ko' | 'en') => { language = next; }, removeItem: () => { language = 'ko'; } } });
  window.history.replaceState(null, '', `/logDev/log-knowledge-spec/${modelId}?v=1${search}`);
  const session = testSession(['platform:view', 'knowledge:spec-publish']);
  const adapter = testAdapter({ session: () => session, menuQuery: async req => {
    if (req.endpoint === 'logKnowledge.modelProfile') return ok({ model: { id: modelId, name: 'Alpha 100', code: 'A-100', vendor: { name: 'Alpha Semicap' } } });
    if (req.endpoint === 'logKnowledge.modelSpec') return ok(spec);
    if (req.endpoint === 'logKnowledge.softwareVersions') return ok({ rows: [{ id: sw, versionLabel: 'v1.0', releaseOrder: 1 }], total: 1 });
    if (req.endpoint === 'logKnowledge.specChanges') return ok({ rows, total: rows.length });
    if (req.endpoint === 'logKnowledge.modelSpecRevisions') return ok({ rows: [], total: 0 });
    if (req.endpoint === 'logKnowledge.specDraft') return ok({ ...basis, revision: { ...basis.revision, state: 'draft', revisionNo: 5, version: 1 } });
    return ok(null);
  } });
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><SpecScreen params={{ modelId }} /><Slot /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
}
describe('confirmed A visual content', () => {
  it.each(['ko', 'en'] as const)('names the model, code and vendor even without a published spec (%s)', async lang => {
    mount('', lang, null);
    const context = await screen.findByRole('link', { name: /Alpha 100.*A-100.*Alpha Semicap/ });
    expect(context.getAttribute('href')).toContain(modelId);
    expect(context.closest('nav')?.getAttribute('aria-label')).toBe(lang === 'ko' ? '이동 경로' : 'Breadcrumb');
  });
  it.each(['ko', 'en'] as const)('summarizes changed properties and reveals the original JSON on demand (%s)', async lang => {
    mount('&tab=changes', lang);
    const target = await screen.findByText('ARM/MOVE');
    const card = within(target.closest('article')!);
    expect(card.getByText(lang === 'ko' ? '발생 조건' : 'Trigger')).toBeTruthy();
    expect(card.getByText(lang === 'ko' ? '전: on move → 후: after ready' : 'Before: on move → After: after ready')).toBeTruthy();
    expect(card.getByText(/Release notes §2/)).toBeTruthy();
    const disclosure = card.getByRole('button', { name: lang === 'ko' ? '원본 JSON 보기' : 'View original JSON' });
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    expect(card.queryByText(/"before"/)).toBeNull();
    fireEvent.click(disclosure);
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    expect(card.getByText(/"before"/).textContent).toContain('"name": "Move"');
    fireEvent.click(disclosure);
    expect(card.queryByText(/"before"/)).toBeNull();
  });
  it.each(['retire', 'confirm'])('uses the readable comparison in the %s drawer', async mode => {
    mount(`&tab=changes&drawer=${mode}&change=${change.id}`);
    const drawer = await screen.findByRole('dialog', { name: mode === 'retire' ? '변경점 닫기·대체' : '변경점 재검토 확인' });
    expect(within(drawer).getByText('전: on move → 후: after ready')).toBeTruthy();
    expect(within(drawer).queryByText(/"before"/)).toBeNull();
    expect(within(drawer).getByRole('button', { name: '원본 JSON 보기' })).toBeTruthy();
  });
  it.each(['module', 'event', 'field', 'relation'] as SpecTargetKind[])('provides valid, concrete JSON examples for %s', async kind => {
    mount('&drawer=add');
    const picker = await screen.findByRole('combobox', { name: '대상 종류' });
    fireEvent.keyDown(picker, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: kind }));
    const hint = (label: string) => {
      const input = screen.getByLabelText(label);
      const text = document.getElementById(input.getAttribute('aria-describedby')!)?.textContent ?? '';
      expect(text).toContain('예: ');
      return JSON.parse(text.slice(text.indexOf('{')));
    };
    const target = hint('대상 (JSON)');
    const expectedTargets = { module: { module: 'Arm' }, event: { module: 'Arm', event: 'Move' }, field: { module: 'Arm', event: 'Move', field: 'pressure' }, relation: { sourceModule: 'Arm', sourceEvent: 'Move', predicate: 'precedes', targetModule: 'Arm', targetEvent: 'Stop' } };
    expect(target).toEqual(expectedTargets[kind]);
    const changeKind = screen.getByRole('combobox', { name: '변경 종류' });
    fireEvent.keyDown(changeKind, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: '변경' }));
    const before = hint('변경 전 (JSON)'), after = hint('변경 후 (JSON)');
    const expectedKeys = { module: ['name', 'parentModule'], event: ['name', 'triggerRule', 'detailDocRef'], field: ['name', 'type', 'unit', 'description'], relation: ['ruleRef'] };
    for (const side of [before, after]) {
      expect(Object.keys(side)).toEqual(expectedKeys[kind]);
      if (kind !== 'relation') expect(side.name).toBe(kind === 'module' ? 'Arm' : kind === 'event' ? 'Move' : 'pressure');
      if (kind === 'field') { expect(side.type).toBe('float'); expect(side.description).toBe('Chamber pressure'); }
    }
    expect(before).not.toEqual(after);
  });
  it.each(['ko', 'en'] as const)('explains empty Event fields, relations and connected changes (%s)', async lang => {
    mount('&drawer=event&change=ARM%2FMOVE', lang, basis, []);
    const drawer = await screen.findByRole('dialog', { name: 'Move' });
    expect(within(drawer).getByText(lang === 'ko' ? '정의된 필드가 없습니다.' : 'No fields are defined.')).toBeTruthy();
    expect(within(drawer).getByText(lang === 'ko' ? '정의된 관계가 없습니다.' : 'No relations are defined.')).toBeTruthy();
    expect(await within(drawer).findByText(lang === 'ko' ? '연결된 변경점이 없습니다.' : 'No connected changes.')).toBeTruthy();
  });
  it('shows populated fields and contributing change provenance, with a path to the change', async () => {
    const effective = { ...basis, effective: true, softwareId: sw, modules: basis.modules.map(m => ({ ...m, parentModuleKey: null, origin: 'revision', changed: [], needsRevalidation: false })), events: basis.events.map(e => ({ ...e, moduleKey: 'ARM', origin: 'change', changed: [{ changeId: change.id, changeKind: 'changed', targetKind: 'event', targetKey: change.targetKey }], needsRevalidation: true, fields: [{ name: 'pressure', type: 'float', unit: 'Pa', description: 'Chamber pressure' }] })), removed: [], stale: [] };
    mount(`&software=${sw}&drawer=event&change=ARM%2FMOVE`, 'ko', effective);
    const drawer = await screen.findByRole('dialog', { name: 'Move' });
    expect(within(drawer).getByText('pressure')).toBeTruthy();
    expect(within(drawer).getByText('Chamber pressure')).toBeTruthy();
    const connected = within(drawer).getByRole('region', { name: '연결된 변경점' });
    expect(await within(connected).findByText(/Release notes §2/)).toBeTruthy();
    expect(within(connected).getByText(/기준 r3/)).toBeTruthy();
    expect(within(connected).getByText('재검토 필요')).toBeTruthy();
    fireEvent.click(within(connected).getByRole('button', { name: /변경점 보기/ }));
    expect(await screen.findByRole('dialog', { name: '변경점 닫기·대체' })).toBeTruthy();
  });
  it.each(['ko', 'en'] as const)('identifies model, draft revision and source in the publication confirmation (%s)', async lang => {
    mount('&drawer=draft&revision=' + rev, lang);
    await screen.findByLabelText(lang === 'ko' ? '명세 TSV' : 'Specification TSV');
    fireEvent.click(screen.getByRole('button', { name: lang === 'ko' ? '발행' : 'Publish' }));
    const dialog = await screen.findByRole('dialog', { name: lang === 'ko' ? '명세 발행 확인' : 'Publish specification?' });
    expect(within(dialog).getByText(/Alpha 100.*A-100.*Alpha Semicap/)).toBeTruthy();
    expect(within(dialog).getByText(lang === 'ko' ? '초안 Revision: r5' : 'Draft revision: r5')).toBeTruthy();
    expect(within(dialog).getByText(/Alpha log specification · 2.1/)).toBeTruthy();
  });
});
