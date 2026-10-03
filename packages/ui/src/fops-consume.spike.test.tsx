// SPIKE (#52, throwaway): can the platform render @fops/ui primitives under its own React/jsdom/vitest?
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Button as FopsButton,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DatePicker,
  DetailPanelHeader,
  EmptyState,
  ListShell,
  ListToolbar,
  PageShell,
  ReporterStatusBadge,
  SeverityBadge,
  cn as fopsCn,
} from '@fops/ui';
import { cn } from './utils/cn';

afterEach(cleanup);

describe('@fops/ui consumed from the platform workspace', () => {
  it('renders primitives, panel, toolbar and layout shells', () => {
    render(
      <PageShell header={{ title: '페이지' }}>
        <ListShell
          toolbar={{ title: '목록' }}
          list={
            <Card>
              <CardHeader><CardTitle>카드</CardTitle></CardHeader>
              <CardContent>
                <FopsButton>저장</FopsButton>
                <SeverityBadge severity="high" />
                <ReporterStatusBadge status="received" />
                <DatePicker value="2026-10-04" onChange={() => {}} aria-label="날짜" />
                <EmptyState title="비어 있음" />
              </CardContent>
            </Card>
          }
        />
        <ListToolbar title="툴바" />
        <DetailPanelHeader kind="voc" id="VOC-1" onClose={() => {}} />
      </PageShell>,
    );
    expect(screen.getByRole('button', { name: '저장' })).toBeTruthy();
    expect(screen.getByText('높음')).toBeTruthy();
    expect(screen.getByText('접수됨')).toBeTruthy();
    expect(screen.getByText('비어 있음')).toBeTruthy();
    expect(screen.getByText('VOC-1')).toBeTruthy();
  });

  it('shares one tailwind-merge line with @ap/ui', () => {
    expect(fopsCn('p-2', 'p-4')).toBe('p-4');
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});
