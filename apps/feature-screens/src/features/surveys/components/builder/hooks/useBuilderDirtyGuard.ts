import { useCallback, useEffect, useRef, useState } from 'react';

export function useBuilderDirtyGuard() {
  const [dirty, setDirtyState] = useState(false);
  const dirtyRef = useRef(false);
  const setDirty = useCallback((nextDirty: boolean) => {
    dirtyRef.current = nextDirty;
    setDirtyState(nextDirty);
  }, []);

  useEffect(() => {
    if (!dirty) return;

    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [dirty]);

  return { dirtyRef, setDirty };
}
