// Server boundary conformance cases of this menu's reads: one case per endpoint, with params the granted session's
// request succeeds with. src/conformance.test.ts finds this file in every menu folder and runs it against the mock
// adapter; the in-house side runs the same list against its own server (README «적합성 검사»). A copy of this folder
// carries it, so a new menu needs no extra registration — only a case per endpoint it adds.
import type { ConformanceCase } from '@ap/server-conformance';
import { sampleEndpoint } from './endpoints';

export const cases: readonly ConformanceCase[] = [{ spec: sampleEndpoint, params: {} }];
