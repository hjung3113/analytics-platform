import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

for (const stack of ['production', 'release']) {
  test(`${stack} postgres enables slow queries and suppresses bind values`, () => {
    const compose = readFileSync(
      new URL(`../../docker-compose.${stack}.yml`, import.meta.url),
      'utf8',
    );
    const postgres = compose.split('\n  postgres:\n')[1].split(/\n {2}\S/)[0];
    for (const setting of [
      'log_min_duration_statement=1000',
      'log_lock_waits=on',
      'log_parameter_max_length=0',
      'log_parameter_max_length_on_error=0',
    ])
      assert.ok(postgres.includes(`"${setting}"`), `${stack}: missing ${setting}`);
  });
}
