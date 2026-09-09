import type { ConfigComponent, ConfigDirectoryInfo } from './types.ts';
import fs from 'node:fs';
import path from 'node:path';

const SOURCE_PATHS: Record<ConfigComponent, readonly string[]> = {
  skills: ['skills'],
  prompts: ['prompts'],
  mcp: ['mcp.jsonc', 'mcp.json'],
  rules: ['GLOBAL-AI-RULES.md'],
};

/** Validates a portable agent configuration directory and lists its assets. */
export function inspectConfigDirectory(directory: string): ConfigDirectoryInfo {
  const resolved = path.resolve(directory);

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Configuration directory does not exist: ${resolved}`);
  }

  const available = (Object.keys(SOURCE_PATHS) as ConfigComponent[]).filter((component) =>
    SOURCE_PATHS[component].some((entry) =>
      isValidComponentPath(path.join(resolved, entry), component),
    ),
  );

  return { path: resolved, available };
}

/** Returns the source file or directory for a portable configuration component. */
export function findConfigComponent(
  configDirectory: string,
  component: ConfigComponent,
): string | undefined {
  return SOURCE_PATHS[component]
    .map((entry) => path.join(configDirectory, entry))
    .find((candidate) => isValidComponentPath(candidate, component));
}

function isValidComponentPath(candidate: string, component: ConfigComponent): boolean {
  try {
    const stats = fs.lstatSync(candidate);
    return component === 'skills' || component === 'prompts'
      ? stats.isDirectory()
      : stats.isFile();
  } catch {
    return false;
  }
}

/** Copies only recognized portable components without executing source code. */
export function mergeConfigDirectories(
  sourceDirectory: string,
  targetDirectory: string,
): void {
  fs.mkdirSync(targetDirectory, { recursive: true });
  for (const component of Object.keys(SOURCE_PATHS) as ConfigComponent[]) {
    const source = findConfigComponent(sourceDirectory, component);
    if (source != null) {
      const targetName =
        component === 'mcp'
          ? path.basename(source)
          : (SOURCE_PATHS[component][0] as string);
      fs.cpSync(source, path.join(targetDirectory, targetName), {
        recursive: true,
        force: true,
        dereference: true,
      });
    }
  }
}
