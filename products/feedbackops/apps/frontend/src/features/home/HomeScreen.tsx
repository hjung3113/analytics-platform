import { Button, PageShell, Tabs, TabsContent, TabsList, TabsTrigger } from '@fops/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw } from 'lucide-react';
import type * as React from 'react';

import { fetchDashboardSummary } from '@/lib/api/dashboard';
import { useMe } from '@/lib/auth/useMe';
import { HOME_COPY, HOME_INBOX_COPY } from '@/lib/copy/home';
import {
  formatUnreadBadge,
  useUnreadNotificationCount,
} from '@/lib/cross-system/useUnreadNotificationCount';
import { HostSeamProvider } from '@/lib/host/host-seam';
import { tanstackHost } from '@/lib/host/tanstack-host';
import { InternalLink } from '@/lib/router/InternalLink';
import { DashboardBody, HOME_COVERAGE_HREF, refreshDashboard } from './DashboardScreen';
import { InboxPanel } from './InboxPanel';
import { standaloneDashboardHost } from './standaloneHost';

export { HOME_COVERAGE_HREF };

export type HomeTab = 'dashboard' | 'inbox';

export function HomeScreen({
  managedSystemId,
  activeTab = 'dashboard',
  onTabChange,
  recovery,
}: {
  managedSystemId?: string;
  activeTab?: HomeTab;
  onTabChange?: (tab: HomeTab) => void;
  recovery?: { queue: React.ReactNode; detailPanel: React.ReactNode };
}): React.ReactElement {
  const me = useMe();
  const queryClient = useQueryClient();
  const unreadNotifications = useUnreadNotificationCount();
  const unreadCount = unreadNotifications.data;
  const unreadBadge =
    unreadCount !== undefined && unreadCount > 0 ? formatUnreadBadge(unreadCount) : undefined;
  const summary = useQuery({
    queryKey: ['dashboard-summary', managedSystemId] as const,
    queryFn: ({ signal }) =>
      fetchDashboardSummary({
        signal,
        ...(managedSystemId !== undefined ? { managedSystemId } : {}),
      }),
    retry: false,
  });
  const actorName = me.data?.actor.display_name ?? '지원';
  const refresh = (): void => refreshDashboard(queryClient, managedSystemId);

  return (
    // #888: Tabs renders a div between <main> and PageShell. It needs the flex
    // sizing a shell gets, or PageShell grows to its content and the document scrolls.
    <Tabs
      className="flex min-h-0 flex-1 flex-col"
      value={activeTab}
      onValueChange={(value) => {
        if (value === 'dashboard' || value === 'inbox') onTabChange?.(value);
      }}
    >
      <PageShell
        contentClassName="max-w-none"
        detailPanel={activeTab === 'dashboard' ? recovery?.detailPanel : undefined}
      >
        <section data-testid="home-screen">
          <header className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-text-primary">
                {HOME_COPY.title(actorName)}
              </h1>
              {activeTab === 'dashboard' && (
                <p className="mt-3 text-sm text-text-muted">
                  {HOME_COPY.subtitle(summary.data?.action_queues, summary.data?.coverage)}
                </p>
              )}
            </div>
            {activeTab === 'dashboard' && (
              <div className="flex shrink-0 gap-2">
                <Button variant="subtle" size="sm" onClick={refresh} data-testid="home-refresh">
                  <RefreshCw className="h-3.5 w-3.5" />
                  {HOME_COPY.refresh}
                </Button>
                <Button asChild variant="primary" size="sm">
                  <InternalLink href="/vocs?action=create">
                    <Plus className="h-3.5 w-3.5" />
                    {HOME_COPY.newVoc}
                  </InternalLink>
                </Button>
              </div>
            )}
          </header>
          <TabsList aria-label={HOME_INBOX_COPY.tabListLabel} className="mb-4">
            <TabsTrigger value="dashboard">{HOME_INBOX_COPY.tabs.dashboard}</TabsTrigger>
            {/* oxlint-disable-next-line shadcn/no-restyle -- the Inbox tab keeps an 8px gap before its unread-count badge */}
            <TabsTrigger value="inbox" className="gap-2">
              {HOME_INBOX_COPY.tabs.inbox}
              {unreadBadge !== undefined && (
                <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-accent-primary px-1 text-caption font-semibold leading-4 text-white">
                  {unreadBadge}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard" className="mt-0">
            <HostSeamProvider value={standaloneDashboardHost}>
              <DashboardBody
                actorId={me.data?.actor.id}
                {...(managedSystemId !== undefined ? { managedSystemId } : {})}
                recoveryQueue={recovery?.queue}
              />
            </HostSeamProvider>
          </TabsContent>
          <TabsContent value="inbox" className="mt-0">
            <HostSeamProvider value={tanstackHost}>
              <InboxPanel />
            </HostSeamProvider>
          </TabsContent>
        </section>
      </PageShell>
    </Tabs>
  );
}
