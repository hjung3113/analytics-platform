import { createContext, useContext } from 'react';

/** Visual page spacing only; independent of width-based workspace admission and persistence. Internal. */
const PageDensityContext = createContext<'comfortable' | 'compact'>('comfortable');
export const PageDensityProvider = PageDensityContext.Provider;
export const useCompactPageDensity = () => useContext(PageDensityContext) === 'compact';
/** Horizontal page inset per density, shared by the page chrome. Internal — not exported from `src/index.ts`. */
export const pageInsetX = (compact: boolean): 'px-4' | 'px-8' => (compact ? 'px-4' : 'px-8');
