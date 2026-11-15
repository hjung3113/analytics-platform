// useTriagePanelState.ts — per-panel dirty tracking reducer.
//
// Holds staged severity/owner/analyticsArea values and derives `dirty` from
// a diff against the voc baseline. Re-initialises on voc.id change
// (mirrors prototype screen-voc-create.jsx:401-406 useEffect pattern).

import type { VocListItem } from '@ap/feature-shared';
import { useEffect, useReducer } from 'react';

// ── State shape ───────────────────────────────────────────────────────────────

export interface TriagePanelLocalState {
  severity: string | null;
  ownerUserId: string | null;
  ownerTeamId: string | null;
  analyticsAreaId: string | null;
}

// ── Actions ───────────────────────────────────────────────────────────────────

export type TriagePanelAction =
  | { type: 'set_severity'; severity: string | null }
  | { type: 'set_owner'; ownerUserId: string | null; ownerTeamId: string | null }
  | { type: 'set_analytics_area'; analyticsAreaId: string | null }
  | { type: 'reset'; baseline: TriagePanelLocalState };

// ── Reducer ───────────────────────────────────────────────────────────────────

function panelReducer(
  state: TriagePanelLocalState,
  action: TriagePanelAction,
): TriagePanelLocalState {
  switch (action.type) {
    case 'set_severity':
      return { ...state, severity: action.severity };
    case 'set_owner':
      return { ...state, ownerUserId: action.ownerUserId, ownerTeamId: action.ownerTeamId };
    case 'set_analytics_area':
      return { ...state, analyticsAreaId: action.analyticsAreaId };
    case 'reset':
      return { ...action.baseline };
    default:
      return state;
  }
}

function vocToBaseline(voc: VocListItem): TriagePanelLocalState {
  return {
    severity: voc.severity ?? null,
    ownerUserId: voc.owner_user_id ?? null,
    ownerTeamId: voc.owner_team_id ?? null,
    analyticsAreaId: voc.analytics_area_id ?? null,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseTriagePanelStateResult {
  panelState: TriagePanelLocalState;
  baseline: TriagePanelLocalState;
  dispatch: React.Dispatch<TriagePanelAction>;
  dirty: boolean;
}

export function useTriagePanelState(voc: VocListItem): UseTriagePanelStateResult {
  const baseline = vocToBaseline(voc);

  const [panelState, dispatch] = useReducer(panelReducer, baseline);

  // Re-initialise when voc.id changes (user selects a different row)
  useEffect(() => {
    dispatch({ type: 'reset', baseline: vocToBaseline(voc) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when a different VOC is selected (voc.id); other voc fields refresh without discarding the triage draft
  }, [voc.id]);

  const dirty =
    panelState.severity !== baseline.severity ||
    panelState.ownerUserId !== baseline.ownerUserId ||
    panelState.ownerTeamId !== baseline.ownerTeamId ||
    panelState.analyticsAreaId !== baseline.analyticsAreaId;

  return { panelState, baseline, dispatch, dirty };
}
