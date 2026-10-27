import { hostModuleDir, shell } from '@ap/eslint-config';

// The fixture module (ADR-0053) is a directory, not a package: it sees only @ap/contracts and @ap/ui and stays inside its root.
export default [...shell, ...hostModuleDir('src/__fixtures__/module-fixture')];
