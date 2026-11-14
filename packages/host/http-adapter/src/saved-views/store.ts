import type { GroupMember, Result, SavedViewDraft, SavedViewKey, SavedViewStore } from '@ap/contracts';
import { plainCall, TransportError, type CallContext } from '../calls/calls.js';
import { isSavedViewCommand, responseGuards, withinCommandBounds, type SavedViewOp } from './guards.js';

/** ADR-0099 section 3: one strict command endpoint; the actor is the cookie session and is never on the wire. */
export const SAVED_VIEW_COMMANDS_PATH = '/api/v1/platform/saved-views/commands';

/** One local view offered to the server by `importLocal` (ADR-0099 section 4). */
export type SavedViewImportRow = { legacyKey: string; draft: SavedViewDraft };
export type SavedViewImportCommand = {
  importToken: string;
  rows: readonly SavedViewImportRow[];
  defaults: readonly { key: { menuId: string | null }; legacyKey: string }[];
};
export type SavedViewImportRowResult =
  | { legacyKey: string; status: 'imported' | 'already_imported'; id: string }
  | { legacyKey: string; status: 'rejected'; reason: 'invalid' | 'forbidden' | 'unavailable'; detail?: string };
export type SavedViewImportOutcome = { results: readonly SavedViewImportRowResult[]; defaults: readonly { key: { menuId: string | null }; legacyKey: string; id: string }[] };
/** Not a `SavedViewStore` method: browser-local rows are an http-adapter/app concern, never part of the port. */
export type ImportLocal = (command: SavedViewImportCommand) => Promise<Result<SavedViewImportOutcome>>;

const unavailable: Result<never> = { ok: false, reason: 'unavailable' };
const MALFORMED = 'http_422';

/** Builds the HTTP `SavedViewStore` and `importLocal` on the adapter's own transport, session and CSRF token. */
export function createHttpSavedViews(context: CallContext): { store: SavedViewStore; importLocal: ImportLocal } {
  const actor = (): string => context.store.session().user.id;

  /** Sends one command with the current CSRF token (reads included); never resent. Returns the guarded value or throws a TransportError. */
  async function post(op: SavedViewOp, fields: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const body = { version: 1, op, ...fields };
    if (!isSavedViewCommand(body)) throw new TransportError(withinCommandBounds(body) ? 'invalid_command' : 'command_too_large', '');
    const reply = await plainCall(context, { method: 'POST', path: SAVED_VIEW_COMMANDS_PATH, body }, { csrf: true, signal });
    if (!responseGuards[op](reply.value)) throw new TransportError('invalid_response', reply.correlationId);
    return reply.value;
  }

  /** Reads reject a sanitized TransportError; a request for another actor's key never leaves the browser. */
  async function read<T>(key: SavedViewKey | null, op: SavedViewOp, fields: Record<string, unknown>, empty: T, signal?: AbortSignal): Promise<T> {
    const who = actor();
    if (key && key.userId !== who) return empty;
    const value = (await post(op, fields, signal)) as T;
    return actor() === who ? value : empty;
  }

  /** Mutations never reject. 422 (the server refused the body) is `invalid`; every other failure leaves the effect unknown: `unavailable`. */
  async function write<T>(op: SavedViewOp, fields: Record<string, unknown>, key: SavedViewKey | null = null): Promise<Result<T>> {
    const who = actor();
    if (key && key.userId !== who) return { ok: false, reason: 'forbidden' };
    try {
      const value = (await post(op, fields)) as Result<T>;
      return actor() === who ? value : { ok: false, reason: 'forbidden' };
    } catch (error) {
      if (error instanceof TransportError) {
        if (error.code === MALFORMED) return { ok: false, reason: 'invalid', detail: 'malformed' };
        if (error.code === 'command_too_large' || error.code === 'invalid_command') return { ok: false, reason: 'invalid', detail: error.code };
      }
      return unavailable;
    }
  }
  const wireKey = (key: SavedViewKey) => ({ menuId: key.menuId });

  const store: SavedViewStore = {
    list: (key) => read(key, 'list', { key: wireKey(key) }, []),
    get: async (id) => read(null, 'get', { id }, null),
    save: (draft) => write('save', { draft }),
    update: (id, patch, opts) => write('update', { id, patch, expectedVersion: opts.expectedVersion }),
    remove: (id) => write('remove', { id }),
    setDefault: (key, id) => write('setDefault', { key: wireKey(key), id }, key),
    getDefaultId: (key) => read(key, 'getDefaultId', { key: wireKey(key) }, null),
    setVisibility: (id, visibility, opts) => write('setVisibility', { id, visibility, expectedVersion: opts.expectedVersion }),
    requestOfficial: (id, opts) => write('requestOfficial', { id, expectedVersion: opts.expectedVersion }),
    decide: (id, decision, note, opts) => write('decide', { id, decision, ...(note === undefined ? {} : { note }), expectedVersion: opts.expectedVersion }),
    revoke: (id, opts) => write('revoke', { id, expectedVersion: opts.expectedVersion }),
    listApprovalRequests: (key) => read(key, 'listApprovalRequests', { key: wireKey(key) }, []),
    listGroups: () => read(null, 'listGroups', {}, []),
    createGroup: (input) => write('createGroup', { name: input.name, memberIds: input.memberIds }),
    updateGroup: (id, patch) => write('updateGroup', { id, patch }),
    searchPeople: (query, signal) => read<readonly GroupMember[]>(null, 'searchPeople', { query }, [], signal),
  };

  const importLocal: ImportLocal = (command) => write<SavedViewImportOutcome>('importLocal', { importToken: command.importToken, rows: command.rows, defaults: command.defaults });
  return { store, importLocal };
}
