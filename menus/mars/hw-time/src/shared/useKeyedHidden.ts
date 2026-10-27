import { useState } from 'react';

/** A legend's hidden series ids, kept per `key`: a different key (another series set) reads empty, and the next write replaces the stored set. */
export function useKeyedHidden(key: string): [string[], (ids: string[]) => void] {
  const [state, setState] = useState<{ key: string; ids: string[] }>({ key, ids: [] });
  return [state.key === key ? state.ids : [], ids => setState({ key, ids })];
}
