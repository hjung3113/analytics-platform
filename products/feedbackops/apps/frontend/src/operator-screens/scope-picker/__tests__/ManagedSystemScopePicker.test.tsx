import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ManagedSystemScopePicker } from '../ManagedSystemScopePicker';

const SYSTEMS = [
  { id: 'a', name: 'Alpha', granted: true },
  { id: 'b', name: 'Beta', granted: true },
  { id: 'c', name: 'Cygnus', granted: false },
  { id: 'd', name: 'Delta', granted: false },
];

const PERSONAS = [
  { name: 'non-admin with 2 of 4 granted', isAdmin: false, workspaceWideScope: false },
  { name: 'admin', isAdmin: true, workspaceWideScope: true },
] as const;

describe('ManagedSystemScopePicker', () => {
  it.each(PERSONAS)(
    'shows the original scope semantics for $name',
    ({ isAdmin, workspaceWideScope }) => {
      render(
        <ManagedSystemScopePicker
          managedSystems={SYSTEMS}
          onChange={vi.fn()}
          isAdmin={isAdmin}
          workspaceWideScope={workspaceWideScope}
        />,
      );
      const trigger = screen.getByTestId('scope-selector');
      expect(screen.getByTestId('scope-name')).toHaveTextContent('전체 Managed System');
      if (workspaceWideScope) {
        expect(trigger).toHaveAccessibleName('전체 Managed System');
        expect(trigger).not.toHaveTextContent('내 담당:');
      } else {
        expect(trigger).toHaveAccessibleName('전체 Managed System, 내 담당 범위');
        expect(trigger).toHaveTextContent('내 담당: Alpha · Beta');
      }
      fireEvent.click(trigger);
      expect(screen.getByTestId('scope-option-all')).toHaveTextContent(
        workspaceWideScope ? '워크스페이스 전체' : '내 담당 2 / 4',
      );
      for (const [id, granted] of [
        ['a', true],
        ['b', true],
        ['c', false],
        ['d', false],
      ] as const) {
        const option = screen.getByTestId(`scope-option-${id}`);
        if (granted) expect(option.querySelector('[aria-label="범위 밖"]')).toBeNull();
        else expect(option.querySelector('[aria-label="범위 밖"]')).not.toBeNull();
      }
      if (isAdmin) expect(screen.queryByTestId('scope-name-visibility-note')).toBeNull();
      else expect(screen.getByTestId('scope-name-visibility-note')).toBeInTheDocument();
    },
  );

  it('is disabled with the original title when the screen is not scoped', () => {
    render(
      <ManagedSystemScopePicker
        managedSystems={SYSTEMS}
        onChange={vi.fn()}
        isAdmin={false}
        workspaceWideScope={false}
        disabled
      />,
    );
    const trigger = screen.getByTestId('scope-selector');
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute('title', '이 화면은 Managed System 범위를 지원하지 않습니다');
    expect(screen.getByTestId('scope-name')).toHaveTextContent('워크스페이스 전체');
  });

  it('renders the visible label only when given, and nothing when collapsed', () => {
    const { rerender } = render(
      <ManagedSystemScopePicker
        managedSystems={SYSTEMS}
        onChange={vi.fn()}
        isAdmin
        workspaceWideScope
      />,
    );
    expect(screen.queryByTestId('scope-label')).toBeNull();
    rerender(
      <ManagedSystemScopePicker
        managedSystems={SYSTEMS}
        onChange={vi.fn()}
        isAdmin
        workspaceWideScope
        label="목록 범위"
      />,
    );
    expect(screen.getByTestId('scope-label')).toHaveTextContent('목록 범위');
    rerender(
      <ManagedSystemScopePicker
        managedSystems={SYSTEMS}
        onChange={vi.fn()}
        isAdmin
        workspaceWideScope
        collapsed
      />,
    );
    expect(screen.queryByTestId('scope-selector')).toBeNull();
  });

  it('reports the id or undefined and keeps no value of its own', () => {
    const onChange = vi.fn();
    const props = { managedSystems: SYSTEMS, onChange, isAdmin: false, workspaceWideScope: false };
    const { rerender } = render(<ManagedSystemScopePicker {...props} />);
    fireEvent.click(screen.getByTestId('scope-selector'));
    fireEvent.click(screen.getByTestId('scope-option-b'));
    expect(onChange).toHaveBeenLastCalledWith('b');
    expect(screen.getByTestId('scope-name')).toHaveTextContent('전체 Managed System');
    rerender(<ManagedSystemScopePicker {...props} value="c" />);
    expect(screen.getByTestId('scope-name')).toHaveTextContent('Cygnus');
    expect(screen.getByTestId('scope-out-of-scope-badge')).toHaveTextContent('범위 밖');
    fireEvent.click(screen.getByTestId('scope-selector'));
    fireEvent.click(screen.getByTestId('scope-option-all'));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    expect(screen.getByTestId('scope-name')).toHaveTextContent('Cygnus');
  });
});
