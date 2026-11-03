import { useI18n, useMenuQuery } from '@ap/kernel';
import { PlatformPage, QueryView, ManagementLayout } from '@ap/components';
import { sampleEndpoint } from '../endpoints';

// 06 §12 management skeleton: content slots in reading order. Replace each section with the platform component it names.
const SLOTS = [
  { id: 'filter', ko: '검색·필터', en: 'Search + Filter' },
  { id: 'table', ko: '데이터 표', en: 'Data Table' },
  { id: 'actions', ko: '선택 작업', en: 'Selection Actions' },
  { id: 'drawer', ko: '상세 드로어', en: 'Detail Drawer' },
  { id: 'history', ko: '이력·감사', en: 'History / Audit' },
];

// The Screen suffix keeps the component name clear of the imports above (review F5).
export default function AccessScaffoldScreen() {
  const { lang } = useI18n();
  const query = useMenuQuery(sampleEndpoint, {});
  const caption = lang === 'ko' ? '권한' : 'Access';
  const slotLabel = (id: typeof SLOTS[number]['id']) => {
    const slot = SLOTS.find(candidate => candidate.id === id);
    return slot ? (lang === 'ko' ? slot.ko : slot.en) : id;
  };
  const slotPlaceholder = (id: (typeof SLOTS)[number]['id']) => <section key={id} data-slot={id} className="rounded-lg border border-dashed border-border-subtle p-4">
    <h2 className="t-caption font-medium text-text-secondary">{slotLabel(id)}</h2>
  </section>;
  return <PlatformPage>
    <QueryView query={query}>{() => <div className="space-y-3">
      <p className="t-caption text-text-muted">{caption}</p>
      <ManagementLayout
        table={<>{slotPlaceholder('filter')}{/* Replace Search + Filter with a toolbar search Input on PlatformDataTable's search prop; column filters come from the table (ADR-0105). */}{slotPlaceholder('table')}{/* Replace Data Table with PlatformDataTable (search prop, column filters). */}</>}
      />
      <div className="space-y-3">
        {slotPlaceholder('actions')}
        {/* Replace Selection Actions with PlatformDataTable selection actions. */}
        {slotPlaceholder('drawer')}
        {/* Replace Detail Drawer with DetailDrawer. */}
        {slotPlaceholder('history')}
        {/* Replace History / Audit with AuditTimeline. */}
      </div>
    </div>}</QueryView>
  </PlatformPage>;
}
