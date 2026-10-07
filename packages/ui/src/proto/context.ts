// THROWAWAY #228 — never merge.
import { createContext, useContext } from 'react';

export type ProtoVariant = 'A' | 'B' | 'C';
export const PrototypeContext = createContext<ProtoVariant>('A');
export const usePrototype = () => useContext(PrototypeContext);
