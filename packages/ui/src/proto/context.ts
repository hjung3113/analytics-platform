// THROWAWAY #423 — never merge.
import { createContext, useContext, type ComponentType } from 'react';

export type ProtoVariant = 'A' | 'B' | 'C';
export interface ProtoFixedItem { id: string; label: string; reason: string; section: 'external' | 'planned'; icon: ComponentType<{ className?: string }> }
export const PrototypeContext = createContext<{ variant: ProtoVariant; fixed: ProtoFixedItem[] }>({ variant: 'A', fixed: [] });
export const usePrototype = () => useContext(PrototypeContext);
