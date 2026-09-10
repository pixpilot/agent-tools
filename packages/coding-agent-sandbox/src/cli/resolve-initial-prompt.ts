import fs from 'node:fs';

/** Inputs that can supply the initial prompt for a sandbox session. */
export interface InitialPromptOptions {
  prompt?: string | undefined;
  promptFile?: string | undefined;
}

/**
 * Resolves the single initial-prompt source before a session or wizard starts.
 * A file avoids Windows `npx` passing multi-line text through `cmd.exe`.
 */
export function resolveInitialPrompt({
  prompt,
  promptFile,
}: InitialPromptOptions): string | undefined {
  if (prompt != null && promptFile != null) {
    throw new Error('--prompt and --prompt-file cannot be used together.');
  }

  if (promptFile == null) {
    return prompt;
  }

  try {
    // A UTF-8 BOM is an encoding marker, not part of the prompt content.
    return fs
      .readFileSync(promptFile, 'utf8')
      .replace(/^\uFEFF/u, '')
      .trimEnd();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Could not read --prompt-file ${promptFile}: ${message}`);
  }
}
