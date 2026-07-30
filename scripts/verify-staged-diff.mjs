import { spawnSync } from 'node:child_process';

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `git ${args.join(' ')} failed`);
  return result.stdout;
}

git(['diff', '--cached', '--check']);
const staged = git(['diff', '--cached', '--name-only']).split(/\r?\n/u).filter(Boolean);
if (!staged.length) throw new Error('No staged files found.');
const unstaged = git(['diff', '--name-only']).split(/\r?\n/u).filter(Boolean);
const untracked = git(['ls-files', '--others', '--exclude-standard']).split(/\r?\n/u).filter(Boolean);
if (unstaged.length || untracked.length) {
  throw new Error(`Diff is not frozen: unstaged=${unstaged.join(',') || 'none'} untracked=${untracked.join(',') || 'none'}`);
}
console.log(JSON.stringify({ ok: true, stagedFiles: staged.length, staged }));
