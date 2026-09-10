import { describe, expect, it } from 'vitest';
import { parseModelSpec } from '../../src/agents/parse-model-spec';

describe('parseModelSpec', () => {
  it('should return nothing for a missing or blank value', () => {
    expect(parseModelSpec(undefined)).toEqual({});
    expect(parseModelSpec('   ')).toEqual({});
  });

  it('should split a recognized effort suffix off the model name', () => {
    expect(parseModelSpec('gpt-5.1-codex-max:high')).toEqual({
      model: 'gpt-5.1-codex-max',
      effort: 'high',
    });
    expect(parseModelSpec('  opus:XHIGH  ')).toEqual({ model: 'opus', effort: 'xhigh' });
  });

  it('should keep a suffix that is not a known effort level', () => {
    expect(parseModelSpec('vendor/model:latest')).toEqual({
      model: 'vendor/model:latest',
    });
    expect(parseModelSpec('anthropic/claude-sonnet-4.5')).toEqual({
      model: 'anthropic/claude-sonnet-4.5',
    });
  });

  it('should only split on the last colon, so a tagged name keeps its prefix', () => {
    expect(parseModelSpec('vendor/model:latest:low')).toEqual({
      model: 'vendor/model:latest',
      effort: 'low',
    });
  });

  it('should not treat a leading colon as a separator', () => {
    expect(parseModelSpec(':high')).toEqual({ model: ':high' });
  });
});
