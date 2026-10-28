// /admin/analytics-areas — Analytics Area catalog (issue #88).
//
// Rebuilt from the raw HTML-table CRUD harness to the design prototype
// (docs/feedbackops/design-prototype/screen-admin.jsx → AdminAreasScreen +
// AnalyticsAreaSlideOver). Live API data only; the prototype's window globals /
// synthetic data are not ported (AGENTS.md → UI Authority). Maps the
// prototype's dark-token components to the real @ap/feature-ui light-token components
// (ADR-0021 / Pack 17).
//
// Prototype-silent / locked deviations (recorded in the PR/commit body):
//   1. scope-mark color/mark — derived deterministically from slug+name via
//      features/admin/lib/scopeMark (the API has no color column). Shared with #87.
//   2. Lead — the prototype hard-codes a single user (u-1). The DTO carries
//      `owner_team_id` only, resolved to a team name via GET /actors/resolve.
//   3. Created — from the live `created_at` (prototype shows a static literal).
//   4. Workload / Findings — Slice 4/5 surfaces (Findings/Evidence) are NOT
//      built. The section shells render as empty "—" placeholders with a
//      defer-with-issue note; no invented counts (locked decision).

import { Button, PageShell } from '@ap/ui';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { createLabel } from '@/lib/copy/glossary';
import type { ClosableDetailParts } from '@/lib/host/detail-parts';
import { useHostSeam } from '@/lib/host/host-seam';
import { useHostSearchWriter } from '@/lib/host/useHostSearchWriter';
import { PermissionGate } from '../permissions/permission-gate.js';
import { AnalyticsAreasBody } from './AnalyticsAreasContainer.js';
import { AnalyticsAreasFilter } from './AnalyticsAreasList.js';
import { validateAnalyticsAreasSearch } from './search.js';

const SUBTITLE = 'Managed System 안에서 Analytics Area 분류 기준을 관리합니다.';
const GUARDRAIL_TITLE = 'Analytics Area는 권한 경계가 아닙니다';
const GUARDRAIL_BODY =
  'Analytics Area는 Managed System 안에서 분류와 집계에만 쓰입니다. 권한 범위는 Managed System으로만 정해집니다.';

export type AnalyticsAreasScreenProps = {
  /** The host places the detail parts in its drawer; absent keeps the standalone Sheet. */
  renderDetail?: ((parts: ClosableDetailParts) => ReactNode) | undefined;
};

export function AnalyticsAreasAdminPage({ renderDetail }: AnalyticsAreasScreenProps = {}) {
  const { hostOwnsTitle } = useHostSeam();
  const { search, write } = useHostSearchWriter(
    '/admin/analytics-areas',
    validateAnalyticsAreasSearch,
  );
  const [registerCtx, setRegisterCtx] = useState<{ open: boolean; msId: string | null }>({
    open: false,
    msId: null,
  });
  const managedSystemId = search.managedSystem;
  const includeArchived = search.includeArchived === 'true';

  // Filter changes drop `selected` in the same navigation; defaults are omitted
  // from the URL (never write undefined/false values).
  function handleManagedSystemChange(value: string | undefined): void {
    write((prev) => {
      const { selected: _dropped, ...rest } = prev;
      if (value === undefined) {
        const { managedSystem: _managedSystem, ...restWithoutMs } = rest;
        return restWithoutMs;
      }
      return { ...rest, managedSystem: value };
    });
  }

  function handleIncludeArchivedChange(value: boolean): void {
    write((prev) => {
      const { selected: _dropped, ...rest } = prev;
      if (!value) {
        const { includeArchived: _includeArchived, ...restWithoutArchived } = rest;
        return restWithoutArchived;
      }
      return { ...rest, includeArchived: 'true' };
    });
  }

  function handleClearFilters(): void {
    write((prev) => {
      const {
        managedSystem: _managedSystem,
        includeArchived: _includeArchived,
        selected: _selected,
        ...rest
      } = prev;
      return rest;
    });
  }

  return (
    <PageShell
      header={{
        ...(hostOwnsTitle ? {} : { title: 'Analytics Area', subtitle: SUBTITLE }),
        actions: (
          <PermissionGate capability="workspace.admin" fallback={null} loading={null}>
            <AnalyticsAreasFilter
              includeArchived={includeArchived}
              managedSystemId={managedSystemId}
              onIncludeArchivedChange={handleIncludeArchivedChange}
              onManagedSystemIdChange={handleManagedSystemChange}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => setRegisterCtx({ open: true, msId: null })}
              data-testid="aa-new-area-button"
            >
              <Plus className="h-4 w-4" />
              {createLabel('Analytics Area')}
            </Button>
          </PermissionGate>
        ),
      }}
    >
      <PermissionGate capability="workspace.admin">
        <AnalyticsAreasBody
          includeArchived={includeArchived}
          managedSystemId={managedSystemId}
          selectedId={search.selected}
          renderDetail={renderDetail}
          onClearFilters={handleClearFilters}
          registerCtx={registerCtx}
          setRegisterCtx={setRegisterCtx}
          guardrailTitle={GUARDRAIL_TITLE}
          guardrailBody={GUARDRAIL_BODY}
        />
      </PermissionGate>
    </PageShell>
  );
}
