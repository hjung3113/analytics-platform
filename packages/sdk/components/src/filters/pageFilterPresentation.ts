import { createContext } from 'react';

/** An enclosing parameter popover owns disclosure; preserve the inline filter's stored preference. */
export const PageFilterExpandedContext = createContext(false);
