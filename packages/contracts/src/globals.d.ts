/**
 * The only host API contracts may use. WHATWG URLSearchParams exists in browsers and Node, so it is declared
 * here instead of pulling in DOM or @types/node (which would also admit window, Buffer, process, …).
 * Declare only the members url.ts uses; widen deliberately.
 */
declare class URLSearchParams {
  constructor(init?: string | [string, string][]);
  entries(): IterableIterator<[string, string]>;
  toString(): string;
}
