import type { ReactElement, ReactNode } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/shadcn/alert-dialog.js';
import { Input } from '../components/shadcn/input.js';
import { FormField } from '../forms/FormField.js';

export const DECISION_RULE_KINDS = ['reversible', 'judgment', 'irreversible'] as const;
export type DecisionRuleKind = (typeof DECISION_RULE_KINDS)[number];

const DECISION_RULES_COPY = {
  undoLabel: '실행 취소',
  reasonLabel: '결정 사유 (한 줄)',
  requiredMark: '· 필수',
  reasonRequired: '결정 사유를 입력해 주세요.',
  confirmTitle: '변경 내용을 확인해 주세요.',
  confirm: '확인',
  cancel: '취소',
} as const;

export interface DecisionUndoToastAction {
  label: string;
  onAction: () => void;
}

export interface CreateDecisionUndoToastActionOptions {
  kind: 'reversible';
  onUndo: () => void;
  label?: string;
}

/** Supplies the standard action label and callback shape for a host toast with an undo action. */
export function createDecisionUndoToastAction({ kind, onUndo, label = DECISION_RULES_COPY.undoLabel }: CreateDecisionUndoToastActionOptions): DecisionUndoToastAction {
  switch (kind) {
    case 'reversible':
      return { label, onAction: onUndo };
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unsupported decision rule: ${exhaustive}`);
    }
  }
}

export function requiredDecisionReasonError(value: string, message = DECISION_RULES_COPY.reasonRequired): string | undefined {
  return value.trim().length > 0 ? undefined : message;
}

export interface DecisionReasonFieldProps {
  kind: 'judgment';
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  maxLength?: number;
  error?: ReactNode;
  messages?: Partial<{
    reasonLabel: string;
    requiredMark: string;
  }>;
}

/** One-line, required reason input for an opt-in judgment record. */
export function DecisionReasonField({ kind, value, onChange, id, disabled = false, maxLength = 200, error, messages }: DecisionReasonFieldProps) {
  if (kind !== 'judgment') return null;
  return (
    <FormField
      {...(id !== undefined ? { id } : {})}
      label={messages?.reasonLabel ?? DECISION_RULES_COPY.reasonLabel}
      required
      requiredMark="text"
      requiredText={messages?.requiredMark ?? DECISION_RULES_COPY.requiredMark}
      error={error}
    >
      {(control) => (
        <Input
          {...control}
          type="text"
          value={value}
          maxLength={maxLength}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FormField>
  );
}

export interface DecisionImpactConfirmDialogProps {
  kind: 'irreversible';
  trigger: ReactElement;
  /** The consumer supplies one sentence naming the affected target, system, permission and lost capability. */
  impactText: string;
  onConfirm: () => void;
  pending?: boolean;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

/** Confirmation gate for opt-in irreversible actions. The AlertDialog trigger owns focus return. */
export function DecisionImpactConfirmDialog({ kind, trigger, impactText, onConfirm, pending = false, title = DECISION_RULES_COPY.confirmTitle, confirmLabel = DECISION_RULES_COPY.confirm, cancelLabel = DECISION_RULES_COPY.cancel }: DecisionImpactConfirmDialogProps) {
  if (kind !== 'irreversible') return trigger;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{impactText}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
