import { cleanup, render, screen } from '@testing-library/react';
import { I18nProvider } from '@ap/kernel';
import { afterEach, expect, it } from 'vitest';
import { ApprovalReviewPanel } from '../ApprovalReviewPanel';

afterEach(cleanup);
it.each([undefined, 0])('shows review metadata and only a recorded metric version (%s)', metricVersion => {
  render(<I18nProvider><ApprovalReviewPanel requester="신청자 A" requestedAt={0} audience={{ kind: 'private' }} changes={['조회 조건 변경']}
    {...(metricVersion === undefined ? {} : { metricVersion, approverSpaceName: '분석' })} /></I18nProvider>);
  expect(screen.getByText('신청자 A')).toBeVisible();
  expect(screen.getByText(/나만/)).toBeVisible();
  expect(screen.getByText('조회 조건 변경')).toBeVisible();
  expect(screen.getByText(metricVersion === undefined ? '시스템 승인자' : '분석 시스템 승인자')).toBeVisible();
  expect(screen.queryByRole('heading', { name: '쓰인 지표 버전' }) !== null).toBe(metricVersion !== undefined);
  expect(screen.queryByRole('button', { name: '승인본 화면 보기' })).toBeNull();
});
