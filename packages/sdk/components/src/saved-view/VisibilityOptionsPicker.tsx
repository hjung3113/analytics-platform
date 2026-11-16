import { useId } from 'react';
import { Label, RadioGroup, RadioGroupItem } from '@ap/ui';

export type VisibilityOption = { value: string; label: string };
export type VisibilityOptionsPickerProps = {
  label: string;
  value: string;
  onChange(next: string): void;
  options: readonly VisibilityOption[];
};

/** Shared audience choices used by saved views and inline custom-group saves. */
export function VisibilityOptionsPicker({ label, value, onChange, options }: VisibilityOptionsPickerProps) {
  const id = useId();
  return <fieldset className="space-y-1">
    <legend className="text-xs text-text-secondary">{label}</legend>
    <RadioGroup value={value} onValueChange={onChange}>
      {options.map(option => <div key={option.value} className="flex items-center gap-2">
        <RadioGroupItem id={`${id}-${option.value}`} value={option.value} />
        <Label htmlFor={`${id}-${option.value}`}>{option.label}</Label>
      </div>)}
    </RadioGroup>
  </fieldset>;
}
