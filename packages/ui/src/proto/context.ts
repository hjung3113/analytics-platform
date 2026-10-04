// THROWAWAY #207/#54/#55/#56 — never merge.
import { createContext, useContext } from 'react';
export type ProtoVariant = 'A' | 'B' | 'C';
export const PrototypeContext = createContext({ chart: 'A' as ProtoVariant, filters: 'A' as ProtoVariant, states: 'A' as ProtoVariant, context: 'A' as ProtoVariant });
export const usePrototype = () => useContext(PrototypeContext);
