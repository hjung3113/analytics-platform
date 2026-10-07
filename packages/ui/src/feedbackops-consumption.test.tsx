// THROWAWAY #228 — never merge.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import * as feedbackOps from '@fops/ui';
import * as platform from './index';
import { Button as FeedbackOpsButton } from '@fops/ui';

afterEach(cleanup);

it('renders a primitive from the FeedbackOps UI package', () => {
  render(<FeedbackOpsButton>FeedbackOps primitive</FeedbackOpsButton>);

  expect(screen.getByRole('button', { name: 'FeedbackOps primitive' }).textContent).toBe('FeedbackOps primitive');
});

it('preserves FeedbackOps re-exports except throwaway prototype wrappers', () => {
  const platformOnly = new Set(['Dot', 'StatusBadge', 'isProductionEnv', 'DetailPanelSlotProvider', 'useDetailPanelSlot', 'useDetailPanelSlotHost', 'PrototypeContext', 'usePrototype']);
  const prototypeWrappers = new Set([
    'Button', 'PopoverContent', 'DropdownMenuContent', 'DropdownMenuItem',
    'DropdownMenuRadioItem', 'DropdownMenuLabel', 'TabsList', 'TabsTrigger',
    'TabsContent', 'Label', 'Checkbox', 'Skeleton', 'Input', 'TooltipContent',
    'SelectTrigger', 'SelectContent',
  ]);
  const upstream = feedbackOps as unknown as Record<string, unknown>;
  for (const [name, value] of Object.entries(platform)) {
    if (prototypeWrappers.has(name)) {
      expect(value, name).not.toBe(upstream[name]);
      expect((value as { displayName?: string }).displayName, name).toBe((upstream[name] as { displayName?: string }).displayName);
    } else if (!platformOnly.has(name)) expect(value, name).toBe(upstream[name]);
  }
});
