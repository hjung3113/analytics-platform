// Read side of the log knowledge catalog: `knowledge.*` tables only, every statement scoped to the
// session's workspace. Paging is `{ rows, total }`; every sort ends in `id` so a page never repeats
// or skips a row between requests.

import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { type SQL, and, asc, desc, eq, exists, ilike, inArray, like, or, sql } from 'drizzle-orm';

import {
  equipmentModels,
  modelProcesses,
  processCategories,
  softwareVersions,
  vendors,
} from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';
import { toCodeKey } from '../domain/code-key.js';

export type StatusFilter = 'active' | 'inactive' | 'all';
export interface PageSort {
  id: string;
  desc: boolean;
}
export interface ListQuery {
  workspaceId: string;
  q: string | null;
  status: StatusFilter;
  page: number;
  pageSize: number;
  sorting: readonly PageSort[];
}

export interface Page<T> {
  rows: T[];
  total: number;
}

interface Stamps {
  id: string;
  code: string;
  name: string;
  active: boolean;
  version: string;
  createdAt: string;
  updatedAt: string;
}
export interface VendorRow extends Stamps {
  modelCount: number;
}
export interface ProcessRow extends Stamps {
  modelCount: number;
}
export interface ModelRow extends Stamps {
  vendorId: string;
  vendorName: string;
  processes: { id: string; name: string }[];
  softwareCount: number;
}
export interface SoftwareRow extends Stamps {
  modelId: string;
  versionLabel: string;
}

export const VENDOR_SORT_IDS = ['code', 'name', 'active', 'modelCount', 'createdAt', 'updatedAt'] as const;
export const PROCESS_SORT_IDS = VENDOR_SORT_IDS;
export const MODEL_SORT_IDS = ['code', 'name', 'vendorName', 'active', 'softwareCount', 'createdAt', 'updatedAt'] as const;
export const SOFTWARE_SORT_IDS = ['versionLabel', 'name', 'active', 'createdAt', 'updatedAt'] as const;

/** LIKE metacharacters in user text are literals. */
export const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (c) => `\\${c}`);

const iso = (value: Date | string): string => (value instanceof Date ? value : new Date(value)).toISOString();

function textFilter(
  codeKeyColumn: AnyPgColumn,
  nameColumn: AnyPgColumn,
  q: string | null,
): SQL | undefined {
  if (q === null) return undefined;
  const key = toCodeKey(q);
  if (key === '' && q.trim() === '') return undefined;
  return or(
    like(codeKeyColumn, `${escapeLike(key)}%`),
    ilike(nameColumn, `%${escapeLike(q.trim())}%`),
  );
}

const statusFilter = (column: AnyPgColumn, status: StatusFilter): SQL | undefined =>
  status === 'all' ? undefined : eq(column, status === 'active');

const order = (expr: SQL | AnyPgColumn, descending: boolean): SQL =>
  descending ? desc(expr) : asc(expr);

export async function listVendors(tx: Tx, q: ListQuery): Promise<Page<VendorRow>> {
  const where = and(
    eq(vendors.workspaceId, q.workspaceId),
    statusFilter(vendors.active, q.status),
    textFilter(vendors.codeKey, vendors.name, q.q),
  );
  const modelCount = sql<number>`(select count(*)::int from ${equipmentModels} m where m.workspace_id = ${vendors.workspaceId} and m.vendor_id = ${vendors.id} and m.active)`;
  const sortable: Record<string, SQL | AnyPgColumn> = {
    code: vendors.codeKey,
    name: vendors.name,
    active: vendors.active,
    modelCount,
    createdAt: vendors.createdAt,
    updatedAt: vendors.updatedAt,
  };
  const orderBy = [
    ...q.sorting.map((s) => order(sortable[s.id] as SQL | AnyPgColumn, s.desc)),
    asc(vendors.id),
  ];
  const rows = await tx
    .select({ row: vendors, modelCount })
    .from(vendors)
    .where(where)
    .orderBy(...orderBy)
    .limit(q.pageSize)
    .offset(q.page * q.pageSize);
  const [totalRow] = await tx.select({ n: sql<number>`count(*)::int` }).from(vendors).where(where);
  return {
    total: totalRow?.n ?? 0,
    rows: rows.map(({ row, modelCount: count }) => ({ ...stamps(row), modelCount: count })),
  };
}

