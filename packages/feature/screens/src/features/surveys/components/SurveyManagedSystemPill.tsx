export function SurveyManagedSystemPill({
  name,
  resolved = false,
}: {
  name?: string | undefined;
  resolved?: boolean | undefined;
}) {
  return (
    <span
      className={`inline-flex max-w-40 min-w-0 shrink-0 items-center rounded border border-border-default bg-surface-card px-1.5 py-0.5 text-xs ${resolved ? 'text-text-secondary' : 'text-text-muted'}`}
    >
      <span className="truncate">{resolved ? (name ?? '알 수 없는 시스템') : '—'}</span>
    </span>
  );
}
