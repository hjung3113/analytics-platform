import { describe, expect, it } from 'vitest';
import type { MenuView, SavedView } from '@ap/contracts';
import { diagnoseSavedView } from '@ap/kernel';
import { manifests } from './index';
import { CYCLE_TIME_SAVED_VIEW as SUPPORT } from './saved-view';

const manifest = manifests.find(m => m.id === 'cycle-time')!;
const CAN_VIEW = { canView: true } as const;
const diagnose = (view: SavedView) => diagnoseSavedView(view, SUPPORT, { capabilities: CAN_VIEW, knownAxisIds: ['maker', 'model'] });
const menuView = (over: Partial<MenuView> = {}): SavedView => ({
  id: 'v1', schemaVersion: 1, kind: 'menu-view', name: '내 점검', ownerId: 'engineer', version: 1, updatedAt: 0,
  menuId: SUPPORT.menuId, menuSchemaVersion: SUPPORT.menuSchemaVersion,
  context: { relativePeriod: { hours: 24 }, roomNames: ['PHOTO'] }, page: { granularity: ['day'], percentile: ['p95'] }, chartOptions: {}, layout: null, panels: null,
  visibility: { kind: 'private' }, approval: 'none', ...over,
});

describe('사이클타임 상세 Saved View 지원 선언 (06 §21)', () => {
  it('옵트인: features.savedView가 켜져 있고 메뉴 id가 매니페스트와 같다', () => {
    expect(manifest.features.savedView).toBe(true);
    expect(SUPPORT.menuId).toBe(manifest.id);
  });

  it('선언한 Context 키는 매니페스트가 지원하는(unsupported가 아닌) 키이고 pageKeys는 매니페스트와 같다', () => {
    const capability = manifest.context as Record<string, string>;
    for (const key of SUPPORT.contextKeys) expect(capability[key], key).toMatch(/^(apply|reference)$/);
    // `page` is the table's page number, so it is the one manifest key a view does not keep.
    expect([...SUPPORT.pageKeys]).toEqual(manifest.pageKeys.filter(key => key !== 'page'));
  });

  it('선언대로 만든 뷰는 낡지 않은 것으로 진단된다(캡처→복원 왕복은 apps/platform-web/src/saved-view-cycle-time.test가 실제 선언으로 본다)', () => {
    const view = menuView();
    expect(diagnose(JSON.parse(JSON.stringify(view)) as SavedView)).toEqual({ status: 'ok', reasons: [] });
  });

  // Cycle time declares every field a view can hold, so the undeclared key is one a newer or older view may carry (`lotIds`).
  it('선언에 없는 Context는 버려지지 않고 stale-context-key로 보고된다', () => {
    const result = diagnose(menuView({ context: { roomNames: ['PHOTO'], lotIds: ['LOT1'] } as MenuView['context'] }));
    expect(result.status).toBe('stale');
    expect(result.reasons).toContainEqual({ code: 'stale-context-key', key: 'lotIds' });
  });

  it('선언에 없는 page 키와 다른 메뉴 화면 버전은 각각 보고된다', () => {
    const result = diagnose(menuView({ page: { grain: ['hour'] }, menuSchemaVersion: SUPPORT.menuSchemaVersion - 1 }));
    expect(result.reasons).toEqual(expect.arrayContaining([{ code: 'stale-page-key', key: 'grain' }, { code: 'menu-schema-version' }]));
  });
});
