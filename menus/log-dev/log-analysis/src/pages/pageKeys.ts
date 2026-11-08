import { createContext, useContext } from 'react';

/**
 * The address keys of the investigation body. The standalone screen uses the plain names; a host that already owns `tab`
 * (the Round detail tab, #1475) passes its own names so the two never share a key.
 */
export type PageKeys = { tab: string; focus: string; drawer: string };
export const DEFAULT_PAGE_KEYS: PageKeys = { tab: 'tab', focus: 'focus', drawer: 'drawer' };
export const PageKeysContext = createContext<PageKeys>(DEFAULT_PAGE_KEYS);
export const usePageKeys = () => useContext(PageKeysContext);
