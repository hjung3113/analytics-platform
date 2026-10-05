// THROWAWAY #156 — never merge.
import { createContext, useContext } from 'react';
export type ProtoVariant = 'A' | 'B' | 'C';
export const PrototypeContext = createContext({ management: 'A' as ProtoVariant, analysis: 'A' as ProtoVariant });
export const usePrototype = () => useContext(PrototypeContext);
