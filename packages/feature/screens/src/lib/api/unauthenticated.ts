export class UnauthenticatedError extends Error {
  constructor() {
    super('unauthenticated');
  }
}
