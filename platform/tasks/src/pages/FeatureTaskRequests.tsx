import { type ComponentProps, useEffect } from 'react';
import { DetailDrawer, StateMessage } from '@ap/components';
import { ServerCrash } from 'lucide-react';
import { FeatureDetailDrawer, FeatureScreenPage, RejectedPage, isUuid, taskRequestsRoute, useTaskRequestsHere, useTaskRequestsSearch } from '@ap/feature-bridge';
import { TaskRequestsScreen } from '@ap/feature-screens/operator-screens/task-requests';
import { isTasksSearchValueValid } from '@ap/feature-screens/operator-screens/tasks-search';
import { PlatformLink, useI18n, useMessages, usePlatform } from '@ap/kernel';
import { Button } from '@ap/ui';
import { TASK_MESSAGES } from '../messages';

/** `focus` becomes the feature `param`, a request path segment, so only a UUID passes (06 §6.4, ADR-0071 decision 9); other keys follow the Tasks search schema. */
const isValid = (key: string, value: string) => key === 'param' ? isUuid(value) : isTasksSearchValueValid(key, value);
const DETAIL_PAGE = '1';

/** Task Requests (ADR-0081, #763): the feature screens' request queue through the bridge; `focus` is the selected request (a UUID; `managedSystem` a UUID or `all`), its panel renders in the shell detail slot. */
export default function FeatureTaskRequests() {
  const { pageParam, linkTo, setPage, user, revision, global } = usePlatform();
  const { t } = useI18n();
  const m = useMessages(TASK_MESSAGES);
  const focus = pageParam('focus');
  const detailPage = pageParam('detailPage');
  const fullPage = detailPage === DETAIL_PAGE;
  const detailOnly = !!focus && fullPage;
  useEffect(() => {
    if (!focus && fullPage) setPage({ detailPage: null }, { replace: true });
  }, [focus, fullPage, setPage]);
  if (detailPage !== null && !fullPage) return <RejectedPage rejected={{ key: 'detailPage' }} />;
  const queuePage = {
    focus,
    reviewer: pageParam('reviewer'),
    reviewerTeam: pageParam('reviewerTeam'),
    managedSystem: pageParam('managedSystem'),
    returnTo: pageParam('returnTo'),
  };
  const backToQueue = <Button asChild variant="secondary" size="sm"><PlatformLink href={linkTo('task-requests', { page: queuePage })}>{m('requestsBackToList')}</PlatformLink></Button>;
  const detailError = (retry: () => void) => <StateMessage compact tone="danger" icon={<ServerCrash className="size-4" aria-hidden />} title={m('requestsDetailFailed')}
    action={<Button type="button" size="sm" variant="secondary" onClick={retry}>{t('retry')}</Button>} />;
  const renderDetail: ComponentProps<typeof TaskRequestsScreen>['renderDetail'] = (parts, list) => {
    if (detailOnly) return <article className="min-h-0 flex-1 overflow-auto p-5">
      <div className="mx-auto max-w-5xl break-keep">
        {backToQueue}
        <h2 className="t-section-title my-3"><span className="t-mono text-text-muted">{parts.displayId}</span> {parts.objectTitle ?? parts.title}</h2>
        {parts.body}
        {parts.footer}
      </div>
    </article>;
    // One drawer lifetime spans the queue's post-decision advance.
    const retry = list?.retryDetail;
    return <FeatureDetailDrawer
      parts={{ ...parts, id: parts.displayId, title: parts.objectTitle ?? parts.title, headerActions: undefined,
        body: <>{retry && detailError(retry)}{parts.body}</> }}
      fullPageHref={linkTo('task-requests', { page: { ...queuePage, focus: parts.requestId, detailPage: DETAIL_PAGE } })}
      copyPage={{ focus: parts.requestId }}
      onClose={parts.requestClose} isInList={list?.isInList} listFocusRef={list?.focusRef} />;
  };
  const renderMissingDetail = (id: string, close: () => void) => <DetailDrawer id={id} missing onClose={detailOnly
    ? () => setPage({ focus: null, detailPage: null }, { replace: true })
    : close} />;
  const renderDetailError = (retry: () => void) => <div className="mx-auto grid w-full max-w-5xl justify-items-start gap-3 p-5 break-keep">
    {backToQueue}
    {detailError(retry)}
  </div>;
  return <FeatureScreenPage route={taskRequestsRoute} isValid={isValid} useSearch={useTaskRequestsSearch} useHere={useTaskRequestsHere}>
    <TaskRequestsScreen key={JSON.stringify([user.id, revision, global.scopeId, detailOnly ? focus : null])}
      autoSelect={false} renderDetail={renderDetail} renderMissingDetail={renderMissingDetail} renderDetailError={renderDetailError}
      queueLabel={m('requestsQueue')} detailOnly={detailOnly} titleInHeader />
  </FeatureScreenPage>;
}
