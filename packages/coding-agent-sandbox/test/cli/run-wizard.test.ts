import type { Mock } from 'vitest';
import { confirm, input, select } from '@inquirer/prompts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectDefaultRepo } from '../../src/cli/detect-default-repo';
import { runWizard } from '../../src/cli/run-wizard';

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
  input: vi.fn(),
  select: vi.fn(),
}));

vi.mock('../../src/cli/detect-default-repo', () => ({
  detectDefaultRepo: vi.fn(() => '/detected/repo'),
}));

// The real prompts return a cancelable promise; the mocks only need the answer.
const selectMock = select as unknown as Mock<(config: unknown) => Promise<unknown>>;
const inputMock = input as unknown as Mock<(config: unknown) => Promise<string>>;
const confirmMock = confirm as unknown as Mock<(config: unknown) => Promise<boolean>>;

/** Queues answers in the order the wizard asks for them. */
function queue(answers: {
  select: readonly unknown[];
  input: readonly string[];
  confirm?: readonly boolean[];
}): void {
  let selects = 0;
  let inputs = 0;
  let confirms = 0;
  selectMock.mockImplementation(async () => answers.select[selects++]);
  inputMock.mockImplementation(async () => answers.input[inputs++] ?? '');
  confirmMock.mockImplementation(async () => answers.confirm?.[confirms++] ?? true);
}

describe('runWizard', () => {
  beforeEach(() => {
    selectMock.mockReset();
    inputMock.mockReset();
    confirmMock.mockReset();
    vi.mocked(detectDefaultRepo).mockClear();
  });

  it('should short-circuit on prune without asking anything else', async () => {
    queue({ select: ['prune'], input: [] });

    await expect(runWizard()).resolves.toStrictEqual({ action: 'prune' });
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(inputMock).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('should collect a full online session', async () => {
    queue({
      select: ['online', 'codex', true],
      input: ['/work/app', 'fix login', '/skills'],
      confirm: [false],
    });

    await expect(runWizard()).resolves.toStrictEqual({
      action: 'session',
      options: {
        agent: 'codex',
        repo: '/work/app',
        task: 'fix login',
        skillsDir: '/skills',
        fullAccess: false,
        gitMount: true,
        offline: false,
      },
    });
  });

  it('should skip the skills question for an offline session', async () => {
    queue({
      select: ['offline', 'claude', false],
      input: ['/work/app', 'fix login'],
    });

    await expect(runWizard()).resolves.toStrictEqual({
      action: 'session',
      options: {
        agent: 'claude',
        repo: '/work/app',
        task: 'fix login',
        skillsDir: undefined,
        fullAccess: true,
        gitMount: false,
        offline: true,
      },
    });
    expect(inputMock).toHaveBeenCalledTimes(2);
  });

  it('should offer the detected repository as the default', async () => {
    queue({ select: ['online', 'claude', true], input: ['', 'fix login', '/skills'] });

    await runWizard();

    expect(inputMock.mock.calls[0]?.[0]).toMatchObject({ default: '/detected/repo' });
  });
});
