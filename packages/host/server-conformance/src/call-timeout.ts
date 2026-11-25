/** A conformance deadline expired before the adapter supplied a response or rejection. */
export class ConformanceCallTimeout extends Error {
  override name = 'ConformanceCallTimeout';
}
