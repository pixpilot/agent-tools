import type { EnvironmentAdapter } from './environment-adapter';
import { NodeEnvironment } from './node-environment';

const ENVIRONMENTS: readonly EnvironmentAdapter[] = [new NodeEnvironment()];

/** First environment adapter that recognises the worktree, if any. */
export function detectEnvironment(worktreePath: string): EnvironmentAdapter | undefined {
  return ENVIRONMENTS.find((environment) => environment.detect(worktreePath));
}

/** Every registered project environment. */
export function listEnvironments(): readonly EnvironmentAdapter[] {
  return ENVIRONMENTS;
}
