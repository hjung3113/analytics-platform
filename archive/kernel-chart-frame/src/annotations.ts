import { validRange, type Range } from './model';
export type Annotation = Readonly<{ id: number; range: Range; text: string }>;
// Server stand-in: owned outside chart state, survives component remount, not full reload.
export class AnnotationRepository {
  private rows: Annotation[] = [];
  list(): Annotation[] { return this.rows.map(row => ({ ...row, range: [...row.range] as Range })); }
  add(range: Range, text: string): void {
    if (!validRange(range) || !text.trim()) throw new Error('유효한 좌표 구간과 주석 내용을 입력하세요.');
    this.rows.push({ id: this.rows.length + 1, range: [...range], text: text.trim() });
  }
}
