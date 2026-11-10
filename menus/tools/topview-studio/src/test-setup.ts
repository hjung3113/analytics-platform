import { configure } from '@testing-library/react';

// Lazy chunks can delay rendering past the 1 s default under CI load (#741).
configure({ asyncUtilTimeout: 3000 });
