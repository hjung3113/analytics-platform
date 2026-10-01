import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { HelpCircle } from 'lucide-react';
import { formatInstant } from '@ap/contracts';
import { useI18n, useMenuQuery, usePlatform } from '@ap/kernel';
import { Panel, PlatformDataTable, PlatformPage, QueryView, StateMessage } from '@ap/components';
import { Button, StatusBadge } from '@ap/ui';
import { feedbackOpsHref } from '../feedbackops-href';
import { feedbackOpsOrigin } from '../feedbackops-origin';
import { VOC_STATUS } from '../voc-status';
import { myVocHistoryEndpoint, mySurveyHistoryEndpoint, type MyVocItem, type MyVocStatus } from '../endpoints';

const NO_PARAMS = {};

/**
 * 내 VOC (issue #60): the session actor's filed VOCs plus the survey-history unknown envelope. Read-only —
 * filing and survey submit happen in FeedbackOps, so every external control is a plain target="_blank"
 * anchor built by feedbackOpsHref and every link fails closed when the origin slot is unset (step 2 ships
 * unset). Cursor is the only page key (§6.1); a cursor window is not the full set, so no client sort and
 * no column filter here.
 */

/** `cursor` page-key shape, checked before the request: a single token, no URL structure, 1..512 chars. */
const CURSOR = /^[^?#&\s]{1,512}$/;

export default function MyVocHistory() {
  const { t, lang } = useI18n();
  const ko = lang === 'ko';
  const { pageParam, setPage } = usePlatform();

  const cursor = pageParam('cursor');
  const cursorOk = cursor === null || CURSOR.test(cursor);
  // Session identity: a period / room / scope change neither refetches nor hides the list — they are not
  // filters here. The cursor is the only page input, so turning a page refetches.
  const vocQ = useMenuQuery(myVocHistoryEndpoint, { cursor }, cursorOk);
  const surveyQ = useMenuQuery(mySurveyHistoryEndpoint, NO_PARAMS);

  const origin = feedbackOpsOrigin();
  const create = feedbackOpsHref(origin, { kind: 'voc-create' });
  // Fail closed: a disabled button, never an <a href="#"> — a bad origin is not a data error.
  const noLink = ko
    ? 'FeedbackOps 주소가 없거나 올바르지 않아 링크를 만들지 않습니다.'
    : 'No FeedbackOps link — the origin is missing or not a canonical origin.';
  const createControl = create.ok
    ? <Button asChild size="sm"><a href={create.href} target="_blank" rel="noopener noreferrer">{ko ? 'VOC 등록' : 'New VOC'}</a></Button>
    : <Button size="sm" disabled>{noLink}</Button>;

  const columns = useMemo<ColumnDef<MyVocItem>[]>(() => [
    { accessorKey: 'displayId', header: ko ? 'VOC 번호' : 'VOC ID', enableSorting: false, cell: info => <span className="t-mono">{String(info.getValue())}</span> },
    { accessorKey: 'title', header: ko ? '제목' : 'Title', enableSorting: false },
    {
      accessorKey: 'status', header: ko ? '상태' : 'Status', enableSorting: false,
      cell: info => { const s = VOC_STATUS[info.getValue() as MyVocStatus]; return <StatusBadge tone={s.tone}>{ko ? s.ko : s.en}</StatusBadge>; },
    },
    { accessorKey: 'openedAt', header: ko ? '접수' : 'Opened', enableSorting: false, cell: info => formatInstant(info.getValue() as string, lang) },
    { accessorKey: 'updatedAt', header: ko ? '마지막 업데이트' : 'Updated', enableSorting: false, cell: info => formatInstant(info.getValue() as string, lang) },
  ], [ko, lang]);

  const openInFeedbackOps = (row: MyVocItem) => {
    const link = feedbackOpsHref(origin, { kind: 'voc-detail', vocId: row.id });
    return link.ok
      ? <Button asChild size="sm" variant="secondary"><a href={link.href} target="_blank" rel="noopener noreferrer">{ko ? 'FeedbackOps에서 보기' : 'Open in FeedbackOps'}</a></Button>
      : <Button size="sm" variant="secondary" disabled>{noLink}</Button>;
  };

  return <PlatformPage
    description={ko
      ? '내가 접수한 VOC 상태입니다. 읽기 전용이며, 등록과 설문 응답은 FeedbackOps에서 진행합니다.'
      : 'Status of the VOCs you filed. Read-only; filing and survey submit happen in FeedbackOps.'}
    primaryAction={createControl}
  >
    {!cursorOk
      ? <p role="alert">{ko ? '커서 값이 잘못되었습니다.' : 'Invalid cursor value.'}</p>
      : <QueryView query={vocQ} emptyAction={createControl}>{(data, response) => {
        // The adapter already returned one window: the table only wraps it (no sortAndPage, no urlState).
        const items = data.items;
        const next = data.nextCursor;
        return <>
          <PlatformDataTable<MyVocItem>
            title={ko ? '내 VOC' : 'Your VOCs'}
            ariaLabel={ko ? '내 VOC 목록' : 'Your VOCs list'}
            subtitle={ko ? '정렬은 접수 시각 기준 최신순으로 고정입니다. 상세와 등록은 FeedbackOps에서 진행합니다.' : 'Fixed newest-first order. Detail and filing happen in FeedbackOps.'}
            columns={columns} getRowId={row => row.id} filterKey=""
            preferenceKey="voc-mine:columns:v1" pageSize={items.length || 1}
            rowAction={openInFeedbackOps}
            loadPage={async () => ({ outcome: 'ok', data: { rows: [...items], total: items.length }, assessments: [], trust: null, correlationId: response.correlationId })}
          />
          {next !== null && <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="secondary" onClick={() => setPage({ cursor: next })}>{ko ? '더 보기' : 'More'}</Button>
          </div>}
        </>;
      }}</QueryView>}

    {/* Cursor reset lives OUTSIDE the QueryView success child (issue #60 review): a stale cursor can error
        (e.g. issued by the previous role) or hit forbidden/empty, and the outcome view only offers Retry —
        which resends the same cursor forever. The error itself stays visible; nothing auto-clears it. */}
    {cursor !== null && <div className="flex justify-end pt-2">
      <Button size="sm" variant="secondary" onClick={() => setPage({ cursor: null })}>{ko ? '처음' : 'First page'}</Button>
    </div>}

    <Panel title={ko ? '설문 응답' : 'Survey responses'} className="mt-4">
      <QueryView query={surveyQ}>{(_, response) => {
        // Branch on the assessment, never items.length: items are empty because the source is unknown,
        // not because the actor has no responses (issue #60 §2). No table, no submit control.
        const unknown = response.assessments.some(a => a.kind === 'respondent_history' && a.state === 'unknown');
        return unknown ? <StateMessage
          icon={<HelpCircle className="size-4" aria-hidden />}
          title={t('stateUnknown')}
          body={ko
            ? '설문 응답 이력을 돌려주는 FeedbackOps 조회가 아직 없습니다. 응답이 0건이라는 뜻이 아닙니다.'
            : 'FeedbackOps has no read of your survey responses yet. This is not zero responses.'}
          correlationId={response.correlationId}
        /> : null;
      }}</QueryView>
    </Panel>
  </PlatformPage>;
}
