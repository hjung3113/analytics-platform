import {
  ANALYTICS_AREA_RECENT_FINDINGS_LABEL,
  ANALYTICS_AREA_WORKLOAD_SIGNALS_LABEL,
} from '@/lib/copy/analytics-areas';
import { GLOSSARY } from '@/lib/copy/glossary';
import type { ClosableDetailParts } from '@/lib/host/detail-parts';
import { ManagedSystemMark, ManagedSystemPill, OutlineBadge } from '@ap/feature-ui';
import {
  Button,
  DetailPanelSectionNav,
  FieldRow,
  type PanelSection,
  PanelSectionTitle,
  PanelTitleBlock,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  UserChip,
} from '@ap/ui';
import { Layers, Settings, Shield } from 'lucide-react';
import { type RefObject, useRef } from 'react';

import { formatDate } from '@/lib/format/datetime';
import type { ResolveActorsResponse } from '../../../lib/api/actors';
import type { AnalyticsAreaDto, ManagedSystemDto } from '../../../lib/api/registry-reads';
import { scopeMark } from '../lib/scopeMark.js';
import { teamName } from './teamName.js';

type AnalyticsAreaDetailInput = {
  area: AnalyticsAreaDto;
  ms: ManagedSystemDto | null;
  resolved: ResolveActorsResponse | undefined;
};

type AnalyticsAreaDetailPartsInput = AnalyticsAreaDetailInput & {
  onClose: () => void;
  onEdit: (area: AnalyticsAreaDto) => void;
  /** The host's drawer already shows the area name; the body omits its title block (#1168 C-1). */
  titleInHeader?: boolean;
};

// The same body and heading feed the standalone Sheet and the host-owned drawer.
export function buildAnalyticsAreaDetailParts({
  area,
  ms,
  resolved,
  onClose,
  onEdit,
  titleInHeader,
}: AnalyticsAreaDetailPartsInput): ClosableDetailParts {
  const heading = analyticsAreaHeading(area);
  return {
    title: heading.title,
    subtitle: heading.subtitle,
    headerActions: (
      <Button
        variant="subtle"
        size="sm"
        onClick={() => onEdit(area)}
        aria-label={`${area.name} 수정`}
        data-testid="aa-edit-button"
      >
        <Settings className="h-3 w-3" />
        수정
      </Button>
    ),
    body: (
      <AnalyticsAreaDetailContent
        area={area}
        ms={ms}
        resolved={resolved}
        {...(titleInHeader ? { titleInHeader } : {})}
      />
    ),
    requestClose: onClose,
  };
}

