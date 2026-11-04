import * as React from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '../components/shadcn/alert-dialog.js';
import { buttonVariants } from '../components/Button.js';
import { cn } from '../utils/cn.js';

export interface DirtyConfirmationProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

const DEFAULT_TITLE = '변경사항이 저장되지 않았습니다';
const DEFAULT_MESSAGE = '이동하면 작성 중인 내용이 사라집니다.';
const DEFAULT_CONFIRM = '이동';
const DEFAULT_CANCEL = '계속 작성';

export function DirtyConfirmation({
  open,
  onConfirm,
  onCancel,
  title = DEFAULT_TITLE,
  message = DEFAULT_MESSAGE,
  confirmLabel = DEFAULT_CONFIRM,
  cancelLabel = DEFAULT_CANCEL,
}: DirtyConfirmationProps) {
  // Buttons close the dialog through Radix since #1324; onOpenChange must not re-run the
  // callback the button already ran, so only other closes (Escape) fall through to onCancel.
  const buttonHandled = React.useRef(false);
  // Radix runs its close in the same click dispatch; if a caller's preventDefault skips it, the
  // flag must not outlive the click and swallow a later Escape.
  const markButtonHandled = () => {
    buttonHandled.current = true;
    queueMicrotask(() => { buttonHandled.current = false; });
  };
  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) { if (buttonHandled.current) buttonHandled.current = false; else onCancel(); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            className={buttonVariants({ variant: 'secondary' })}
            onClick={() => { markButtonHandled(); onCancel(); }}
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: 'destructive' }))}
            onClick={() => { markButtonHandled(); onConfirm(); }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

DirtyConfirmation.displayName = 'DirtyConfirmation';
