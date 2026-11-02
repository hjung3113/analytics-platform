import type { ReactNode } from 'react';
import { StatusBadge, cn } from '@ap/ui';
import type { ModelProfileData } from '../../endpoints';
import { dateOf, dateTimeOf, statusText } from './modelPresentation';

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

/** Meta line under the title: `코드 · 제조사 · 공정 배지 · 활성 상태`. */
export function ModelMeta({ model }: { model: ModelProfileData['model'] }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
    <span className="t-mono text-text-primary">{model.code}</span><span aria-hidden>·</span>
    <span>{model.vendor.name}</span><span aria-hidden>·</span>
    <ProcessBadgeList processes={model.processes} /><span aria-hidden>·</span>
    <StatusBadge tone={model.active ? 'success' : 'neutral'}>{statusText(model.active)}</StatusBadge>
  </div>;
}

export function ModelSummary({ model }: { model: ModelProfileData['model'] }) {
  return <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
    <dt className="text-text-muted">모델 코드</dt><dd className="t-mono">{model.code}</dd>
    <dt className="text-text-muted">제조사</dt><dd>{model.vendor.name}{!model.vendor.active && <StatusBadge tone="neutral" className="ml-2">비활성</StatusBadge>}</dd>
    <dt className="text-text-muted">공정</dt><dd><ProcessBadgeList processes={model.processes} /></dd>
    <dt className="text-text-muted">상태</dt><dd><StatusBadge tone={model.active ? 'success' : 'neutral'}>{statusText(model.active)}</StatusBadge></dd>
    <dt className="text-text-muted">등록 시각</dt><dd className="tabular">{dateTimeOf(model.createdAt)}</dd>
    <dt className="text-text-muted">변경 시각</dt><dd className="tabular">{dateTimeOf(model.updatedAt)}</dd>
  </dl>;
}

/** Rows are not interactive: the SW profile is #1196. */
export function SoftwareTable({ versions }: { versions: ModelProfileData['softwareVersions'] }) {
  return <table className="w-full text-sm">
    <thead><tr className="h-8 border-b border-border-subtle text-left text-xs text-text-muted">
      <th scope="col" className="font-medium">버전</th><th scope="col" className="font-medium">이름</th>
      <th scope="col" className="text-right font-medium">기술 Item 수</th><th scope="col" className="pl-6 font-medium">상태</th><th scope="col" className="font-medium">최종 변경</th>
    </tr></thead>
    <tbody>{versions.map(v => <tr key={v.id} className={cn('h-9 border-b border-border-subtle last:border-b-0', !v.active && 'text-text-muted')}>
      <td className="t-mono">{v.versionLabel}</td><td>{v.name || '—'}</td><td className="tabular text-right">{v.itemCount}</td>
      <td className="pl-6"><StatusBadge tone={v.active ? 'success' : 'neutral'}>{statusText(v.active)}</StatusBadge></td><td className="tabular">{dateOf(v.updatedAt)}</td>
    </tr>)}</tbody>
  </table>;
}
