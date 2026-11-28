import type { ViewVisibility } from '@ap/contracts';
import { formatListTime, useI18n, useMessages } from '@ap/kernel';
import { Button } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import { visibilityText } from './text';

export type ApprovalReviewPanelProps = {
  requester: string;
  requestedAt?: number | undefined;
  audience: ViewVisibility;
  groupNames?: Readonly<Record<string, string>>;
  changes?: readonly string[] | undefined;
  metricVersion?: number | string;
  approverSpaceName?: string;
  approved?: { shown: boolean; toggle: () => void };
};

export function ApprovalReviewPanel({ requester, requestedAt, audience, groupNames, changes, metricVersion, approverSpaceName, approved }: ApprovalReviewPanelProps) {
  const { lang } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const section = 'space-y-1 border-t border-border-subtle pt-3';
  return <div className="space-y-4 break-words text-sm">
    <p className="flex flex-wrap gap-x-2 text-text-muted"><span>{requester}</span>{requestedAt !== undefined && <span>· {formatListTime(requestedAt)}</span>}</p>
    <dl className="flex flex-wrap gap-x-2"><dt className="text-text-muted">{m('svReviewAudience')}</dt><dd>{visibilityText(audience, lang, groupNames)}</dd></dl>
    {changes && <section className={section}>
      <h2 className="font-semibold">{m('svReviewChanges')}</h2>
      {changes.length ? <ul className="list-disc space-y-1 pl-5">{changes.map((change, index) => <li key={index}>{change}</li>)}</ul> : <p>{m('svPartNoChanges')}</p>}
    </section>}
    {metricVersion !== undefined && <section className={section}>
      <h2 className="font-semibold">{m('svReviewMetric')}</h2><p>{metricVersion}</p>
    </section>}
    <section className={section}>
      <h2 className="font-semibold">{m('svReviewStage')}</h2><p>{approverSpaceName ? m('svReviewSpaceApprover', { space: approverSpaceName }) : m('svReviewApprover')}</p>
    </section>
    {approved && <Button type="button" size="sm" variant="secondary" aria-pressed={approved.shown} onClick={approved.toggle}>{m('svReviewApproved')}</Button>}
  </div>;
}