export async function listProcesses(tx: Tx, q: ListQuery): Promise<Page<ProcessRow>> {
  const t = processCategories;
  const where = and(
    eq(t.workspaceId, q.workspaceId),
    statusFilter(t.active, q.status),
    textFilter(t.codeKey, t.name, q.q),
  );
  const modelCount = sql<number>`(select count(*)::int from ${modelProcesses} mp join ${equipmentModels} m on m.workspace_id = mp.workspace_id and m.id = mp.model_id where mp.workspace_id = ${t.workspaceId} and mp.process_id = ${t.id} and m.active)`;
  const sortable: Record<string, SQL | AnyPgColumn> = {
    code: t.codeKey,
    name: t.name,
    active: t.active,
    modelCount,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
  const rows = await tx
    .select({ row: t, modelCount })
    .from(t)
    .where(where)
    .orderBy(...q.sorting.map((s) => order(sortable[s.id] as SQL | AnyPgColumn, s.desc)), asc(t.id))
    .limit(q.pageSize)
    .offset(q.page * q.pageSize);
  const [totalRow] = await tx.select({ n: sql<number>`count(*)::int` }).from(t).where(where);
  return {
    total: totalRow?.n ?? 0,
    rows: rows.map(({ row, modelCount: count }) => ({ ...stamps(row), modelCount: count })),
  };
}

export interface ModelQuery extends ListQuery {
  vendorId: string | null;
  processId: string | null;
}

export async function listModels(tx: Tx, q: ModelQuery): Promise<Page<ModelRow>> {
  const t = equipmentModels;
  const where = and(
    eq(t.workspaceId, q.workspaceId),
    statusFilter(t.active, q.status),
    textFilter(t.codeKey, t.name, q.q),
    q.vendorId === null ? undefined : eq(t.vendorId, q.vendorId),
    // EXISTS, not a join: a model in two processes still appears once.
    q.processId === null
      ? undefined
      : exists(
          tx
            .select({ one: sql`1` })
            .from(modelProcesses)
            .where(
              and(
                eq(modelProcesses.workspaceId, t.workspaceId),
                eq(modelProcesses.modelId, t.id),
                eq(modelProcesses.processId, q.processId),
              ),
            ),
        ),
  );
  const softwareCount = sql<number>`(select count(*)::int from ${softwareVersions} s where s.workspace_id = ${t.workspaceId} and s.model_id = ${t.id} and s.active)`;
  const sortable: Record<string, SQL | AnyPgColumn> = {
    code: t.codeKey,
    name: t.name,
    vendorName: vendors.name,
    active: t.active,
    softwareCount,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
  const rows = await tx
    .select({ row: t, vendorName: vendors.name, softwareCount })
    .from(t)
    .innerJoin(vendors, and(eq(vendors.workspaceId, t.workspaceId), eq(vendors.id, t.vendorId)))
    .where(where)
    .orderBy(...q.sorting.map((s) => order(sortable[s.id] as SQL | AnyPgColumn, s.desc)), asc(t.id))
    .limit(q.pageSize)
    .offset(q.page * q.pageSize);
  const [totalRow] = await tx.select({ n: sql<number>`count(*)::int` }).from(t).where(where);
  const ids = rows.map((r) => r.row.id);
  const mapped =
    ids.length === 0
      ? []
      : await tx
          .select({
            modelId: modelProcesses.modelId,
            id: processCategories.id,
            name: processCategories.name,
          })
          .from(modelProcesses)
          .innerJoin(
            processCategories,
            and(
              eq(processCategories.workspaceId, modelProcesses.workspaceId),
              eq(processCategories.id, modelProcesses.processId),
            ),
          )
          .where(and(eq(modelProcesses.workspaceId, q.workspaceId), inArray(modelProcesses.modelId, ids)))
          .orderBy(asc(processCategories.name), asc(processCategories.id));
  return {
    total: totalRow?.n ?? 0,
    rows: rows.map(({ row, vendorName, softwareCount: count }) => ({
      ...stamps(row),
      vendorId: row.vendorId,
      vendorName,
      processes: mapped.filter((m) => m.modelId === row.id).map(({ id, name }) => ({ id, name })),
      softwareCount: count,
    })),
  };
}

export interface SoftwareQuery extends ListQuery {
  modelId: string | null;
}

export async function listSoftwareVersions(tx: Tx, q: SoftwareQuery): Promise<Page<SoftwareRow>> {
  const t = softwareVersions;
  const where = and(
    eq(t.workspaceId, q.workspaceId),
    statusFilter(t.active, q.status),
    textFilter(t.versionKey, t.name, q.q),
    q.modelId === null ? undefined : eq(t.modelId, q.modelId),
  );
  const sortable: Record<string, SQL | AnyPgColumn> = {
    versionLabel: t.versionKey,
    name: t.name,
    active: t.active,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
  const rows = await tx
    .select()
    .from(t)
    .where(where)
    .orderBy(...q.sorting.map((s) => order(sortable[s.id] as SQL | AnyPgColumn, s.desc)), asc(t.id))
    .limit(q.pageSize)
    .offset(q.page * q.pageSize);
  const [totalRow] = await tx.select({ n: sql<number>`count(*)::int` }).from(t).where(where);
  return {
    total: totalRow?.n ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      code: row.versionLabel,
      versionLabel: row.versionLabel,
      name: row.name,
      active: row.active,
      version: String(row.rowVersion),
      modelId: row.modelId,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    })),
  };
}

function stamps(row: {
  id: string;
  code: string;
  name: string;
  active: boolean;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
}): Stamps {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active,
    version: String(row.rowVersion),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
