/** Test-only XLSX reader (#173): unzip with fflate and read cells back as `{ ref: number | string }` per sheet. */
import { strFromU8, unzipSync } from 'fflate';

const unescape = (text: string) => text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&amp;', '&');

export async function readXlsx(blob: Blob): Promise<{ sheetNames: string[]; sheets: Record<string, number | string>[] }> {
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  const files = unzipSync(bytes);
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : '');
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map(m => unescape([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));
  const sheetNames = [...text('xl/workbook.xml').matchAll(/<sheet [^>]*name="([^"]*)"/g)].map(m => unescape(m[1]));
  const sheets = sheetNames.map((_, i) => {
    const cells: Record<string, number | string> = {};
    for (const m of text(`xl/worksheets/sheet${i + 1}.xml`).matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const value = /<v>([\s\S]*?)<\/v>/.exec(m[3] ?? '')?.[1];
      if (value === undefined) continue;
      cells[m[1]] = /t="s"/.test(m[2]) ? shared[Number(value)] : /t="(str|inlineStr)"/.test(m[2]) ? unescape(value) : Number(value);
    }
    return cells;
  });
  return { sheetNames, sheets };
}
