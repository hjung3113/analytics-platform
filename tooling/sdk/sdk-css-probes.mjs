const SINGLETON_UTILITIES = new Set([
  'absolute', 'antialiased', 'block', 'break-all', 'break-keep', 'break-normal', 'break-words', 'capitalize', 'collapse',
  'contents', 'fixed', 'flex', 'flow-root', 'grid', 'hidden', 'inline', 'inline-block', 'inline-flex', 'inline-grid',
  'invisible', 'isolate', 'italic', 'line-through', 'lowercase', 'no-underline', 'not-italic', 'not-sr-only', 'normal-case',
  'overline', 'relative', 'sr-only', 'static', 'sticky', 'subpixel-antialiased', 'table', 'table-caption', 'table-cell',
  'table-column', 'table-column-group', 'table-footer-group', 'table-header-group', 'table-row', 'table-row-group', 'truncate',
  'underline', 'uppercase', 'visible', 'whitespace-break-spaces', 'whitespace-normal', 'whitespace-nowrap', 'whitespace-pre',
  'whitespace-pre-line', 'whitespace-pre-wrap',
]);

const UTILITY_PREFIXES = [
  'accent-', 'animate-', 'aspect-', 'auto-cols-', 'auto-rows-', 'backdrop-', 'basis-', 'bg-', 'border-', 'bottom-', 'box-',
  'break-', 'caret-', 'clear-', 'col-', 'columns-', 'content-', 'cursor-', 'decoration-', 'delay-', 'divide-', 'duration-',
  'ease-', 'end-', 'fill-', 'flex-', 'float-', 'font-', 'from-', 'gap-', 'grid-cols-', 'grid-rows-', 'h-', 'inset-', 'items-',
  'justify-', 'leading-', 'left-', 'list-', 'm-', 'max-h-', 'max-w-', 'mb-', 'me-', 'min-h-', 'min-w-', 'ml-', 'mr-', 'ms-',
  'mt-', 'mx-', 'my-', 'object-', 'opacity-', 'order-', 'origin-', 'outline-', 'overflow-', 'overscroll-', 'p-', 'pb-', 'pe-',
  'place-', 'pl-', 'pointer-events-', 'pr-', 'ps-', 'pt-', 'px-', 'py-', 'right-', 'ring-', 'rounded-', 'rotate-', 'row-', 'scale-',
  'scroll-', 'select-', 'self-', 'shadow-', 'shrink-', 'size-', 'skew-', 'space-', 'start-', 'stroke-', 'tab-', 'text-', 'to-',
  'top-', 'tracking-', 'transform-', 'transition-', 'translate-', 'via-', 'w-', 'whitespace-', 'will-change-', 'z-',
];

const isUtilityClass = (value) =>
  /^[a-z][a-z0-9-]*$/i.test(value) && (SINGLETON_UTILITIES.has(value) || UTILITY_PREFIXES.some((prefix) => value.startsWith(prefix)));

function classNameExpressions(sourceText) {
  const expressions = [];
  const property = /\bclassName\s*:\s*/g;
  for (const match of sourceText.matchAll(property)) {
    const start = match.index + match[0].length;
    let quote = '';
    let escaped = false;
    let depth = 0;
    let end = start;
    for (; end < sourceText.length; end += 1) {
      const character = sourceText[end];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = '';
        continue;
      }
      if (character === '"' || character === "'" || character === '`') {
        quote = character;
      } else if (character === '(' || character === '[' || character === '{') {
        depth += 1;
      } else if (character === ')' || character === ']' || character === '}') {
        if (depth === 0) break;
        depth -= 1;
      } else if (character === ',' && depth === 0) {
        break;
      }
    }
    expressions.push(sourceText.slice(start, end));
  }
  return expressions;
}

function utilityClasses(sourceText) {
  const values = new Set();
  const quotedText = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|`((?:\\.|[^`\\])*)`/gs;
  for (const expression of classNameExpressions(sourceText)) {
    for (const match of expression.matchAll(quotedText)) {
      const value = (match[1] ?? match[2] ?? match[3] ?? '').replace(/\\(["'`\\])/g, '$1');
      for (const token of value.split(/\s+/)) {
        if (isUtilityClass(token)) values.add(token);
      }
    }
  }
  return values;
}

/** Select utility classes from built JS that occur in only one supplied package, so sibling CSS cannot satisfy a probe. */
export function selectCssProbes(packageSources, count = 3, targetPackageNames = packageSources.map(({ packageName }) => packageName)) {
  const classesByPackage = packageSources.map(({ packageName, sourceText }) => ({ packageName, classes: utilityClasses(sourceText) }));
  const owners = new Map();
  for (const { classes } of classesByPackage) {
    for (const name of classes) owners.set(name, (owners.get(name) ?? 0) + 1);
  }

  const targets = new Set(targetPackageNames);
  return classesByPackage.filter(({ packageName }) => targets.has(packageName)).map(({ packageName, classes }) => {
    const classNames = [...classes].filter((name) => owners.get(name) === 1).slice(0, count);
    if (classNames.length === 0) {
      throw new Error(`could not derive a package-only Tailwind utility class for @ap/${packageName} from built dist JS`);
    }
    return { packageName, classNames };
  });
}

/** Match an exact simple class selector rather than a selector with the same prefix. */
export function hasCssSelector(cssText, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\.${escaped}(?=[,:\\s{>+~)])`).test(cssText);
}
