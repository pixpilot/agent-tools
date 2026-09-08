/** Parses JSON with line comments, block comments and trailing commas. */
const BLOCK_COMMENT_MARKER_LENGTH = 2;
export function parseJsonc(contents: string, filePath: string): unknown {
  try {
    return JSON.parse(removeTrailingCommas(stripComments(contents)));
  } catch (cause) {
    throw new SyntaxError(
      `Invalid JSON or JSONC in ${filePath}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

function stripComments(contents: string): string {
  let output = '';
  let quote: '"' | "'" | undefined;
  let escaped = false;

  for (let index = 0; index < contents.length; index += 1) {
    const current = contents[index] ?? '';
    const next = contents[index + 1] ?? '';

    if (quote != null) {
      output += current;
      if (escaped) escaped = false;
      else if (current === '\\') escaped = true;
      else if (current === quote) quote = undefined;
    }

    else if (current === '"' || current === "'") {
      quote = current;
      output += current;
    } else if (current === '/' && next === '/') {
      while (index < contents.length && contents[index] !== '\n') index += 1;
      output += '\n';
    } else if (current === '/' && next === '*') {
      index += BLOCK_COMMENT_MARKER_LENGTH;
      while (index < contents.length && !(contents[index] === '*' && contents[index + 1] === '/')) {
        if (contents[index] === '\n') output += '\n';
        index += 1;
      }
      index += 1;
    } else {
      output += current;
    }
  }

  return output;
}

function removeTrailingCommas(contents: string): string {
  return contents.replace(/,\s*(?=[}\]])/gu, '');
}
