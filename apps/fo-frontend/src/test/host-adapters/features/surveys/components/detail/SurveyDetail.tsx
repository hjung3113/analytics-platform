import {
  surveyDetailPieces,
  useSurveyClosing,
} from '@/features/surveys/components/detail/SurveyDetailParts';
import type { Survey } from '@/features/surveys/types';
import { useHostSeam } from '@/lib/host/host-seam';
import { DetailPanelHeader, PanelTitleBlock } from '@ap/ui';

export function SurveyDetail({
  survey,
  canManage,
  onClose,
  managedSystemNamesById,
  actorNamesById,
}: {
  survey: Survey;
  canManage: boolean;
  onClose?: () => void;
  managedSystemNamesById?: ReadonlyMap<string, string> | undefined;
  actorNamesById?: ReadonlyMap<string, string> | undefined;
}) {
  const { canLink } = useHostSeam();
  const closing = useSurveyClosing(survey.id);
  const pieces = surveyDetailPieces({
    survey,
    canManage,
    canLink,
    closing,
    managedSystemNamesById,
    actorNamesById,
  });
  return (
    <aside
      className="flex h-full flex-col border-l border-border-subtle bg-surface-detail"
      data-testid="survey-detail"
    >
      <DetailPanelHeader
        kind="survey"
        id={survey.display_id}
        {...(onClose !== undefined ? { onClose } : {})}
        {...(pieces.builderAction !== undefined ? { extras: pieces.builderAction } : {})}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-border-subtle pb-4">
          <PanelTitleBlock className="px-5" title={survey.title} badges={pieces.badges} />
          {pieces.operatorLine}
          {pieces.intro}
        </div>
        {pieces.sections}
      </div>
      {pieces.dialog}
    </aside>
  );
}
