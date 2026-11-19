# Decision rules

`@ap/ui` exports domain-neutral parts for actions that consumers explicitly classify as reversible, judgment or irreversible. No existing control opts in automatically.

```tsx
import {
  DecisionImpactConfirmDialog,
  DecisionReasonField,
  createDecisionUndoToastAction,
  requiredDecisionReasonError,
} from '@ap/ui';
```

## Reversible

Use `createDecisionUndoToastAction({ kind: 'reversible', onUndo })` to create the standard `{ label, onAction }` shape for a host's toast with an action. The consumer runs the domain command immediately and implements restoration with its own command.

## Judgment

`DecisionReasonField` requires `kind="judgment"` and renders one text input with an accessible required state and visible required mark. Pass an `error` only after submit or blur; `requiredDecisionReasonError(value)` supplies the Korean default message for whitespace-only input. The SDK does not set a length limit; pass `maxLength` only when the consumer contract declares one. The consumer records the returned value with its decision and owns the history ordering and self-approval meaning.

## Irreversible

`DecisionImpactConfirmDialog` requires `kind="irreversible"`, a trigger, impact sentence, and confirmation callback. The callback runs only from the confirm button. Radix returns focus to the trigger when the dialog closes. Consumers provide the impact sentence and may override the Korean title, confirm and cancel labels.

All Korean defaults can be overridden through the helper label, field `messages`, the validation helper's message argument, or dialog text props. The SDK does not own domain state, permissions, commands, history or impact wording.
