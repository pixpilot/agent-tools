import type { ReasoningEffort } from './reasoning-effort';
import { isReasoningEffort } from './reasoning-effort';

/** A model name with the reasoning effort it should run at, when one is given. */
export interface ModelSpec {
  model?: string | undefined;
  effort?: ReasoningEffort | undefined;
}

/**
 * Splits the `<model>:<effort>` shorthand accepted by `--model` and by
 * `agents.jsonc`.
 *
 * The suffix is only taken as an effort when it is one of the known levels, so
 * model names that legitimately contain `:` or `/` - `vendor/model:tag`,
 * `provider/name` - survive untouched. That keeps the name an opaque
 * pass-through, which is the whole contract of `--model`.
 */
export function parseModelSpec(value: string | undefined): ModelSpec {
  const spec = value?.trim();

  if (spec == null || spec === '') {
    return {};
  }

  const separator = spec.lastIndexOf(':');

  if (separator <= 0) {
    return { model: spec };
  }

  const suffix = spec.slice(separator + 1).toLowerCase();

  if (!isReasoningEffort(suffix)) {
    return { model: spec };
  }

  return { model: spec.slice(0, separator), effort: suffix };
}
