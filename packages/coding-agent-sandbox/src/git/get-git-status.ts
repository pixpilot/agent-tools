import { runCapture } from '../utils/run-command';

/** Short `git status` for the worktree, used in the end-of-session summary. */
export function getGitStatus(worktreePath: string): string {
  const result = runCapture('git', ['-C', worktreePath, 'status', '--short', '--branch']);

  return result.status === 0 ? result.stdout : result.stderr;
}

/** `user.name`/`user.email` from the host, passed to the container as env. */
export function getGitIdentity(repositoryRoot: string): {
  name?: string | undefined;
  email?: string | undefined;
} {
  const read = (key: string): string | undefined => {
    const result = runCapture('git', ['-C', repositoryRoot, 'config', '--get', key]);
    return result.status === 0 && result.stdout !== '' ? result.stdout : undefined;
  };

  return { name: read('user.name'), email: read('user.email') };
}
