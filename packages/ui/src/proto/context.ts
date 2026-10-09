// THROWAWAY #250 — never merge.
import { createContext, useContext } from 'react';

export type ProtoVariant = 'A' | 'B' | 'C' | 'D';
export const PrototypeContext = createContext<ProtoVariant>('A');
export const usePrototype = () => useContext(PrototypeContext);
