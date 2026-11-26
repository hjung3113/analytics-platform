export type SaveBlock = { summary: string; reasons: string };

export function SaveBlockNotice({ id, block }: { id: string; block: SaveBlock }) {
  const shortened = block.summary !== block.reasons;
  return <p id={shortened ? undefined : id} className="break-words px-2 text-xs text-text-secondary" title={block.reasons}>
    {block.summary}
    {shortened && <span className="sr-only" id={id}>{block.reasons}</span>}
  </p>;
}
