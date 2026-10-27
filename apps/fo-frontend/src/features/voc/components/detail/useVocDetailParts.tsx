import { useMeBridge } from '@/lib/api/me';
import { useVocDetail } from '@/lib/cross-system/useVocDetail';
import type { DetailParts } from '@/lib/host/detail-parts';
import { formatRecordDocumentTitle } from '@/lib/host/document-title-format';
import { useHostTitle } from '@/lib/host/host-seam';
import { SkeletonBlocks } from '@ap/ui';
import type { VocDetailEnvelope, VocSummaryEnvelope } from '@fops/shared';
import * as React from 'react';

import { VocHeaderActions } from './DetailHeader';
import { DetailPanelNotFound } from './DetailPanelNotFound';
import { SummaryPermissionBody } from './SummaryPermissionView';
import { VocDetailBody } from './VocDetailBody';
import { useDetailCloseGuard } from './useDetailCloseGuard';

export interface UseVocDetailPartsArgs {
  vocId: string;
  /** Current Managed System URL scope; an out-of-scope cached selection closes. */
  managedSystemId?: string;
  /** Called when the actor closes the panel (after the dirty-composer confirmation) or a 404 selection clears. */
  onClose: () => void;
}

/** Which read state the parts show; the standalone panel picks its frame from it. */
export type VocDetailView =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'not-found' }
  | { kind: 'hidden' }
  | { kind: 'summary'; data: VocSummaryEnvelope }
  | { kind: 'full'; voc: VocDetailEnvelope };

export type VocDetailParts = DetailParts & {
  view: VocDetailView;
  /** The close a header X calls: asks first while a composer holds an unsent draft. */
  requestClose: () => void;
};

/** A summary envelope has permission_decisions but no title field. */
function isSummaryEnvelope(
  data: VocDetailEnvelope | VocSummaryEnvelope,
): data is VocSummaryEnvelope {
  return !('title' in data);
}

function DetailPanelSkeleton(): React.ReactElement {
  return (
    <div className="flex flex-col gap-4 p-4" aria-label="VOC 상세 불러오는 중">
      <SkeletonBlocks
        blocks={[
          { kind: 'title', size: 'small', width: 'third' },
          { kind: 'line', width: 'full' },
          { kind: 'line', width: 'two-thirds' },
          { kind: 'body', size: 'compact', width: 'full' },
          { kind: 'line', width: 'full' },
          { kind: 'line', width: 'three-quarters' },
          { kind: 'body', size: 'large', width: 'full' },
        ]}
      />
    </div>
  );
}

/**
 * The VOC detail as the parts a host places in its own frame (`DetailParts`): the standalone panel and the platform
 * bridge both render these. Needs a `HostSeamProvider` (navigation, notices, title) and the FeedbackOps providers.
 */
export function useVocDetailParts({
  vocId,
  managedSystemId,
  onClose,
}: UseVocDetailPartsArgs): VocDetailParts {
  const { data, isLoading, isError, isSuccess, isFetching, error } = useVocDetail(vocId);
  const documentTitleRecord =
    isSuccess && !isFetching && data?.id === vocId && 'title' in data
      ? formatRecordDocumentTitle({ displayId: data.display_id, title: data.title })
      : null;
  // `null` while the scope-exit effect clears `selected`: rendering the old record for that tick is the bug this closes.
  useHostTitle(documentTitleRecord);
  const { data: me } = useMeBridge();
  const selectedScopeExcludesVoc =
    managedSystemId !== undefined &&
    !isLoading &&
    !isError &&
    data !== undefined &&
    data.primary_managed_system_id !== managedSystemId;

  // The guard follows the full body's lifetime: any state that discards the body (error, summary, hidden, loading)
  // gives the next full body a clean guard, as the keyed full view did.
  const fullBodyShown =
    !isLoading &&
    !isError &&
    data !== undefined &&
    !selectedScopeExcludesVoc &&
    !isSummaryEnvelope(data);
  const closeGuard = useDetailCloseGuard(onClose, fullBodyShown ? vocId : `${vocId}:no-body`);

  React.useEffect(() => {
    if (selectedScopeExcludesVoc) onClose();
  }, [onClose, selectedScopeExcludesVoc]);

  const { requestClose } = closeGuard;
  const base = { requestClose };

  if (isLoading) {
    return {
      ...base,
      view: { kind: 'loading' },
      title: <SkeletonBlocks blocks={[{ kind: 'line', width: 'w24' }]} />,
      body: <DetailPanelSkeleton />,
    };
  }

  if (isError) {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'not_found.record') {
      return {
        ...base,
        view: { kind: 'not-found' },
        title: 'VOC',
        body: <DetailPanelNotFound onClearSelection={onClose} />,
      };
    }
    return {
      ...base,
      view: { kind: 'error' },
      title: 'VOC',
      body: (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <p className="text-sm text-text-danger">데이터를 불러오지 못했습니다.</p>
        </div>
      ),
    };
  }

  if (!data) {
    return {
      ...base,
      view: { kind: 'not-found' },
      title: 'VOC',
      body: <DetailPanelNotFound onClearSelection={onClose} />,
    };
  }

  if (selectedScopeExcludesVoc) {
    return { ...base, view: { kind: 'hidden' }, title: 'VOC', body: null };
  }

  if (isSummaryEnvelope(data)) {
    return {
      ...base,
      view: { kind: 'summary', data },
      title: data.display_id,
      headerActions: <VocHeaderActions vocId={vocId} displayId={data.display_id} />,
      body: <SummaryPermissionBody data={data} />,
    };
  }

  const voc: VocDetailEnvelope = data;
  const isReporterOnOwnVoc = me?.actor.id === voc.reporter_id && voc.triage_state === 'untriaged';
  // Raw Task DTOs are an operator-only surface. Identity uncertainty and every
  // User role fail closed, including the reporter who owns this VOC.
  const canRenderAllowedTask =
    me?.actor.role_level === 'admin' || me?.actor.role_level === 'developer';

  return {
    ...base,
    view: { kind: 'full', voc },
    title:
      formatRecordDocumentTitle({ displayId: voc.display_id, title: voc.title }) ?? voc.display_id,
    headerActions: <VocHeaderActions vocId={vocId} displayId={voc.display_id} />,
    body: (
      <VocDetailBody
        key={voc.id}
        voc={voc}
        vocId={vocId}
        closeGuard={closeGuard}
        {...(managedSystemId !== undefined ? { managedSystemId } : {})}
        isReporterOnOwnVoc={isReporterOnOwnVoc}
        canRenderAllowedTask={canRenderAllowedTask}
        me={me ?? null}
      />
    ),
  };
}
