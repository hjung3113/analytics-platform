import { HostLink } from '@/lib/host/host-seam';
import { searchHref } from '@/lib/host/search';
import type { TaskDto } from '@fops/shared';

export function TaskRequestLinkedTask({
  task,
}: { task: Pick<TaskDto, 'id' | 'title' | 'display_id'> }) {
  return (
    <HostLink
      to={searchHref('/tasks', { view: 'backlog', param: task.id })}
      className="inline-flex items-center gap-2 rounded-sm border border-border-subtle bg-surface-card px-2.5 py-1.5 text-sm text-accent-primary hover:bg-surface-row-hover"
    >
      <span>{task.title}</span>
      <span className="shrink-0 whitespace-nowrap font-mono text-xs text-text-muted">
        {task.display_id}
      </span>
    </HostLink>
  );
}
