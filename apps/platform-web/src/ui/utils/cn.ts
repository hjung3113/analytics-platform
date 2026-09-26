// Copied from products/feedbackops/packages/ui/src (6a0c7f8); import suffixes adjusted only.
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
