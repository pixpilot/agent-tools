/**
 * Appends the configured shared instructions to the initial prompt. A session
 * started without a prompt is left alone: the instructions shape work the user
 * asked for and are never a task of their own.
 */
export function composePrompt(
  prompt: string | undefined,
  suffix: string | undefined,
): string | undefined {
  const initial = prompt?.trim() ?? '';
  const shared = suffix?.trim() ?? '';

  if (initial === '' || shared === '') {
    return prompt;
  }

  return `${initial}\n\n${shared}`;
}
