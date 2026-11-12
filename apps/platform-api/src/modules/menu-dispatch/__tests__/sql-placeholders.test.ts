import { describe, expect, it } from 'vitest';

import { sqlPlaceholders, startsReadStatement } from '../bundle/sql-placeholders.js';

describe('SQL declaration lexical checks', () => {
  it.each([
    ['SELECT :name, :name, :other', ['name', 'other']],
    ["SELECT ':notparam', 'it''s :hidden', :yes", ['yes']],
    ['SELECT "col:x", "a""b:x", :yes', ['yes']],
    ['SELECT x::int, :yes::text', ['yes']],
    ['-- :c\nSELECT :yes -- :no', ['yes']],
    ['/* :c */ SELECT :yes /* :no */', ['yes']],
    ['SELECT $$ :d $$, $tag$ :hidden $tag$, :yes', ['yes']],
    ['SELECT /* outer /* :inner */ :outer */ :yes', ['yes']],
  ])('finds only live placeholders in %s (both dialects)', (sql, names) => {
    expect(sqlPlaceholders(sql, 'postgres')).toEqual(names);
    if (!sql.includes('$')) expect(sqlPlaceholders(sql, 'mssql')).toEqual(names);
  });

  // `[ ]` quotes an identifier only in mssql; in postgres it is an array constructor or subscript holding live placeholders.
  it.each([
    ['SELECT [a:b], [a]]b:c], :yes', 'mssql', ['yes']],
    ['SELECT ARRAY[:n], col[:i], :yes', 'postgres', ['n', 'i', 'yes']],
    ['SELECT $x$ :d $x$, :yes', 'postgres', ['yes']],
    ['SELECT $1, :yes', 'mssql', ['yes']],
  ] as const)('dialect lexis: %s in %s', (sql, dialect, names) => {
    expect(sqlPlaceholders(sql, dialect)).toEqual(names);
  });

  it.each([
    [' \n-- lead\n/* comment */ SELECT :x', true],
    ['/* comment */ with rows as (select 1) select * from rows', true],
    ['DELETE FROM syn.rows', false],
    ['SELECTED :x', false],
    ["'SELECT'", false],
    ['/* unfinished', false],
  ])('checks the leading statement keyword in %s', (sql, accepted) => {
    expect(startsReadStatement(sql, 'postgres')).toBe(accepted);
    expect(startsReadStatement(sql, 'mssql')).toBe(accepted);
  });
});
