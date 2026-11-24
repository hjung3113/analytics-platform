import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataTrustIndicator } from '@ap/components';
import { TRUST } from '../equipment';
import { guidedPage } from '../guidance';
import { withPlatform } from '../platform';

/** 응답의 Trust(갱신 시각·커버리지·확정/잠정)와 평가 항목을 한 줄로 보이고, 누르면 Popover로 자세히 보인다. `trust`가 null이면 그리지 않는다. */
const meta = {
  title: '표시/DataTrustIndicator',
  component: DataTrustIndicator,
  args: { trust: TRUST, assessments: [] },
  decorators: [withPlatform],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/state/DataTrustIndicator.tsx',
    page: guidedPage([], [['docs/contract/components.md', '메뉴는 Trust를 지어내 넘기지 않는다']]),
  } },
} satisfies Meta<typeof DataTrustIndicator>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 확정 데이터, 커버리지 97%. */
export const Confirmed: Story = {};
/** 잠정(`provisional`)이고 수집 평가가 확인되지 않음. */
export const Provisional: Story = { args: { trust: { ...TRUST, provisional: true, coverage: 0.82 }, assessments: [{ kind: 'collection', state: 'unknown', reason: 'source_unavailable' }] } };
/** `compact`: 좁은 머리용 짧은 줄. */
export const Compact: Story = { args: { compact: true } };
/** `showWithoutTrust`: Trust 없이 평가 항목만 있는 응답. */
export const WithoutTrust: Story = { args: { trust: null, showWithoutTrust: true, assessments: [{ kind: 'processing_delay', state: 'confirmed', detail: '처리 지연 40분' }] } };
