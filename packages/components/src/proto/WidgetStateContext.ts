// THROWAWAY #55 — widget-only presentation scope.
import { createContext, useContext } from 'react';
import type { ProtoVariant } from '@ap/ui';
export const WidgetStateContext = createContext<ProtoVariant>('A');
export const useWidgetState = () => useContext(WidgetStateContext);
