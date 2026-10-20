function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"')) return JSON.parse(trimmed);
  if (trimmed.startsWith("'")) return trimmed.slice(1, -1).replace(/''/g, "'");
  return trimmed;
}

export function readWorkspaceBlock(workspaceYaml, section) {
  const lines = workspaceYaml.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `${section}:`);
  if (start < 0) throw new Error(`pnpm-workspace.yaml has no ${section} block`);

  const block = [];
  for (const line of lines.slice(start + 1)) {
    if (line.length === 0 || !line.startsWith('  ')) break;
    block.push(line);
  }
  return block;
}

export function readPatchedDependencies(workspaceYaml) {
  return readWorkspaceBlock(workspaceYaml, 'patchedDependencies').map((line) => {
    const separator = line.indexOf(':');
    if (separator < 0) throw new Error(`invalid patchedDependencies entry: ${line.trim()}`);
    const id = parseScalar(line.slice(0, separator));
    const path = parseScalar(line.slice(separator + 1));
    if (!id || !path) throw new Error(`invalid patchedDependencies entry: ${line.trim()}`);
    return { id, path };
  });
}

export function readAutoAnimatePatch(workspaceYaml) {
  const matches = readPatchedDependencies(workspaceYaml).filter(({ id }) => id.startsWith('@formkit/auto-animate@'));
  if (matches.length === 0) throw new Error('pnpm-workspace.yaml has no @formkit/auto-animate patch in patchedDependencies');
  if (matches.length > 1) throw new Error('pnpm-workspace.yaml must declare exactly one @formkit/auto-animate patch in patchedDependencies');
  return matches[0];
}
