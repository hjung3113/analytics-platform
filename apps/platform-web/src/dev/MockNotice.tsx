import { useI18n } from '@ap/kernel';

/** The mock assembly's sidebar notice: the shell holds no data-source text, so the mock build says it through `PlatformSlots.sidebarNotice`. */
export function MockNotice() {
  const { lang } = useI18n();
  return <>{lang === 'ko' ? '통합 프로토타입 · 합성 데이터' : 'Integrated prototype · synthetic data'}</>;
}
