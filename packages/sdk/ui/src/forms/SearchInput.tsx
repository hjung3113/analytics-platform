import { useCallback, useRef, type KeyboardEvent, type Ref } from 'react';
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
import { useImeEnterGuard } from './useImeEnterGuard.js';

export interface SearchInputProps {
  messages?: Partial<{ placeholder: string; disabled: string; clear: string }>;
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
   * (`useImeEnterGuard`: isComposing, keyCode 229, or Safari's Enter right after compositionend) does not commit; the next ordinary Enter
   * does. The current value is already with the parent via `onValueChange`.
   * Escape keeps its own clear behaviour and never commits.
   */
  onCommit?: () => void;
  /** Optional ref to the `<input>` (e.g. a `/` shortcut that focuses the search). Controlled mode only. */
  inputRef?: Ref<HTMLInputElement>;
  /**
   * Optional key handler, controlled mode only. It runs before the built-in keys (Enter commit, Escape clear);
   * `preventDefault()` skips them.
   */
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}

const DEFAULT_MESSAGES = { placeholder: '검색…', disabled: '검색을 사용할 수 없습니다.', clear: 'Clear' };

export function SearchInput({
  messages,
  placeholder = messages?.placeholder ?? DEFAULT_MESSAGES.placeholder,
  className,
  value,
  onValueChange,
  onCommit,
  inputRef,
  onKeyDown,
  size = 'default',
  'aria-label': ariaLabel,
  clearLabel = messages?.clear ?? DEFAULT_MESSAGES.clear,
}: SearchInputProps) {
  const ime = useImeEnterGuard();
  // The clear button unmounts once the value is empty, so it hands focus to the box (#3142); the caller's ref still gets the element.
  const input = useRef<HTMLInputElement | null>(null);
  const setInput = useCallback((element: HTMLInputElement | null) => {
    input.current = element;
    if (typeof inputRef === 'function') inputRef(element);
    else if (inputRef) inputRef.current = element;
  }, [inputRef]);
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
          <TooltipContent>{messages?.disabled ?? DEFAULT_MESSAGES.disabled}</TooltipContent>
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
        ref={setInput}
        inputSize={size}
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className={cn('pl-9', size === 'toolbar' && 'pr-9 [&::-webkit-search-cancel-button]:appearance-none')}
        onChange={(event) => onValueChange(event.target.value)}
        onCompositionStart={ime.onCompositionStart}
        onCompositionEnd={ime.onCompositionEnd}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          // A dialog (e.g. Radix) may have already handled this Escape on
          // document capture; one key must not also clear the box.
          if (event.defaultPrevented) return;
          // Confirming an IME composition also reports Enter (useImeEnterGuard).
          if (ime.isComposingEnter(event)) return;
          // The box commits its own query: Enter must not also submit a surrounding <form>.
          if (event.key === 'Enter' && onCommit !== undefined) {
            event.preventDefault();
            onCommit();
          }
          if (event.key === 'Escape' && value !== '') {
            event.preventDefault();
            onValueChange('');
          }
        }}
        {...(onCommit !== undefined ? { onBlur: () => onCommit() } : {})}
      />
      {size === 'toolbar' && value && <Button type="button" variant="navigation" size="icon-xs" className="absolute right-0.5" aria-label={clearLabel} onClick={() => { onValueChange(''); input.current?.focus(); }}><X className="size-4" aria-hidden /></Button>}
    </div>
  );
}

SearchInput.displayName = 'SearchInput';
