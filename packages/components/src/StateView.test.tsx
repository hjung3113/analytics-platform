import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, type QueryState } from '@ap/kernel';
import type { ApiResponse } from '@ap/contracts';
import { QueryView } from './StateView';

afterEach(cleanup);

const errorResponse = (): ApiResponse<unknown> =>
  ({ outcome: 'error', message: 'boom', data: null, assessments: [], trust: null, correlationId: 'c1' });
const query = (): QueryState<unknown> => ({ response: errorResponse(), refetch: vi.fn(), status: 'done' });

/** Outside an OutcomeScope the widget never groups (UXA-3): the compact state must still name its widget. */
function View({ hide = false }: { hide?: boolean }) {
  return <I18nProvider><QueryView query={query()} widgetName="지표 쌍 검증" compact hideWidgetName={hide}>{() => null}</QueryView></I18nProvider>;
}

describe('non-grouped compact state names its widget (UXA-3)', () => {
  it('draws the widget name line above a compact error StateMessage', () => {
    render(<View />);
    expect(screen.getByRole('group', { name: '지표 쌍 검증' })).toBeInTheDocument();
    expect(screen.getByText('지표 쌍 검증')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('데이터를 불러오지 못했습니다');
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('hideWidgetName keeps the name out', () => {
    render(<View hide />);
    expect(screen.queryByText('지표 쌍 검증')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
