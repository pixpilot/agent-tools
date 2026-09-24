import fs from 'node:fs';
import path from 'node:path';
import { EnvironmentAdapter } from './environment-adapter';
import { readNpmrcRegistryHosts } from './npm-registry-hosts';

/**
 * JavaScript/TypeScript projects. `@antfu/ni` picks whichever package manager
 * the repository already uses, so no npm/pnpm/yarn/bun detection lives here.
 */
export class NodeEnvironment extends EnvironmentAdapter {
  readonly id = 'node';
  readonly label = 'JavaScript / TypeScript';
  readonly installCommand = 'ni';
  override readonly egressHosts = ['registry.npmjs.org'];
  override readonly volumePaths = ['/workspace/node_modules'];

  detect(worktreePath: string): boolean {
    return fs.existsSync(path.join(worktreePath, 'package.json'));
  }

  /** Registries from `.npmrc`, e.g. `@scope:registry=https://npm.pkg.github.com/`. */
  override projectEgressHosts(projectPath: string): readonly string[] {
    return readNpmrcRegistryHosts(projectPath);
  }
}
