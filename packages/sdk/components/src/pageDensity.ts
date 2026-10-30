import { createContext, useContext } from 'react';

/** Visual page spacing only; independent of width-based workspace admission and persistence. Internal. */
const PageDensityContext = createContext<'comfortable' | 'compact'>('comfortable');
export const PageDensityProvider = PageDensityContext.Provider;
export const useCompactPageDensity = () => useContext(PageDensityContext) === 'compact';
