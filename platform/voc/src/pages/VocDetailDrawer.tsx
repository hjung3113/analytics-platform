import type * as React from 'react';
import { DetailDrawer } from '@ap/components';
import { DetailPanelSectionNav, type PanelSection } from '@ap/ui';
import { useI18n } from '@ap/kernel';
import { useVocDetailParts } from '@ap/feature-screens/operator-screens/voc-detail';

/** The menu declares sections; DetailDrawer owns their width-dependent placement. */
export function VocDetailDrawer({
  vocId,
  managedSystemId,
  onClose,
}: {
  vocId: string;
  managedSystemId?: string;
  onClose: () => void;
}) {
  const { lang } = useI18n();
  const parts = useVocDetailParts({
    vocId,
    onClose,
    titleInHeader: true,
    ...(managedSystemId !== undefined ? { managedSystemId } : {}),
  });
  const frame = ({
    regions,
    footer,
    sections,
  }: {
    regions: {
      body: React.ReactNode;
      properties?: React.ReactNode;
      activity?: React.ReactNode;
    };
    footer?: React.ReactNode;
    sections?: PanelSection[];
  }) => (
    <DetailDrawer
      title={parts.title}
      subtitle={parts.subtitle}
      headerActions={parts.headerActions}
      onClose={parts.requestClose}
      footer={footer}
      tabs={[
        {
          id: 'detail',
          label: lang === 'ko' ? '상세' : 'Detail',
          regions: {
            ...regions,
            ...(sections?.length
              ? {
                  navigation: (scrollRoot: React.RefObject<HTMLElement | null>) => (
                    <DetailPanelSectionNav sections={sections} scrollRef={scrollRoot} />
                  ),
                }
              : {}),
          },
        },
      ]}
    />
  );
  // Loading, failure and permission summaries occupy the full body, without an empty properties track.
  return parts.renderRegions
    ? parts.renderRegions(frame)
    : frame({
        regions: {
          body: <div className="fo-detail-body flex min-h-0 flex-1 flex-col">{parts.body}</div>,
        },
      });
}
