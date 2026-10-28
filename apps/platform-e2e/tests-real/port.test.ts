import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePort } from './port.ts';

test('ports use defaults only when absent and accept integers in range', () => {
  assert.equal(parsePort('E2E_PORT', 4190, {}), 4190);
  assert.equal(parsePort('E2E_REAL_BACKEND_PORT', 3011, {}), 3011);
  for (const value of ['1', '65535', '4190']) assert.equal(parsePort('E2E_PORT', 4190, { E2E_PORT: value }), Number(value));
  for (const value of ['', '0', '65536', '-1', '1.5', '1x', ' 1']) {
    assert.throws(() => parsePort('E2E_PORT', 4190, { E2E_PORT: value }), /E2E_PORT must be an integer port/);
  }
});
