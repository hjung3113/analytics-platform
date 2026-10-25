import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  describe('listbox', () => {
    const base = { managedSystems: SYSTEMS, isAdmin: false, workspaceWideScope: false };
    const open = () => fireEvent.click(screen.getByTestId('scope-selector'));
    const focused = (id: string) => expect(screen.getByTestId(`scope-option-${id}`)).toHaveFocus();

    it.each([
      [undefined, 'all'],
      ['b', 'b'],
    ])('owns options, marks only the value %s selected and focuses it', (value, id) => {
      render(
        <ManagedSystemScopePicker
          {...base}
          {...(value === undefined ? {} : { value })}
          onChange={vi.fn()}
        />,
      );
      open();
      const listbox = screen.getByRole('listbox');
      const options = within(listbox).getAllByRole('option');
      expect(options).toHaveLength(SYSTEMS.length + 1);
      expect(options.filter((o) => o.getAttribute('aria-selected') === 'true')).toEqual([
        screen.getByTestId(`scope-option-${id}`),
      ]);
      focused(id);
      expect(within(listbox).queryByTestId('scope-name-visibility-note')).toBeNull();
      expect(screen.getByTestId('scope-name-visibility-note')).toBeInTheDocument();
    });

    it('moves focus with arrows, Home and End without wrapping', async () => {
      const user = userEvent.setup();
      render(<ManagedSystemScopePicker {...base} onChange={vi.fn()} />);
      open();
      await user.keyboard('{ArrowUp}');
      focused('all');
      await user.keyboard('{ArrowDown}{ArrowDown}');
      focused('b');
      await user.keyboard('{End}');
      focused('d');
      await user.keyboard('{ArrowDown}');
      focused('d');
      await user.keyboard('{Home}');
      focused('all');
    });

    it.each(['{Enter}', ' '])(
      'selects the focused option with %j and returns focus',
      async (key) => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<ManagedSystemScopePicker {...base} onChange={onChange} />);
        open();
        await user.keyboard(`{ArrowDown}${key}`);
        expect(onChange).toHaveBeenLastCalledWith('a');
        expect(screen.queryByRole('listbox')).toBeNull();
        expect(screen.getByTestId('scope-selector')).toHaveFocus();
      },
    );

    it('returns focus to the trigger after a mouse selection', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<ManagedSystemScopePicker {...base} onChange={onChange} />);
      await user.click(screen.getByTestId('scope-selector'));
      await user.click(screen.getByTestId('scope-option-c'));
      expect(onChange).toHaveBeenLastCalledWith('c');
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(screen.getByTestId('scope-selector')).toHaveFocus();
    });

    it.each(['option', 'trigger'])(
      'closes on Esc from the %s and focuses the trigger',
      async (from) => {
        const user = userEvent.setup();
        render(<ManagedSystemScopePicker {...base} onChange={vi.fn()} />);
        open();
        if (from === 'trigger') screen.getByTestId('scope-selector').focus();
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('listbox')).toBeNull();
        expect(screen.getByTestId('scope-selector')).toHaveFocus();
      },
    );

    it('closes on Tab without pulling focus back to the trigger', async () => {
      const user = userEvent.setup();
      render(<ManagedSystemScopePicker {...base} onChange={vi.fn()} />);
      open();
      await user.tab();
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(screen.getByTestId('scope-selector')).not.toHaveFocus();
    });

    it.each(PERSONAS)(
      'names the 전체 option without its helper ($name)',
      ({ isAdmin, workspaceWideScope }) => {
        render(
          <ManagedSystemScopePicker
            {...base}
            isAdmin={isAdmin}
            workspaceWideScope={workspaceWideScope}
            onChange={vi.fn()}
          />,
        );
        open();
        const all = screen.getByTestId('scope-option-all');
        expect(all).toHaveAccessibleName('전체 Managed System');
        expect(all).toHaveAccessibleDescription(
          workspaceWideScope ? '워크스페이스 전체' : '내 담당 2 / 4',
        );
      },
    );
  });

  describe('trigger name with a label', () => {
    it.each([
      ['union', { workspaceWideScope: false }, '목록 범위, 전체 Managed System, 내 담당 범위'],
      ['out of scope', { value: 'c', workspaceWideScope: false }, '목록 범위, Cygnus, 범위 밖'],
      ['disabled', { workspaceWideScope: true, disabled: true }, '목록 범위, 워크스페이스 전체'],
    ])('%s', (_name, props, name) => {
      render(
        <ManagedSystemScopePicker
          managedSystems={SYSTEMS}
          isAdmin={false}
          onChange={vi.fn()}
          label="목록 범위"
          {...props}
        />,
      );
      expect(screen.getByTestId('scope-selector')).toHaveAccessibleName(name);
    });
  });

  describe('unknown Managed System', () => {
    const props = { isAdmin: false, workspaceWideScope: false, value: 'zz', onChange: vi.fn() };

    it('shows the unknown label, no badge, no selected option and focuses 전체', () => {
      render(<ManagedSystemScopePicker {...props} managedSystems={SYSTEMS} />);
      expect(screen.getByTestId('scope-name')).toHaveTextContent('알 수 없는 Managed System');
      expect(screen.queryByTestId('scope-out-of-scope-badge')).toBeNull();
      expect(screen.getByTestId('scope-selector')).not.toHaveTextContent('내 담당:');
      fireEvent.click(screen.getByTestId('scope-selector'));
      expect(
        screen.getAllByRole('option').filter((o) => o.getAttribute('aria-selected') === 'true'),
      ).toHaveLength(0);
      expect(screen.getByTestId('scope-option-all')).toHaveFocus();
    });

    it('keeps 전체 while the list is empty', () => {
      render(<ManagedSystemScopePicker {...props} managedSystems={[]} />);
      expect(screen.getByTestId('scope-name')).toHaveTextContent('전체 Managed System');
    });
  });
});
