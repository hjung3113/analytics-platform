import { useState } from 'react';
import type { ScreenProps } from './contracts';

type Widen<T> = T extends number ? number : string;
const pageKeys = new Set(['page', 'requestsPage', 'rulesPage']);
const dependentKeys: Record<string, readonly string[]> = { page: [], requestsPage: ['request', 'attempt', 'rulesPage', 'rule', 'issue'], rulesPage: [], request: ['attempt', 'rulesPage', 'rule', 'issue'], attempt: ['rulesPage', 'rule', 'issue'] };
/** Menu host owns persistence and history; tests and embedded previews can use local state. */
export function usePageValue<T extends string | number>(props: Pick<ScreenProps, 'state' | 'setState'>, key: string, fallback: T, resets: readonly string[] = dependentKeys[key] ?? ['page']): [Widen<T>, (value: Widen<T>) => void] {
  const [local, setLocal] = useState<string | number>(fallback);
  const raw = props.state?.[key];
  const value = raw === undefined ? props.state ? fallback : local : typeof fallback === 'number' ? Number(raw) - (pageKeys.has(key) ? 1 : 0) : raw;
  return [value as Widen<T>, next => {
    // Kernel builds each write from the rendered URL: values and their resets must share one patch.
    if (props.setState) props.setState({ ...Object.fromEntries(resets.map(reset => [reset, undefined])), [key]: next === fallback ? undefined : String(typeof next === 'number' && pageKeys.has(key) ? next + 1 : next) });
    else setLocal(next);
  }];
}
