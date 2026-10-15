// THROWAWAY #303/#307 — never merge.
import { createContext, useContext } from 'react';

export type ProtoQuestion = 'header' | 'brush' | null;
export type ProtoVariant = 'A' | 'B' | 'C';
export type PrototypeState = { question: ProtoQuestion; variant: ProtoVariant };

export const PrototypeContext = createContext<PrototypeState>({ question: null, variant: 'A' });
export const usePrototype = () => useContext(PrototypeContext);
