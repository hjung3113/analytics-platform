import { describe, expect, it } from 'vitest';

import { createSyntheticScenario, SYNTHETIC_LEAK_MARKER } from '../adapters/synthetic/index.js';
import { runSourceReadContract, type ContractScenario } from '../testing/source-read-contract.js';

runSourceReadContract(
  { describe, it, expect } as never,
  {
    name: 'synthetic (합성)',
    synthetic: true,
    failureMarker: SYNTHETIC_LEAK_MARKER,
    setup(scenario: ContractScenario) {
      const { port, sampleSet } = createSyntheticScenario(scenario);
      const files = sampleSet.files;
      const probe =
        scenario === 'many_rows'
          ? { fileRef: files[0]?.fileRef ?? '', line: 160 }
          : scenario === 'long_line'
            ? { fileRef: files[0]?.fileRef ?? '', line: 5 }
            : { fileRef: files[0]?.fileRef ?? '', line: 5 };
      return { port, sampleSet, probe };
    },
  },
);
