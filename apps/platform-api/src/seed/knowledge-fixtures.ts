// Synthetic log knowledge catalog for `SEED_MODE=personas|scale` (#1194 a): 3 vendors (one inactive),
// 4 processes, 6 models (one in two processes, one unmapped) and 10 software versions, so real-mode
// previews of the catalog screens show rows. Names are synthetic. Idempotent: rows are keyed by their
// ADR-0107 comparison key. The core seed never calls this.

import { and, eq } from 'drizzle-orm';

import type { DbHandle } from '../db/client.js';
import {
  equipmentModels,
  modelProcesses,
  processCategories,
  softwareVersions,
  vendors,
} from '../db/schema/knowledge.js';
import { toCodeKey } from '../modules/log-knowledge/domain/code-key.js';

const VENDORS = [
  { code: 'Vendor A', name: 'Vendor A', active: true },
  { code: 'Vendor B', name: 'Vendor B', active: true },
  { code: 'Vendor C', name: 'Vendor C (retired)', active: false },
] as const;
const PROCESSES = ['ETCH', 'CVD', 'PVD', 'CMP'] as const;
const MODELS = [
  { vendor: 'Vendor A', code: 'MX-100', processes: ['ETCH', 'CVD'] },
  { vendor: 'Vendor A', code: 'MX-200', processes: ['ETCH'] },
  { vendor: 'Vendor B', code: 'MX-300', processes: ['PVD'] },
  { vendor: 'Vendor B', code: 'MX-400', processes: ['CMP'] },
  { vendor: 'Vendor B', code: 'MX-500', processes: [] },
  { vendor: 'Vendor C', code: 'MX-600', processes: ['CVD'] },
] as const;
const SOFTWARE: readonly (readonly [string, string])[] = [
  ['MX-100', 'v1.0.0'],
  ['MX-100', 'v1.2.0'],
  ['MX-100', 'v2.0.0'],
  ['MX-200', 'v1.0.0'],
  ['MX-200', 'v1.1.0'],
  ['MX-300', 'v3.0.1'],
  ['MX-300', 'v3.1.0'],
  ['MX-400', 'v1.0.0'],
  ['MX-400', 'v1.4.2'],
  ['MX-600', 'v0.9.0'],
];

export async function seedKnowledgeCatalog(
  handle: DbHandle,
  workspaceId: string,
  actorId: string,
): Promise<{ rowsInserted: number }> {
  const { db } = handle;
  const stamp = { workspaceId, createdBy: actorId, updatedBy: actorId };
  let rowsInserted = 0;

  const vendorIds = new Map<string, string>();
  for (const v of VENDORS) {
    const inserted = await db
      .insert(vendors)
      .values({ ...stamp, code: v.code, codeKey: toCodeKey(v.code), name: v.name, active: v.active })
      .onConflictDoNothing()
      .returning({ id: vendors.id });
    rowsInserted += inserted.length;
    const [row] = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.workspaceId, workspaceId), eq(vendors.codeKey, toCodeKey(v.code))));
    vendorIds.set(v.code, (row as { id: string }).id);
  }

  const processIds = new Map<string, string>();
  for (const code of PROCESSES) {
    const inserted = await db
      .insert(processCategories)
      .values({ ...stamp, code, codeKey: toCodeKey(code), name: code })
      .onConflictDoNothing()
      .returning({ id: processCategories.id });
    rowsInserted += inserted.length;
    const [row] = await db
      .select({ id: processCategories.id })
      .from(processCategories)
      .where(and(eq(processCategories.workspaceId, workspaceId), eq(processCategories.codeKey, toCodeKey(code))));
    processIds.set(code, (row as { id: string }).id);
  }

  const modelIds = new Map<string, string>();
  for (const m of MODELS) {
    const vendorId = vendorIds.get(m.vendor) as string;
    const inserted = await db
      .insert(equipmentModels)
      .values({ ...stamp, vendorId, code: m.code, codeKey: toCodeKey(m.code), name: m.code })
      .onConflictDoNothing()
      .returning({ id: equipmentModels.id });
    rowsInserted += inserted.length;
    const [row] = await db
      .select({ id: equipmentModels.id })
      .from(equipmentModels)
      .where(
        and(
          eq(equipmentModels.workspaceId, workspaceId),
          eq(equipmentModels.vendorId, vendorId),
          eq(equipmentModels.codeKey, toCodeKey(m.code)),
        ),
      );
    const modelId = (row as { id: string }).id;
    modelIds.set(m.code, modelId);
    for (const p of m.processes) {
      const mapped = await db
        .insert(modelProcesses)
        .values({ workspaceId, modelId, processId: processIds.get(p) as string, assignedBy: actorId })
        .onConflictDoNothing()
        .returning({ id: modelProcesses.modelId });
      rowsInserted += mapped.length;
    }
  }

  for (const [model, label] of SOFTWARE) {
    const inserted = await db
      .insert(softwareVersions)
      .values({
        ...stamp,
        modelId: modelIds.get(model) as string,
        versionLabel: label,
        versionKey: toCodeKey(label),
        name: `${model} ${label}`,
      })
      .onConflictDoNothing()
      .returning({ id: softwareVersions.id });
    rowsInserted += inserted.length;
  }
  return { rowsInserted };
}
