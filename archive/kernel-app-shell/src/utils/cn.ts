// Ported (copied) from FeedbackOps packages/ui/src/utils/cn.ts @ b5dd614; only import specifiers changed.
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
