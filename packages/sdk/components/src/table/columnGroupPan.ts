/** Pure visual travel math; offsets never enter preferences, URLs or transfers. */
export const groupPanMax = (content: number, width: number) => Math.max(0, content - width);
export const clampGroupPan = (offset: number, content: number, width: number) => Math.max(0, Math.min(groupPanMax(content, width), offset));

export function groupPanKey(key: string, offset: number, widths: readonly number[], width: number): number {
  let content = 0;
  const boundaries = [0, ...widths.map(member => { content += member; return content; })];
  const max = groupPanMax(content, width);
  switch (key) {
    case 'Home': return 0;
    case 'End': return max;
    case 'ArrowRight': return Math.min(max, boundaries.find(boundary => boundary > offset) ?? max);
    case 'ArrowLeft': return Math.max(0, [...boundaries].reverse().find(boundary => boundary < offset) ?? 0);
    default: return clampGroupPan(offset, content, width);
  }
}

export function revealGroupCell(offset: number, start: number, end: number, content: number, width: number): number {
  if (start < offset) return clampGroupPan(start, content, width);
  if (end > offset + width) return clampGroupPan(Math.min(start, end - width), content, width);
  return clampGroupPan(offset, content, width);
}
