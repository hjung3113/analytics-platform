import { Search, X } from 'lucide-react';
import { Button } from '../components/Button.js';
import { Input } from '../components/shadcn/input.js';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/shadcn/tooltip.js';
import { cn } from '../utils/cn.js';

export interface SearchInputProps {
  placeholder?: string;
  size?: 'default' | 'toolbar';
  'aria-label'?: string;
  clearLabel?: string;
  className?: string;
  /**
   * Controlled value. Only read when `onValueChange` is provided (#821).
   */
  value?: string;
  /**
   * When provided, the input renders enabled and controlled. Without it the
   * component stays the disabled placeholder (tooltip on focus) used by routes
   * whose search endpoint has not shipped yet.
   */
  onValueChange?: (value: string) => void;
  /**
   * #864: called when the user commits the draft — on Enter and on blur, in
   * controlled mode only. An Enter that confirms an IME composition
   * (`isComposing`, or keyCode 229) does not commit; the next ordinary Enter
   * does. The current value is already with the parent via `onValueChange`.
   * Escape keeps its own clear behaviour and never commits.
   */
  onCommit?: () => void;
}

const DISABLED_TOOLTIP = '검색은 다음 슬라이스에서 제공됩니다';
const DEFAULT_PLACEHOLDER = 'VOC 검색…';

export function SearchInput({
  placeholder = DEFAULT_PLACEHOLDER,
  className,
  value,
  onValueChange,
  onCommit,
  size = 'default',
  'aria-label': ariaLabel,
  clearLabel = 'Clear',
}: SearchInputProps) {
  if (onValueChange === undefined) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {/*
             * Tooltip-on-disabled-input pattern:
             * Disabled inputs don't fire pointer events, so the Tooltip trigger
             * is a focusable wrapper <span tabIndex={0}> that receives pointer +
             * keyboard events. The inner Input carries disabled + aria-disabled.
             */}
            <span
              tabIndex={0}
              className={cn(
                'relative inline-flex items-center cursor-not-allowed opacity-50',
                className,
              )}
              aria-label={ariaLabel ?? placeholder}
            >
              <Search
                className="pointer-events-none absolute left-3 h-4 w-4 text-text-muted"
                aria-hidden="true"
              />
              <Input
                inputSize={size}
                placeholder={placeholder}
                disabled
                aria-disabled="true"
                className="pl-9 cursor-not-allowed"
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>{DISABLED_TOOLTIP}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn('relative inline-flex items-center', className)}>
      <Search
        className="pointer-events-none absolute left-3 h-4 w-4 text-text-muted"
        aria-hidden="true"
      />
      <Input
        inputSize={size}
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className={cn('pl-9', size === 'toolbar' && 'pr-9 [&::-webkit-search-cancel-button]:appearance-none')}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          // A dialog (e.g. Radix) may have already handled this Escape on
          // document capture; one key must not also clear the box.
          if (event.defaultPrevented) return;
          // Confirming an IME composition also reports Enter. keyCode 229 is the
          // fallback where isComposing is missing (older Chrome/Safari).
          const native = event.nativeEvent;
          const composingEnter = native.isComposing || native.keyCode === 229;
          if (event.key === 'Enter' && onCommit !== undefined && !composingEnter) onCommit();
          if (event.key === 'Escape' && value !== '') {
            event.preventDefault();
            onValueChange('');
          }
        }}
        {...(onCommit !== undefined ? { onBlur: () => onCommit() } : {})}
      />
      {size === 'toolbar' && value && <Button type="button" variant="navigation" size="icon-xs" className="absolute right-0.5" aria-label={clearLabel} onClick={() => onValueChange('')}><X className="size-4" aria-hidden /></Button>}
    </div>
  );
}

SearchInput.displayName = 'SearchInput';
