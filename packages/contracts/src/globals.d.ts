/**
 * The only host APIs contracts may use. WHATWG URL, URLSearchParams and AbortSignal exist in browsers and Node, so they are declared
 * here instead of pulling in DOM or @types/node (which would also admit window, Buffer, process, …).
 * Declare only the members contracts use; widen deliberately.
 */
declare class URLSearchParams {
  constructor(init?: string | [string, string][]);
  entries(): IterableIterator<[string, string]>;
  toString(): string;
}

/** WHATWG URL — used only by `feedbackops-link.ts` (origin canonicalization, `platformReturn` checks); exists in browsers and Node. */
declare class URL {
  constructor(url: string);
  readonly origin: string;
  readonly protocol: string;
  readonly hostname: string;
  readonly username: string;
  readonly password: string;
}

/** Passed through adapter signatures only; contracts never inspect it. */
interface AbortSignal {
  readonly aborted: boolean;
}

/**
 * Web Crypto — used only by `correlation.ts`; exists in browsers and Node. `randomUUID` is absent outside a secure
 * context (plain HTTP), so it is optional here.
 */
declare var crypto: {
  getRandomValues<T extends Uint8Array>(array: T): T;
  randomUUID?(): string;
} | undefined;
