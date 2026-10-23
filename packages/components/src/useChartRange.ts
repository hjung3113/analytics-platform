import { useMemo, useReducer } from 'react';

export type Selection = { from: string; to: string };
export type ClipNotice = 'partial' | 'outside';
/** What `clipToPeriod` decided: the range that survives (null = nothing selected) and the notice to show. */
export type ClipResult = { range: Selection | null; notice: ClipNotice | null };
type Zoom = [number, number];

type RangeState = {
  selection: Selection | null;
  preview: Selection | null;
  zoom: Zoom;
  clipNotice: ClipNotice | null;
  rangeDraft: Selection | null;
  brushMode: boolean;
};

type RangeAction =
  | { type: 'contextReset' }
  | { type: 'buttonReset' }
  /** A snapped time range (brush or commit). null = the snap failed: only an open confirm is dropped. */
  | { type: 'snapSelect'; result: ClipResult | null }
  /** A category brush. null = invalid bounds: the selection stays. */
  | { type: 'categorySelect'; range: Selection | null }
  | { type: 'clear' }
  | { type: 'preview'; range: Selection | null }
  | { type: 'draft'; range: Selection | null }
  | { type: 'zoom'; range: Zoom }
  | { type: 'zoomIn' }
  | { type: 'toggleBrush' }
  /** Compare turned on: re-clip whichever of selection/preview exists. */
  | { type: 'compareClip'; result: ClipResult };

const initialState: RangeState = { selection: null, preview: null, zoom: [0, 100], clipNotice: null, rangeDraft: null, brushMode: false };

function reduce(state: RangeState, action: RangeAction): RangeState {
  switch (action.type) {
    case 'contextReset':
      return { ...state, selection: null, preview: null, zoom: [0, 100], clipNotice: null, rangeDraft: null };
    case 'buttonReset':
      return { ...state, selection: null, preview: null, zoom: [0, 100], clipNotice: null, rangeDraft: null, brushMode: false };
    case 'snapSelect':
      if (!action.result) return { ...state, preview: null };
      return { ...state, selection: action.result.range, clipNotice: action.result.notice, preview: null, rangeDraft: null };
    case 'categorySelect':
      return { ...state, selection: action.range ?? state.selection, clipNotice: null, rangeDraft: null, preview: null };
    case 'clear':
      return { ...state, selection: null, clipNotice: null, rangeDraft: null };
    case 'preview':
      return { ...state, preview: action.range };
    case 'draft':
      return { ...state, rangeDraft: action.range };
    case 'zoom':
      return { ...state, zoom: action.range };
    case 'zoomIn': {
      const [a, b] = state.zoom;
      const q = (b - a) / 4;
      return { ...state, zoom: [a + q, b - q] };
    }
    case 'toggleBrush':
      return { ...state, brushMode: !state.brushMode };
    case 'compareClip':
      return {
        ...state,
        selection: state.selection ? action.result.range : state.selection,
        preview: state.preview ? action.result.range : state.preview,
        clipNotice: action.result.notice,
        rangeDraft: null,
      };
  }
}

/**
 * The chart's range state (selection, confirm preview, zoom, clip notice, start/end draft, brush mode).
 * Compound transitions keep the related fields together. Context reset keeps brush mode; the Reset button clears it.
 * Closing the annotation editor and the point menu is the caller's job, in the same handler.
 */
export function useChartRange() {
  const [state, dispatch] = useReducer(reduce, initialState);
  const actions = useMemo(() => ({
    contextReset: () => dispatch({ type: 'contextReset' }),
    buttonReset: () => dispatch({ type: 'buttonReset' }),
    snapSelect: (result: ClipResult | null) => dispatch({ type: 'snapSelect', result }),
    categorySelect: (range: Selection | null) => dispatch({ type: 'categorySelect', range }),
    clear: () => dispatch({ type: 'clear' }),
    setPreview: (range: Selection | null) => dispatch({ type: 'preview', range }),
    setDraft: (range: Selection | null) => dispatch({ type: 'draft', range }),
    setZoom: (range: Zoom) => dispatch({ type: 'zoom', range }),
    zoomIn: () => dispatch({ type: 'zoomIn' }),
    toggleBrush: () => dispatch({ type: 'toggleBrush' }),
    compareClip: (result: ClipResult) => dispatch({ type: 'compareClip', result }),
  }), []);
  return { state, actions };
}
