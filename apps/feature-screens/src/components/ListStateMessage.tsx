import type { ReactNode } from 'react';

import { Button, EmptyState } from '@ap/ui';

export type ListStateVariant = 'empty' | 'filtered' | 'error';

export interface ListStateAction {
  label: string;
  onClick: () => void;
}

export interface ListStateMessageProps {
  variant: ListStateVariant;
  title: string;
  body?: string;
  action?: ListStateAction;
  /** Preserves existing permission-specific Survey actions that are not plain buttons. */
  actionContent?: ReactNode;
  /** `start`: small, start-aligned message for list sections that keep their own headings. Default: unchanged. */
  align?: 'center' | 'start';
}

export function ListStateMessage({
  variant,
  title,
  body,
  action,
  actionContent,
  align = 'center',
}: ListStateMessageProps) {
  const renderedAction =
    action !== undefined ? (
      <Button type="button" variant="primary" size="sm" onClick={action.onClick}>
        {action.label}
      </Button>
    ) : (
      actionContent
    );

  return (
    <div data-testid="list-state-message" data-variant={variant}>
      <EmptyState
        title={title}
        {...(body !== undefined ? { body } : {})}
        action={renderedAction}
        {...(align === 'start' ? { size: 'sm', className: 'items-start px-0 text-left' } : {})}
      />
    </div>
  );
}
