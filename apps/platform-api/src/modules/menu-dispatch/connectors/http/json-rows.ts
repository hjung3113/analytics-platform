interface Frame {
  kind: 'object' | 'array';
  path: string[] | undefined;
  state: 'key-or-end' | 'key' | 'colon' | 'value-or-end' | 'value' | 'comma-or-end';
  key: string;
  index: number;
}

/** Incremental JSON grammar scanner. Retains one token/row, never the response or rows array. */
export class JsonRows {
  private readonly pointer: string[];
  private readonly stack: Frame[] = [];
  private token = '';
  private quoted = false;
  private escaped = false;
  private rootDone = false;
  private found = false;
  private row: string[] | undefined;
  private rowDepth = 0;

  constructor(pointer: string) {
    this.pointer = pointer === '' ? [] : pointer.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  }

  *write(text: string, final = false): Generator<unknown> {
    for (const char of text) {
      if (this.quoted) {
        this.token += char;
        if (this.escaped) this.escaped = false;
        else if (char === '\\') this.escaped = true;
        else if (char === '"') {
          this.quoted = false;
          yield* this.accept(this.token);
          this.token = '';
        }
        continue;
      }
      if (this.token && /[\s{}[\],:"]/.test(char)) {
        yield* this.accept(this.token);
        this.token = '';
      }
      if (char === '"') { this.quoted = true; this.token = char; }
      else if ('{}[],:'.includes(char)) yield* this.accept(char);
      else if (!/[\x20\t\r\n]/.test(char)) this.token += char;
    }
    if (final) yield* this.finish();
  }

  private *finish(): Generator<unknown> {
    if (this.quoted) throw new Error('Incomplete JSON string');
    if (this.token) yield* this.accept(this.token);
    if (this.stack.length || !this.rootDone || !this.found) throw new Error('Incomplete JSON rows');
  }

  private selected(path: string[] | undefined): boolean {
    return path !== undefined && path.length === this.pointer.length && path.every((part, index) => part === this.pointer[index]);
  }

  private *accept(token: string): Generator<unknown> {
    const frame = this.stack.at(-1);
    if (frame?.kind === 'object' && (frame.state === 'key-or-end' || frame.state === 'key')) {
      if (token === '}' && frame.state === 'key-or-end') { yield* this.close(token); return; }
      if (!token.startsWith('"')) throw new Error('Expected JSON key');
      frame.key = JSON.parse(token) as string;
      frame.state = 'colon';
      this.row?.push(token);
      return;
    }
    if (frame?.state === 'colon') {
      if (token !== ':') throw new Error('Expected JSON colon');
      frame.state = 'value'; this.row?.push(token); return;
    }
    if (frame?.state === 'comma-or-end') {
      if (token === (frame.kind === 'array' ? ']' : '}')) { yield* this.close(token); return; }
      if (token !== ',') throw new Error('Expected JSON separator');
      frame.state = frame.kind === 'array' ? 'value' : 'key';
      this.row?.push(token); return;
    }
    if (frame?.kind === 'array' && frame.state === 'value-or-end' && token === ']') { yield* this.close(token); return; }
    if (!frame && this.rootDone) throw new Error('Trailing JSON value');
    const next = frame ? frame.path && [...frame.path, frame.kind === 'object' ? frame.key : String(frame.index)] : [];
    // Stop retaining paths once they cannot lead to the selected array.
    const path = next && next.length <= this.pointer.length && next.every((part, index) => part === this.pointer[index]) ? next : undefined;
    if (this.selected(path)) {
      if (token !== '[' || this.found) throw new Error('Expected one rows array');
      this.found = true;
    }
    if (frame?.kind === 'array' && this.selected(frame.path)) {
      this.row = [];
      this.rowDepth = this.stack.length;
    }
    this.row?.push(token);
    if (token === '{' || token === '[') {
      this.stack.push({ kind: token === '{' ? 'object' : 'array', path, state: token === '{' ? 'key-or-end' : 'value-or-end', key: '', index: 0 });
    } else {
      // JSON.parse supplies strict scalar syntax, escapes and number validation.
      if ('}],:'.includes(token)) throw new Error('Expected JSON value');
      JSON.parse(token);
      yield* this.complete();
    }
  }

  private *close(token: string): Generator<unknown> {
    this.row?.push(token);
    this.stack.pop();
    yield* this.complete();
  }

  private *complete(): Generator<unknown> {
    const frame = this.stack.at(-1);
    if (frame) { frame.state = 'comma-or-end'; frame.index++; }
    else this.rootDone = true;
    if (this.row && this.stack.length === this.rowDepth) {
      const row: unknown = JSON.parse(this.row.join(''));
      this.row = undefined;
      yield row;
    }
  }
}
