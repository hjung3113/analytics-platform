import { cn } from '@ap/ui';

export type SaveBlock = { summary: string; reasons: string };

export function SaveBlockNotice({ id, block, className }: { id: string; block: SaveBlock; className?: string }) {
  const shortened = block.summary !== block.reasons;
  return <p id={shortened ? undefined : id} className={cn('break-words px-2 text-xs text-text-secondary', className)} title={block.reasons}>
    {block.summary}
    {shortened && <span className="sr-only" id={id}>{block.reasons}</span>}
  </p>;
}
