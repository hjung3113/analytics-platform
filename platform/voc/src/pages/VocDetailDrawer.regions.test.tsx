import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { VocDetailDrawer } from './VocDetailDrawer';

const state = vi.hoisted(() => ({ full: true, body: 'Loading state', close: vi.fn() }));
vi.mock('@ap/feature-screens/operator-screens/voc-detail', () => ({
  useVocDetailParts: () => ({
    title: 'VOC detail',
    body: <p>{state.body}</p>,
    requestClose: state.close,
    ...(state.full
      ? {
          renderRegions: (renderLayout: (layout: {
            regions: { body: ReactNode; properties: ReactNode; activity: ReactNode };
            footer: ReactNode;
          }) => ReactNode) =>
            renderLayout({
              regions: {
                body: <p>Description and author</p>,
                properties: <p>Assignee and severity</p>,
                activity: (
                  <>
                    <p>Conversation</p>
                    <textarea aria-label="Composer" />
                  </>
                ),
              },
              footer: <button>Next action</button>,
            }),
        }
      : {}),
  }),
}));

function Host() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} />;
}

function mount() {
  return render(
    <I18nProvider>
      <DetailPanelSlotProvider>
        <Host />
        <VocDetailDrawer vocId="voc" onClose={() => {}} />
      </DetailPanelSlotProvider>
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  state.full = true;
  state.body = 'Loading state';
});

it('declares VOC regions and keeps the composer in activity and the action footer outside scrolling', () => {
  mount();

  expect(
    screen.getByText('Description and author')
      .closest('[data-detail-region]')?.getAttribute('data-detail-region'),
  ).toBe('body');
  expect(
    screen.getByText('Assignee and severity')
      .closest('[data-detail-region]')?.getAttribute('data-detail-region'),
  ).toBe('properties');
  expect(
    screen.getByLabelText('Composer')
      .closest('[data-detail-region]')?.getAttribute('data-detail-region'),
  ).toBe('activity');
  expect(
    screen.getByRole('button', { name: 'Next action' }).closest('[data-detail-main-scroll]'),
  ).toBeNull();
});

it.each(['Loading state', 'Failed state', 'Permission-limited state'])(
  'keeps the %s body wrapper and full width without an empty property track',
  (body) => {
    state.full = false;
    state.body = body;
    mount();

    const content = screen.getByText(body);
    expect(content.closest('[data-detail-region]')?.getAttribute('data-detail-region')).toBe('body');
    expect(content.closest('.fo-detail-body')?.className).toBe(
      'fo-detail-body flex min-h-0 flex-1 flex-col',
    );
    expect(document.querySelector('[data-detail-region="properties"]')).toBeNull();
  },
);
