import * as React from 'react';
import { cn } from '../../utils/cn.js';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** `toolbar` (ADR-0037 amendment, #1217 D9): the 32px, `surface-sunken`, 13px field that sits in a table toolbar beside the 32px buttons. Default keeps the 40px field. The native numeric `size` attribute stays `size` and is forwarded as before. */
  inputSize?: 'default' | 'toolbar';
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, inputSize = 'default', ...props }, ref) => {
    return (
      <input
        type={type}
        data-size={inputSize === 'toolbar' ? 'toolbar' : undefined}
        className={cn(
          'flex w-full rounded-md border border-border-subtle text-text-primary placeholder:text-text-muted',
          inputSize === 'toolbar' ? 'h-8 bg-surface-sunken px-2.5 py-0 text-sm' : 'h-10 bg-surface-field px-3 py-2 text-sm',
          'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
