import { render, screen } from '@testing-library/react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../dialog.js';

const scrimCases = [
  {
    name: 'default',
    props: {},
    overlayClass: 'bg-black/80',
    absentOverlayClass: 'bg-accent-primary/16',
    contentClass: 'z-50',
    absentContentClass: 'z-60',
  },
  {
    name: 'modal',
    props: { scrim: 'modal' as const },
    overlayClass: 'bg-black/80',
    absentOverlayClass: 'bg-accent-primary/16',
    contentClass: 'z-50',
    absentContentClass: 'z-60',
  },
  {
    name: 'palette',
    props: { scrim: 'palette' as const },
    overlayClass: 'bg-accent-primary/16',
    absentOverlayClass: 'bg-black/80',
    contentClass: 'z-60',
    absentContentClass: 'z-50',
  },
] as const;

describe('DialogContent scrim (#310)', () => {
  it.each(scrimCases)('renders the $name overlay and content layers', ({ props, overlayClass, absentOverlayClass, contentClass, absentContentClass }) => {
    render(
      <Dialog open>
        <DialogContent {...props}>
          <DialogTitle>Dialog title</DialogTitle>
          <DialogDescription>Dialog description</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    const overlay = document.querySelector<HTMLElement>('[data-state="open"][class*="inset-0"]');
    const content = screen.getByRole('dialog');

    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveClass(overlayClass);
    expect(overlay).not.toHaveClass(absentOverlayClass);
    expect(content).toHaveClass(contentClass);
    expect(content).not.toHaveClass(absentContentClass);
    expect(content).not.toHaveAttribute('scrim');
  });
});
