import { createContext, useContext } from 'react';
import type { HwTimeFilter } from './useHwTimeFilter';
/** Shell-owned filter; standalone layout samples retain their original default PM requests. */
export const HwTimeFilterContext = createContext<HwTimeFilter | null>(null);
export const useHwTimeFilterContext = () => useContext(HwTimeFilterContext);
