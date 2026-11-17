import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { RadioGroup, RadioGroupItem } from '../radio-group.js';
import { ToggleGroup, ToggleGroupItem } from '../toggle-group.js';

const insetRadius = 'rounded-inset-md';

it('insets the segmented radio cell radius by the track padding', () => {
  render(<RadioGroup appearance="segmented" defaultValue="one"><RadioGroupItem appearance="segmented" value="one">One</RadioGroupItem></RadioGroup>);
  expect(screen.getByRole('radio')).toHaveClass(insetRadius);
});

it('insets every filter toggle cell, including cells without selected-filter appearance', () => {
  render(<ToggleGroup type="single" appearance="filter" defaultValue="one">
    <ToggleGroupItem value="one" appearance="selected-filter">One</ToggleGroupItem>
    <ToggleGroupItem value="two">Two</ToggleGroupItem>
  </ToggleGroup>);
  expect(screen.getByRole('radiogroup')).toHaveClass('bg-surface-card', 'on-canvas-band:bg-transparent');
  for (const item of screen.getAllByRole('radio')) expect(item).toHaveClass(insetRadius);
});

it('preserves the default toggle appearance', () => {
  render(<ToggleGroup type="single"><ToggleGroupItem value="one">One</ToggleGroupItem></ToggleGroup>);
  expect(screen.getByRole('radio')).not.toHaveClass(insetRadius);
  expect(screen.getByRole('radiogroup')).not.toHaveClass('on-canvas-band:bg-transparent');
});
