import type { ReactNode } from 'react';
import { ORIGINAL_LABEL } from '../lib/copy/glossary';
import { useHostSeam } from '../lib/host/host-seam';

export function OriginalDisclosure({ children }: { children: ReactNode }) {
  const { lang = 'ko' } = useHostSeam();
  return <details className="break-keep text-sm">
    <summary className="cursor-pointer py-1.5 text-text-secondary">{ORIGINAL_LABEL[lang]}</summary>
    {children}
  </details>;
}
