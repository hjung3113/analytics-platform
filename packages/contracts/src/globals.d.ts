/**
 * The only host APIs contracts may use. WHATWG URLSearchParams and AbortSignal exist in browsers and Node, so it is declared
 * here instead of pulling in DOM or @types/node (which would also admit window, Buffer, process, …).
 * Declare only the members contracts use; widen deliberately.
 */
declare class URLSearchParams {
  constructor(init?: string | [string, string][]);
  entries(): IterableIterator<[string, string]>;
  toString(): string;
}

/** Passed through adapter signatures only; contracts never inspect it. */
interface AbortSignal {
  readonly aborted: boolean;
}
