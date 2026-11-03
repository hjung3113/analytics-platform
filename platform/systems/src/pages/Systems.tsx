import { useI18n, useMenuQuery } from '@ap/kernel';
import { PlatformPage, QueryView } from '@ap/components';
import { sampleEndpoint } from '../endpoints';

// 06 §12 catalog skeleton: content slots in reading order. Replace each section with the platform component it names.
const SLOTS = [
  { id: 'list', ko: '목록', en: 'Catalog List' },
  { id: 'definition', ko: '정의 상세', en: 'Definition Detail' },
  { id: 'version', ko: '버전', en: 'Version' },
  { id: 'ownership', ko: '소유', en: 'Ownership' },
  { id: 'coverage', ko: '적용 범위', en: 'Coverage' },
  { id: 'usage', ko: '사용·의존', en: 'Usage / Dependency' },
  { id: 'history', ko: '이력', en: 'History' },
];

// The Screen suffix keeps the component name clear of the imports above (review F5).
export default function SystemsScreen() {
  const { lang } = useI18n();
  const query = useMenuQuery(sampleEndpoint, {});
  const caption = lang === 'ko' ? '시스템' : 'Systems';
  return <PlatformPage>
    <QueryView query={query}>{() => <div className="space-y-3">
      <p className="t-caption text-text-muted">{caption}</p>
      {SLOTS.map(slot => <section key={slot.id} data-slot={slot.id} className="rounded-lg border border-dashed border-border-subtle p-4">
        <h2 className="t-caption font-medium text-text-secondary">{lang === 'ko' ? slot.ko : slot.en}</h2>
      </section>)}
    </div>}</QueryView>
  </PlatformPage>;
}
