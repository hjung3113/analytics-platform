import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Button } from './Button';

afterEach(cleanup);

it('rejects asChild with loading in the Vite development environment', () => {
  expect(() => render(<Button asChild loading><span>Save</span></Button>)).toThrow(/incompatible/);
});
