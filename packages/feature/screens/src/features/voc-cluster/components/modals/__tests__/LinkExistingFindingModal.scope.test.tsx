import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { LinkExistingFindingModal } from '../LinkExistingFindingModal';
const list = vi.hoisted(() => vi.fn(() => ({ data: { items: [] as { id: string; display_id: string; title: string }[] } })));
vi.mock('../../../../findings/hooks/useFindingsList', () => ({ useFindingsList: list }));
vi.mock('../../../hooks/useLinkExistingFindingToVocCluster', () => ({ useLinkExistingFindingToVocCluster: () => ({ reset: vi.fn() }) }));
it('loads only Findings in the cluster managed system', () => {
  render(<LinkExistingFindingModal open clusterId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" managedSystemId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" onClose={vi.fn()} />);
  expect(list).toHaveBeenCalledWith('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', undefined, true);
});
it('does not fall back to an unscoped list without a cluster system', () => {
  render(<LinkExistingFindingModal open clusterId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" onClose={vi.fn()} />);
  expect(list).toHaveBeenLastCalledWith(undefined, undefined, false);
});

it('does not show cached unscoped Findings when the cluster system is absent', async () => {
  list.mockReturnValueOnce({ data: { items: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', display_id: 'FIN-SYNTHETIC', title: 'Unscoped cached Finding' }] } });
  render(<LinkExistingFindingModal open clusterId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('combobox', { name: 'Finding' }));
  expect(screen.queryByRole('option', { name: /Unscoped cached Finding/ })).not.toBeInTheDocument();
});
