import type { Meta, StoryObj } from '@storybook/react-vite';
import { RichContentRenderer } from '@ap/ui';
import { PEOPLE, RICH_DOC } from '../equipment';
import { guidedPage } from '../guidance';

/** 편집기 없이 같은 Tiptap JSON을 읽기 전용으로 그린다. 그리기 전에 `surface` 허용 목록으로 한 번 더 거른다. */
const meta = {
  title: '표시/RichContentRenderer',
  component: RichContentRenderer,
  args: { doc: RICH_DOC, mode: 'internal', surface: 'internal-comment', resolveMentionLabel: (id: string): string | null | undefined => PEOPLE[id] },
  argTypes: { doc: { control: false } },
  decorators: [Story => <div className="w-[560px]"><Story /></div>],
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/rich-content/RichContentRenderer.tsx',
      page: guidedPage([['docs/contract/components.md', '`RichContentRenderer`는 편집 인스턴스와 편집 플러그인 없이'], ['docs/contract/components.md', '멘션 JSON은 `actor_id`만 가지며']]),
    },
  },
} satisfies Meta<typeof RichContentRenderer>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 내부 메모 읽기. */
export const Internal: Story = {};

/** 작은 글자(`size="sm"`). */
export const Small: Story = { args: { size: 'sm' } };

/** 멘션 이름을 못 구하면 id 대신 `@멘션`을 보인다. */
export const UnresolvedMention: Story = { args: { resolveMentionLabel: () => null } };
