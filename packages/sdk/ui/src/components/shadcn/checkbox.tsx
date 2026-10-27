import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { cn } from '../../utils/cn.js';

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, checked, defaultChecked = false, onCheckedChange, ...props }, ref) => {
  const [internalChecked, setInternalChecked] = React.useState(defaultChecked);
  const value = checked ?? internalChecked;
  return (
  <CheckboxPrimitive.Root
    ref={ref}
    checked={value}
    onCheckedChange={next => {
      if (checked === undefined) setInternalChecked(next);
      onCheckedChange?.(next);
    }}
    className={cn(
      'peer h-4 w-4 shrink-0 rounded-sm border border-border-strong',
      'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-accent-primary data-[state=checked]:text-text-on-accent',
      'data-[state=indeterminate]:bg-accent-primary data-[state=indeterminate]:text-text-on-accent',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      {value === 'indeterminate' ? <Minus className="h-4 w-4" /> : <Check className="h-4 w-4" />}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
);
});
Checkbox.displayName = CheckboxPrimitive.Root.displayName;
