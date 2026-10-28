import {
  ManagedSystemScopePicker,
  type ManagedSystemScopePickerProps,
} from '@/operator-screens/scope-picker/ManagedSystemScopePicker';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
function PickerHost({
  isAdmin = true,
  selectedManagedSystemId,
  ...props
}: Partial<ManagedSystemScopePickerProps> & { selectedManagedSystemId?: string }) {
  return (
    <ManagedSystemScopePicker
      managedSystems={[]}
      onChange={() => undefined}
      isAdmin={isAdmin}
      workspaceWideScope={isAdmin}
      {...props}
      {...(selectedManagedSystemId ? { value: selectedManagedSystemId } : {})}
    />
  );
}
it('AC-E5b keeps every out-of-grant Managed System name visible in the scope list', () => {
  render(
    <PickerHost
      isAdmin={false}
      managedSystems={[
        { id: 'granted', name: 'Identity', granted: true },
        { id: 'outside', name: 'Finance', granted: false },
      ]}
    />,
  );

  fireEvent.click(screen.getByTestId('scope-selector'));
  expect(screen.getByTestId('scope-option-outside')).toBeVisible();
  expect(screen.getByLabelText('범위 밖')).toBeVisible();
});
it('AC-E5a shows granted and total counts without claiming zero systems', () => {
  render(
    <PickerHost
      isAdmin={false}
      managedSystems={[
        { id: 'identity', name: 'Identity Platform', granted: false },
        { id: 'finance', name: 'Finance Analytics', granted: false },
        { id: 'sales', name: 'Sales Workspace', granted: false },
      ]}
    />,
  );

  fireEvent.click(screen.getByTestId('scope-selector'));
  const allScope = screen.getByTestId('scope-option-all');
  expect(allScope).toHaveTextContent('내 담당 0 / 3');
  expect(allScope).not.toHaveTextContent('0 systems');
  // The note lives outside the option buttons so it never becomes part of an
  // option's accessible name.
  expect(screen.getByTestId('scope-name-visibility-note')).toHaveTextContent(
    '이름은 워크스페이스 전체에 공개되며, 접근하려면 권한을 요청하세요.',
  );
  expect(allScope).not.toHaveTextContent('이름은 워크스페이스 전체에 공개되며');
  expect(screen.getByTestId('scope-option-identity')).toHaveTextContent('Identity Platform');
  expect(screen.getByTestId('scope-option-finance')).toHaveTextContent('Finance Analytics');
  expect(screen.getByTestId('scope-option-sales')).toHaveTextContent('Sales Workspace');
});
it('labels non-admin all scope with the assigned systems on an unobstructed second line', () => {
  render(
    <PickerHost
      isAdmin={false}
      managedSystems={[
        { id: 'tableau', name: 'Tableau', granted: true },
        { id: 'powerbi', name: 'Power BI', granted: true },
      ]}
    />,
  );
  const selector = screen.getByTestId('scope-selector');
  const scopeName = screen.getByTestId('scope-name');
  expect(scopeName).toHaveTextContent('전체 Managed System');
  expect(selector).toHaveTextContent('내 담당: Tableau · Power BI');
  expect(selector).toHaveAccessibleName('전체 Managed System, 내 담당 범위');
  expect(screen.queryByTestId('scope-union-badge')).not.toBeInTheDocument();
  expect(Array.from(scopeName.parentElement?.children ?? [])).toHaveLength(1);

  fireEvent.click(selector);
  expect(screen.getByTestId('scope-option-all')).toHaveTextContent('전체 Managed System');
});
it('labels Admin all scope without a second line or qualifier', () => {
  render(
    <PickerHost isAdmin={true} managedSystems={[{ id: 'one', name: 'Identity', granted: true }]} />,
  );
  expect(screen.getByTestId('scope-name')).toHaveTextContent('전체 Managed System');
  expect(screen.getByTestId('scope-selector')).not.toHaveTextContent('내 담당:');
  expect(screen.getByTestId('scope-selector')).toHaveAccessibleName('전체 Managed System');
  expect(screen.queryByTestId('scope-union-badge')).not.toBeInTheDocument();

  fireEvent.click(screen.getByTestId('scope-selector'));
  expect(screen.getByTestId('scope-option-all')).toHaveTextContent('워크스페이스 전체');
});
it('keeps scope qualifiers visible and exposes a long system name accessibly', () => {
  const name = 'Finance Analytics and Global Revenue Operations';
  render(
    <PickerHost
      isAdmin={false}
      managedSystems={[{ id: 'outside', name, granted: false }]}
      selectedManagedSystemId="outside"
    />,
  );

  const selector = screen.getByTestId('scope-selector');
  expect(selector).toHaveAccessibleName(`${name}, 범위 밖`);
  expect(selector).toHaveAttribute('title', name);
  expect(screen.getByTestId('scope-name')).toHaveTextContent(name);
  expect(screen.getByTestId('scope-name')).toHaveClass('truncate');
  expect(screen.getByTestId('scope-out-of-scope-badge')).toHaveTextContent('범위 밖');
  expect(screen.getByTestId('scope-out-of-scope-badge')).toBeVisible();
});
