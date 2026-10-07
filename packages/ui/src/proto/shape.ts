// THROWAWAY #228 — never merge.
import type { ProtoVariant } from './context';

const layoutNames = new Set([
  'flex', 'inline-flex', 'grid', 'inline-grid', 'block', 'inline-block', 'inline',
  'hidden', 'contents', 'grow', 'shrink', 'absolute', 'relative', 'fixed', 'sticky',
  'static', 'truncate', 'sr-only',
]);
const layoutPrefixes = [
  'w-', 'min-w-', 'max-w-', 'h-', 'min-h-', 'max-h-', 'size-',
  'm-', 'mx-', 'my-', 'mt-', 'mr-', 'mb-', 'ml-', 'ms-', 'me-',
  'flex-', 'basis-', 'order-', 'col-', 'row-', 'self-',
  'justify-', 'items-', 'content-', 'place-', 'inset-', 'top-', 'right-',
  'bottom-', 'left-', 'z-', 'overflow-', 'whitespace-',
];
const spacingPrefixes = [
  'p-', 'px-', 'py-', 'pt-', 'pr-', 'pb-', 'pl-', 'ps-', 'pe-', 'gap-', 'space-x-', 'space-y-',
];

export function protoClass(variant: ProtoVariant, className?: string, { spacing = false }: { spacing?: boolean } = {}) {
  if (variant === 'A' || className === undefined) return className;
  return className.split(/\s+/).filter((token) => {
    const body = token.slice(token.lastIndexOf(':') + 1).replace(/^-/, '');
    return layoutNames.has(body) || layoutPrefixes.some((prefix) => body.startsWith(prefix))
      || (spacing && spacingPrefixes.some((prefix) => body.startsWith(prefix)));
  }).join(' ');
}
