// Parses `git diff --name-status -M` into the paths a gate should check.
// A pure move (R100) keeps its content, so it is skipped; a move with edits (R<100), A, C and M are kept.
export const parseChangedFiles = (nameStatus) =>
  nameStatus
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      const [status, ...paths] = line.split('\t');
      if (status === 'R100') return [];
      if (!/^[ACMR]/.test(status)) return [];
      return [paths[paths.length - 1]];
    });
