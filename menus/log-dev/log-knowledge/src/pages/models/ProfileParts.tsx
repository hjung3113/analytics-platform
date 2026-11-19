import type { ReactNode } from 'react';
import { PlatformDataTable, type PlatformColumn } from '@ap/components';
import { formatSummaryTime, useI18n } from '@ap/kernel';
import { StatusBadge } from '@ap/ui';
import type { ModelProfileData } from '../../endpoints';
import { instantText, statusText } from './modelPresentation';

export function Section({ id, title, count, actions, children }: { id: string; title: string; count?: number; actions?: ReactNode; children: ReactNode }) {
  return <section id={id} aria-label={title} className="scroll-mt-12 rounded-md border border-border-subtle bg-surface-card">
    <header className="flex min-h-11 items-center justify-between gap-2 border-b border-border-subtle px-4 py-1.5">
      <h2 className="text-sm font-semibold text-text-primary">{title}{count !== undefined && <span className="tabular ml-1.5 font-normal text-text-muted">{count}</span>}</h2>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
    <div className="p-4">{children}</div>
  </section>;
}

export function EmptyNote({ text, action }: { text: string; action?: ReactNode }) {
  return <div className="flex flex-col items-start gap-2 rounded-md bg-surface-sunken p-4 text-sm text-text-secondary"><p>{text}</p>{action}</div>;
}

export function ProcessBadgeList({ processes }: { processes: ModelProfileData['model']['processes'] }) {
  if (processes.length === 0) return <span className="text-text-muted">공정 미분류</span>;
  return <span className="flex flex-wrap items-center gap-1">{processes.map(p => <StatusBadge key={p.id} tone="info">{p.name}</StatusBadge>)}</span>;
}

/** Meta line under the title: `코드 · 설비사 · 공정 배지 · 활성 상태`. */
export function ModelMeta({ model }: { model: ModelProfileData['model'] }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
    <span className="t-mono text-text-primary">{model.code}</span><span aria-hidden>·</span>
    <span>{model.vendor.name}</span><span aria-hidden>·</span>
    <ProcessBadgeList processes={model.processes} /><span aria-hidden>·</span>
    <StatusBadge tone={model.active ? 'success' : 'neutral'}>{statusText(model.active)}</StatusBadge>
  </div>;
}

export function ModelSummary({ model }: { model: ModelProfileData['model'] }) {
  const { lang } = useI18n();
  return <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
    <dt className="text-text-muted">모델 코드</dt><dd className="t-mono">{model.code}</dd>
    <dt className="text-text-muted">설비사</dt><dd>{model.vendor.name}{!model.vendor.active && <StatusBadge tone="neutral" className="ml-2">비활성</StatusBadge>}</dd>
    <dt className="text-text-muted">공정</dt><dd><ProcessBadgeList processes={model.processes} /></dd>
    <dt className="text-text-muted">상태</dt><dd><StatusBadge tone={model.active ? 'success' : 'neutral'}>{statusText(model.active)}</StatusBadge></dd>
    <dt className="text-text-muted">등록 시각</dt><dd className="tabular">{formatSummaryTime(model.createdAt, lang)}</dd>
    <dt className="text-text-muted">변경 시각</dt><dd className="tabular">{formatSummaryTime(model.updatedAt, lang)}</dd>
  </dl>;
}

type SoftwareVersionRow = ModelProfileData['softwareVersions'][number];

const SOFTWARE_COLUMNS: PlatformColumn<SoftwareVersionRow>[] = [
  { id: 'versionLabel', header: '버전', sortable: false, cell: v => <span className="t-mono">{v.versionLabel}</span> },
  { id: 'name', header: '이름', sortable: false, cell: v => v.name || '—' },
  { id: 'itemCount', header: '기술 Item 수', align: 'right', sortable: false },
  { id: 'active', header: '상태', sortable: false, value: v => statusText(v.active), cell: v => <StatusBadge tone={v.active ? 'success' : 'neutral'}>{statusText(v.active)}</StatusBadge> },
  { id: 'updatedAt', header: '최종 변경', sortable: false, value: v => instantText(v.updatedAt), cell: v => <span className="tabular">{instantText(v.updatedAt)}</span> },
];

/** The list is the server's newest `SOFTWARE_LIST_CAP` rows, not a screen-bounded set, so it is a `PlatformDataTable` in `rows` mode (the table pages it). Rows are not interactive: the SW profile is #1196. */
export function SoftwareTable({ versions }: { versions: ModelProfileData['softwareVersions'] }) {
  return <PlatformDataTable title="SW 버전" hideTitle ariaLabel="SW 버전 목록" columns={SOFTWARE_COLUMNS} rows={versions} preferenceKey="log-knowledge-model-software" getRowId={v => v.id} isRowMuted={v => !v.active} />;
}
