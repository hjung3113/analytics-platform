// The sample menu's screen: one declared read through useMenuQuery, drawn by QueryView (loading, empty, error, denied).
import { useI18n, useMenuQuery } from '@ap/kernel';
import { PlatformPage, QueryView } from '@ap/components';
import { sampleEndpoint } from './endpoints';
import { MENU_LABEL } from './menu';

export default function SamplePage() {
  const { lang } = useI18n();
  const query = useMenuQuery(sampleEndpoint, {});
  return (
    <PlatformPage>
      <QueryView query={query}>
        {(rows) => (
          <section className="space-y-2" data-testid="sample-rows">
            <p className="t-caption text-text-muted">{lang === 'ko' ? MENU_LABEL.ko : MENU_LABEL.en}</p>
            <ul className="space-y-1">
              {rows.map((row) => (
                <li key={row.name} className="t-body">{row.name}: {row.value}</li>
              ))}
            </ul>
          </section>
        )}
      </QueryView>
    </PlatformPage>
  );
}
