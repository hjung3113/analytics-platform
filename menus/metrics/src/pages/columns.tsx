/**
 * Catalog table columns (#173 review P3-8): extracted from MetricCatalog so the export labels are testable
 * without mounting the page. The cell renders exactly what the screen shows; `exportValue` gives the export
 * the same text (06 §15: export shows what the screen shows).
 */
import type { LinkOptions } from '@ap/kernel';
import type { PlatformColumn } from '@ap/components';
import { PlatformLink } from '@ap/kernel';
import type { CatalogRow, Lang, Text } from '../endpoints';
import { DOMAIN_LABEL, STATUS_LABEL, STATUS_TONE } from './data';
import { StatusBadge } from '@ap/ui';

type Deps = {
  lang: Lang;
  /** `usePlatform().linkTo` — the column stays a pure function of it. */
  linkTo: (menuId: string, options?: LinkOptions) => string;
  /** `useI18n().tx`. */
  tx: (text: Text) => string;
};

function detailPage(row: CatalogRow): Record<string, string> {
  return { version: row.publishedPointer ?? row.catalogVersion };
}

export function catalogColumns({ lang, linkTo, tx }: Deps): PlatformColumn<CatalogRow>[] {
  return [
    {
      id: 'metricId', header: 'metricId', size: 200,
      cell: row => <PlatformLink className="t-mono text-accent-primary hover:underline" href={linkTo('metric-detail', { params: { metricId: row.metricId }, page: detailPage(row) })}>{row.metricId}</PlatformLink>,
    },
    {
      id: 'nameSort', header: lang === 'ko' ? '이름' : 'Name', size: 180,
      cell: row => (lang === 'ko' ? row.nameKo : row.nameEn),
      exportValue: row => (lang === 'ko' ? row.nameKo : row.nameEn),
    },
    {
      id: 'domain', header: lang === 'ko' ? '도메인' : 'Domain', size: 120,
      cell: row => tx(DOMAIN_LABEL[row.domain]),
      exportValue: row => tx(DOMAIN_LABEL[row.domain]),
    },
    { id: 'grain', header: 'grain', size: 180, cell: row => row.grain },
    {
      id: 'numerator', header: lang === 'ko' ? '분자' : 'Numerator', size: 200,
      cell: row => <span className="t-mono">{row.numerator}</span>,
    },
    {
      id: 'denominator', header: lang === 'ko' ? '분모' : 'Denominator', size: 200,
      cell: row => <span className="t-mono">{row.denominator}</span>,
    },
    {
      id: 'publishedPointer', header: lang === 'ko' ? '게시 포인터' : 'Published pointer', size: 130, align: 'right',
      cell: row => row.publishedPointer ? <span className="tabular">v{row.publishedPointer}</span> : <span className="text-text-muted">{lang === 'ko' ? '없음' : 'None'}</span>,
      // Export shows the same `v3` pointer text; no pointer exports an empty cell (the muted "None" is screen-only).
      exportValue: row => (row.publishedPointer === null ? null : `v${row.publishedPointer}`),
    },
    {
      id: 'status', header: lang === 'ko' ? '상태' : 'Status', size: 110,
      cell: row => <StatusBadge tone={STATUS_TONE[row.status]} dot>{tx(STATUS_LABEL[row.status])}</StatusBadge>,
      exportValue: row => tx(STATUS_LABEL[row.status]),
    },
    { id: 'owner', header: lang === 'ko' ? '정의 책임' : 'Owner', size: 160, cell: row => row.owner },
    {
      id: 'updatedAt', header: lang === 'ko' ? '수정 시각' : 'Updated', size: 170, align: 'right',
      cell: row => <time className="tabular" dateTime={row.updatedAt}>{row.updatedAt.replace('T', ' ').slice(0, 16)}</time>,
      exportValue: row => row.updatedAt.replace('T', ' ').slice(0, 16),
    },
  ];
}
