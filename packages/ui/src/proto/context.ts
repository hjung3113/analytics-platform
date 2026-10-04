// THROWAWAY #203/#195. Never merge this branch into main.
import { createContext } from 'react';
export type ChartPrototypeVariant = 'A' | 'B1' | 'B2' | 'B3';
export type DetailPrototypeVariant = 'A' | 'B' | 'C';
export const PrototypeContext = createContext<{
  chartActive: boolean; chart: ChartPrototypeVariant; detail: DetailPrototypeVariant;
  detailHost: HTMLElement | null; detailOpen: boolean;
  setDetailOpen: (open: boolean) => void;
}>({ chartActive: false, chart: 'A', detail: 'A', detailHost: null, detailOpen: false, setDetailOpen: () => {} });
