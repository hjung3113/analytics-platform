import { type HostLinkProps, HostSeamProvider } from '@/lib/host/host-seam';
import { render, screen } from '@testing-library/react';
import { type ReactNode, createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type {
  FindingExecutionSectionController,
  RequestedTaskRequestSummary,
} from './FindingExecutionSection';
import {
  FindingExecutionRequestActions,
  FindingExecutionRequestRow,
} from './FindingExecutionSection';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    search,
    children,
    ...rest
  }: {
    to: string;
    search?: Record<string, string>;
    children: ReactNode;
  }) => (
    <a href={`${to}${search ? `?${new URLSearchParams(search).toString()}` : ''}`} {...rest}>
      {children}
    </a>
  ),
}));

const REQUEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TASK_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REQUEST = {
  id: REQUEST_ID,
  display_id: 'TR-901',
  status: 'pending_review',
} as unknown as RequestedTaskRequestSummary;

function makeController(
  overrides: Partial<FindingExecutionSectionController> = {},
): FindingExecutionSectionController {
  return {
    requestTaskOpen: false,
    setRequestTaskOpen: vi.fn(),
    taskRequestRegionRef: createRef<HTMLDivElement>(),
    requestedTaskRequests: [],
    requestedTaskRequestsState: 'loaded',
    retryInProgress: false,
    pendingTaskRequest: undefined,
    handleRetryRequestedTaskRequests: vi.fn(),
    ...overrides,
  };
}

function makeSeam(canLink: boolean) {
  return {
    canLink: vi.fn(() => canLink),
    Link: ({ to, children, ...rest }: HostLinkProps) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
  };
}

describe('FindingExecutionSection host links', () => {
  it.each([
    {
      label: 'Task 열기',
      linkedTaskId: TASK_ID,
      pendingTaskRequest: undefined,
      canLink: true,
      href: `/tasks?view=backlog&param=${TASK_ID}`,
    },
    {
      label: 'Task Request 보기',
      linkedTaskId: null,
      pendingTaskRequest: REQUEST,
      canLink: true,
      href: `/tasks?view=requests&param=${REQUEST_ID}`,
    },
    {
      label: null,
      linkedTaskId: TASK_ID,
      pendingTaskRequest: undefined,
      canLink: false,
      href: `/tasks?view=backlog&param=${TASK_ID}`,
    },
    {
      label: null,
      linkedTaskId: null,
      pendingTaskRequest: REQUEST,
      canLink: false,
      href: `/tasks?view=requests&param=${REQUEST_ID}`,
    },
  ] as const)('routes $label when canLink is $canLink', (testCase) => {
    const seam = makeSeam(testCase.canLink);
    const controller = makeController({ pendingTaskRequest: testCase.pendingTaskRequest });
    render(
      <HostSeamProvider value={seam}>
        <FindingExecutionRequestActions
          controller={controller}
          canManage
          linkedTaskId={testCase.linkedTaskId}
        />
      </HostSeamProvider>,
    );

    if (testCase.label) {
      expect(screen.getByRole('link', { name: testCase.label }).getAttribute('href')).toBe(
        testCase.href,
      );
    } else {
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Task 요청' })).not.toBeInTheDocument();
    }
    expect(seam.canLink).toHaveBeenCalledWith(testCase.href);
  });

  it.each([true, false])('renders Task Request chip as a link when canLink is %s', (canLink) => {
    const href = `/tasks?view=requests&param=${REQUEST_ID}`;
    const seam = makeSeam(canLink);
    render(
      <HostSeamProvider value={seam}>
        <FindingExecutionRequestRow
          controller={makeController({
            requestedTaskRequests: [REQUEST],
          })}
        />
      </HostSeamProvider>,
    );

    if (canLink) {
      expect(screen.getByRole('link', { name: /TR-901/ }).getAttribute('href')).toBe(href);
    } else {
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByText('TR-901').tagName).toBe('SPAN');
    }
    expect(seam.canLink).toHaveBeenCalledWith(href);
  });
});