// ============================================================
// AnalyticsAreaSlideOver — 460px read-only AA detail drawer.
// Overview / Definition / Workload / Findings / Used by.
// Built with the @ap/feature-ui sheet (Radix dialog) wrapper; right side, 460px.
// ============================================================
export function AnalyticsAreaSlideOver({
  area,
  ms,
  resolved,
  onOpenChange,
  onEdit,
}: {
  area: AnalyticsAreaDto | null;
  ms: ManagedSystemDto | null;
  resolved: ResolveActorsResponse | undefined;
  onOpenChange: (open: boolean) => void;
  onEdit: (area: AnalyticsAreaDto) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const editingRef = useRef(false);
  if (!area) return null;

  const heading = analyticsAreaHeading(area);

  return (
    <Sheet open={true} onOpenChange={onOpenChange}>
      <SheetContent
        onOpenAutoFocus={() => {
          editingRef.current = false;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (editingRef.current) return;
          const detailButton = document.querySelector<HTMLButtonElement>(
            `button[data-area-id="${CSS.escape(area.id)}"]`,
          );
          if (detailButton?.isConnected) detailButton.focus();
        }}
        side="right"
        className="flex w-[460px] flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        data-testid="aa-slide-over"
      >
        <SheetTitle className="sr-only">{heading.title}</SheetTitle>
        <SheetDescription className="sr-only">Analytics Area 상세</SheetDescription>
        <div
          data-testid="aa-slide-over-header"
          className="flex h-toolbar shrink-0 items-center border-b border-border-subtle pl-6 pr-12"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-primary/15 px-2 py-0.5 text-xs font-medium text-accent-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-primary" />
            Analytics Area
          </span>
        </div>

        <AnalyticsAreaDetailContent area={area} ms={ms} resolved={resolved} scrollRef={scrollRef} />

        <div className="border-t border-border-subtle p-3">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              editingRef.current = true;
              onEdit(area);
            }}
            aria-label={`${area.name} ${GLOSSARY.edit}`}
            data-testid="aa-edit-button"
          >
            <Settings className="h-3 w-3" />
            {GLOSSARY.edit}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function analyticsAreaHeading(area: AnalyticsAreaDto): { title: string; subtitle: string } {
  return { title: area.name, subtitle: area.slug };
}

function buildSections(): PanelSection[] {
  return [
    { id: 'overview', label: '개요' },
    { id: 'definition', label: '정의' },
    { id: 'workload', label: ANALYTICS_AREA_WORKLOAD_SIGNALS_LABEL },
    { id: 'findings', label: ANALYTICS_AREA_RECENT_FINDINGS_LABEL },
    { id: 'used-by', label: '사용 위치' },
  ];
}

function AnalyticsAreaDetailContent({
  area,
  ms,
  resolved,
  scrollRef: providedScrollRef,
  titleInHeader,
}: AnalyticsAreaDetailInput & {
  scrollRef?: RefObject<HTMLDivElement | null>;
  /** The host's drawer already shows the area name; the body keeps only the badges (#1168 C-1). */
  titleInHeader?: boolean;
}) {
  const ownScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = providedScrollRef ?? ownScrollRef;
  const heading = analyticsAreaHeading(area);
  const mark = ms ? scopeMark(ms.slug, ms.name) : null;
  const lead = teamName(area, resolved);
  const created = formatDate(area.created_at);
  const overviewBadges = (
    <>
      <ManagedSystemPill
        name={ms?.name ?? area.managed_system_id}
        {...(mark ? { mark: mark.color } : {})}
      />
      <OutlineBadge>필터 차원</OutlineBadge>
    </>
  );

  // Workload + Findings are Slice 4/5 surfaces (not built). Keep the explicit
  // "—" values and one quiet explanation; no counts come from the DTO (#88).
  return (
    <>
      <DetailPanelSectionNav sections={buildSections()} scrollRef={scrollRef} />

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div data-anchor="overview">
          {titleInHeader ? (
            // The drawer header already shows the area name (#1168 C-1); keep the badges row.
            <div className="flex flex-wrap gap-2">{overviewBadges}</div>
          ) : (
            <PanelTitleBlock title={heading.title} badges={overviewBadges} />
          )}
        </div>

        <div data-anchor="definition" className="px-4 py-3">
          <PanelSectionTitle>정의</PanelSectionTitle>
          <FieldRow label="Managed System" inset="none">
            <span className="flex items-center gap-1.5">
              {mark && <ManagedSystemMark label={mark.label} color={mark.color} size={18} />}
              <span>{ms?.name ?? area.managed_system_id}</span>
            </span>
          </FieldRow>
          <FieldRow label="슬러그" inset="none">
            <span className="font-mono text-xs">{area.slug}</span>
          </FieldRow>
          <FieldRow label="리드" inset="none">
            {lead ? (
              <UserChip user={{ display_name: lead }} size="sm" />
            ) : (
              <span className="text-text-muted">—</span>
            )}
          </FieldRow>
          <FieldRow label="생성일" inset="none">
            {created}
          </FieldRow>
          <FieldRow label="기본 공개 범위" inset="none">
            <span className="inline-flex items-center gap-1 rounded-full border border-border-subtle px-2 py-0.5 text-xs text-text-secondary">
              <Shield className="h-2.5 w-2.5" />
              내부 · Managed System 범위
            </span>
          </FieldRow>
        </div>

        <div data-anchor="workload" className="px-4 py-3">
          <PanelSectionTitle>{ANALYTICS_AREA_WORKLOAD_SIGNALS_LABEL}</PanelSectionTitle>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1 rounded-md bg-surface-canvas p-3">
              <span className="text-xs text-text-muted">활성 Finding</span>
              <span className="text-lg font-semibold text-text-primary">—</span>
              <span className="text-xs text-text-muted">이 Analytics Area 내</span>
            </div>
            <div className="flex flex-col gap-1 rounded-md bg-surface-canvas p-3">
              <span className="text-xs text-text-muted">Evidence 하이라이트</span>
              <span className="text-lg font-semibold text-text-primary">—</span>
              <span className="text-xs text-text-muted">이 Analytics Area에 연결됨</span>
            </div>
          </div>
        </div>

        <div data-anchor="findings" className="px-4 py-3">
          <PanelSectionTitle>{ANALYTICS_AREA_RECENT_FINDINGS_LABEL}</PanelSectionTitle>
          <p className="text-xs text-text-muted" data-testid="aa-findings-defer">
            Findings · Evidence 집계와 목록은 아직 제공되지 않습니다.
          </p>
        </div>

        <div data-anchor="used-by" className="px-4 py-3">
          <PanelSectionTitle>사용 위치</PanelSectionTitle>
          <div className="flex flex-col gap-1.5">
            {[
              { label: 'VOC Triage', meta: '필터 차원' },
              { label: 'Findings 목록', meta: '필터 + 그룹화' },
              { label: 'Survey 대상 지정', meta: '세그먼트 정의' },
            ].map((u) => (
              <div
                key={u.label}
                className="flex items-center gap-2 rounded-md bg-surface-canvas px-2.5 py-2"
              >
                <Layers className="h-3 w-3 text-text-muted" />
                <span className="text-sm text-text-primary">{u.label}</span>
                <span className="text-xs text-text-muted">· {u.meta}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
