import type * as React from 'react';

export interface LineValidationError {
  line: number;
  message: string;
}

export type LineValidationRule = (line: string, lineNumber: number) => string | null | undefined;

export interface ValidateLinesOptions {
  maxLines: number;
  /** Supply localized copy from the Kernel messages table when needed. */
  maxLinesMessage?: string;
}

const LINE_BREAK = /\r\n|\n|\r/;

/** Validate each physical line, reporting the first line beyond the limit instead of dropping it. */
export function validateLines(
  text: string,
  rule: LineValidationRule,
  { maxLines, maxLinesMessage }: ValidateLinesOptions,
): LineValidationError[] {
  if (!Number.isSafeInteger(maxLines) || maxLines < 1 || maxLines >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('maxLines must be a positive safe integer');
  }

  const lines = text.split(LINE_BREAK, maxLines + 1);
  const errors: LineValidationError[] = [];
  const checkedCount = Math.min(lines.length, maxLines);

  for (let index = 0; index < checkedCount; index += 1) {
    const lineNumber = index + 1;
    const message = rule(lines[index] ?? '', lineNumber);
    if (message !== undefined && message !== null && message !== '') {
      errors.push({ line: lineNumber, message });
    }
  }

  if (lines.length > maxLines) {
    errors.push({
      line: maxLines + 1,
      message: maxLinesMessage ?? `최대 ${maxLines}행까지 입력할 수 있습니다.`,
    });
  }

  return errors;
}

export interface LineErrorListMessages {
  line: (line: number, message: string) => React.ReactNode;
  remaining: (count: number) => React.ReactNode;
}

export interface LineErrorListProps {
  errors: readonly LineValidationError[];
  maxVisible?: number;
  messages?: LineErrorListMessages;
}

const DEFAULT_MAX_VISIBLE = 5;
const DEFAULT_MESSAGES: LineErrorListMessages = {
  line: (line, message) => `${line}행: ${message}`,
  remaining: (count) => `외 ${count}건`,
};

/** Small inline list for a bulk input's first errors and remaining count. */
export function LineErrorList({
  errors,
  maxVisible = DEFAULT_MAX_VISIBLE,
  messages = DEFAULT_MESSAGES,
}: LineErrorListProps) {
  if (errors.length === 0) return null;

  const visibleCount = Math.max(0, Math.floor(maxVisible));
  const visibleErrors = errors.slice(0, visibleCount);
  const remainingCount = errors.length - visibleErrors.length;

  return (
    <ul className="grid gap-1 break-keep text-xs text-text-danger-label" aria-live="polite">
      {visibleErrors.map((error, index) => (
        <li key={`${error.line}-${index}`}>{messages.line(error.line, error.message)}</li>
      ))}
      {remainingCount > 0 && <li>{messages.remaining(remainingCount)}</li>}
    </ul>
  );
}
