import { configure } from '@testing-library/react';

// Chart pages render past testing-library's 1 s default under CI load (#783: two CycleTimeDrilldown files failed once each).
configure({ asyncUtilTimeout: 3000 });
